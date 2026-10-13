#include "dvc_provider.hpp"
#include <bit>
#include <catch2/catch_test_macros.hpp>
#include <cstring>
#include <freerdp/client.h>
#include <memory>
#include <stdexcept>
#include <string>
#include <thread>
#include <winpr/error.h>
using namespace bridge::channels;
namespace {
BOOL VCAPITYPE static_entry(PCHANNEL_ENTRY_POINTS) { return FALSE; }
struct Fixture {
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{
      nullptr, freerdp_client_context_free};
  AddinScope parent;
  DvcChannelRegistry channels{clock};
  DvcPluginRegistry registry{channels, clock};
  DvcProvider provider{registry};
  struct Points {
    IDRDYNVC_ENTRY_POINTS api{};
    Fixture *owner;
  } points{{}, this};
  char name[128] = "fixture";
  char *values[1]{name};
  ADDIN_ARGV args{1, values};
  unsigned loads = 0, enters = 0;
  DWORD last_flags = 0;
  const char *last_subsystem = nullptr, *last_type = nullptr;
  bool wrong_context = false;
  static inline thread_local Fixture *active = nullptr;
  Fixture() {
    RDP_CLIENT_ENTRY_POINTS config{};
    config.Size = sizeof(config);
    config.Version = RDP_CLIENT_INTERFACE_VERSION;
    config.ContextSize = sizeof(rdpClientContext);
    context.reset(freerdp_client_context_new(&config));
    if (!context)
      throw std::runtime_error("Missing fixture context");
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_SynchronousDynamicChannels, TRUE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_AsyncChannels, FALSE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_AsyncUpdate, FALSE));
    active = this;
    REQUIRE(parent.bind(*context, load) == CHANNEL_RC_OK);
    points.api.GetPluginData = [](IDRDYNVC_ENTRY_POINTS *p) -> const ADDIN_ARGV * {
      return &reinterpret_cast<Points *>(p)->owner->args;
    };
    points.api.GetRdpContext = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpContext * {
      auto &f = *reinterpret_cast<Points *>(p)->owner;
      return f.wrong_context ? nullptr : f.context.get();
    };
    points.api.GetRdpSettings = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpSettings * {
      return reinterpret_cast<Points *>(p)->owner->context->settings;
    };
    points.api.GetPlugin = [](IDRDYNVC_ENTRY_POINTS *, const char *) -> IWTSPlugin * {
      return nullptr;
    };
    points.api.RegisterPlugin = [](IDRDYNVC_ENTRY_POINTS *, const char *, IWTSPlugin *) -> UINT {
      return CHANNEL_RC_OK;
    };
  }
  ~Fixture() {
    (void)provider.close();
    (void)registry.retire();
    (void)registry.host_unpublished();
    (void)parent.close();
    active = nullptr;
  }
  static std::uint64_t clock(void *) { return 1; }
  static UINT VCAPITYPE dynamic_entry(IDRDYNVC_ENTRY_POINTS *) {
    ++active->enters;
    return ERROR_ACCESS_DENIED; // No plugin allocation/transfer in this fixture.
  }
  static PVIRTUALCHANNELENTRY load(LPCSTR name, LPCSTR subsystem, LPCSTR type, DWORD flags) {
    ++active->loads;
    active->last_flags = flags;
    active->last_subsystem = subsystem;
    active->last_type = type;
    if (subsystem || type || flags != FREERDP_ADDIN_CHANNEL_DYNAMIC)
      return static_entry;
    if (!name || std::strcmp(name, "missing") == 0)
      return nullptr;
    return std::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PDVC_PLUGIN_ENTRY>(dynamic_entry));
  }
  PDVC_PLUGIN_ENTRY select(const char *value, DWORD flags = FREERDP_ADDIN_CHANNEL_DYNAMIC) {
    return std::bit_cast<PDVC_PLUGIN_ENTRY>(
        freerdp_get_current_addin_provider()(value, nullptr, nullptr, flags));
  }
};
} // namespace
TEST_CASE("Scoped public DVC provider preserves other ABIs and routes cached dynamic entry by "
          "actual args") {
  Fixture f;
  REQUIRE(f.provider.bind(*f.context) == CHANNEL_RC_OK);
  const auto current = freerdp_get_current_addin_provider();
  REQUIRE(current("device", "browser", nullptr, 0) == static_entry);
  auto entry = f.select("fixture");
  REQUIRE(entry);
  REQUIRE(entry != Fixture::dynamic_entry);
  const auto loads = f.loads;
  REQUIRE(f.select("fixture") == entry);
  REQUIRE(f.loads == loads);
  REQUIRE(entry(&f.points.api) == ERROR_ACCESS_DENIED);
  REQUIRE(f.enters == 1);
  REQUIRE(f.provider.close() == ERROR_INTERNAL_ERROR);
  REQUIRE_FALSE(f.provider.bound());
  REQUIRE(freerdp_get_current_addin_provider() == Fixture::load);
  REQUIRE(entry(&f.points.api) == ERROR_INVALID_STATE);
}
TEST_CASE(
    "Scoped public DVC provider returns nonnull refusal for missing or invalid dynamic loads") {
  Fixture f;
  REQUIRE(f.provider.bind(*f.context) == CHANNEL_RC_OK);
  for (const char *name : {"missing", ""}) {
    auto entry = f.select(name);
    REQUIRE(entry);
    REQUIRE(entry(nullptr) == ERROR_NOT_SUPPORTED);
  }
  auto entry = f.select("fixture", FREERDP_ADDIN_CHANNEL_DYNAMIC | FREERDP_ADDIN_CHANNEL_STATIC);
  REQUIRE(entry);
  REQUIRE(entry(nullptr) == ERROR_NOT_SUPPORTED);
  REQUIRE(f.enters == 0);
}
TEST_CASE("Scoped DVC provider preserves nested dynamic backend ABI and original selectors") {
  Fixture f;
  REQUIRE(f.provider.bind(*f.context) == CHANNEL_RC_OK);
  const auto current = freerdp_get_current_addin_provider();
  for (unsigned i = 0; i < 40; ++i) {
    REQUIRE(current("rdpsnd", "fake", nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC) == static_entry);
    REQUIRE(f.last_flags == FREERDP_ADDIN_CHANNEL_DYNAMIC);
    REQUIRE(std::strcmp(f.last_subsystem, "fake") == 0);
    REQUIRE(f.last_type == nullptr);
  }
  REQUIRE(current("fixture", nullptr, "decoder", FREERDP_ADDIN_CHANNEL_DYNAMIC) == static_entry);
  REQUIRE(f.last_subsystem == nullptr);
  REQUIRE(std::strcmp(f.last_type, "decoder") == 0);
  REQUIRE(f.enters == 0);
  REQUIRE(f.registry.stats().retained_plugins == 0);
  REQUIRE(f.select("fixture")); // Backend lookups have not consumed the 32 DVC entry slots.
  REQUIRE(f.provider.close() == CHANNEL_RC_OK);
}
TEST_CASE(
    "Scoped public DVC provider bounds fixed cached addin inventory before another delegate load") {
  Fixture f;
  REQUIRE(f.provider.bind(*f.context) == CHANNEL_RC_OK);
  for (unsigned index = 0; index < 32; ++index)
    REQUIRE(f.select(("fixture-" + std::to_string(index)).c_str()));
  REQUIRE(f.loads == 32);
  auto entry = f.select("overflow");
  REQUIRE(entry);
  REQUIRE(entry(nullptr) == ERROR_NOT_SUPPORTED);
  REQUIRE(f.loads == 32);
}
TEST_CASE(
    "Scoped public DVC provider validates context and argument correlation before entry dispatch") {
  Fixture f;
  REQUIRE(f.provider.bind(*f.context) == CHANNEL_RC_OK);
  auto entry = f.select("fixture");
  REQUIRE(entry);
  f.wrong_context = true;
  REQUIRE(entry(&f.points.api) == ERROR_INVALID_PARAMETER);
  f.wrong_context = false;
  f.args.argc = 65;
  REQUIRE(entry(&f.points.api) == ERROR_INVALID_PARAMETER);
  f.args.argc = 1;
  f.name[0] = 'x';
  REQUIRE(entry(&f.points.api) == ERROR_NOT_SUPPORTED);
  REQUIRE(f.enters == 0);
  REQUIRE_FALSE(f.registry.stats().failed);
}
TEST_CASE("Scoped public DVC provider requires synchronous profile and serialized owner thread") {
  Fixture f;
  REQUIRE(
      freerdp_settings_set_bool(f.context->settings, FreeRDP_SynchronousDynamicChannels, FALSE));
  REQUIRE(f.provider.bind(*f.context) == ERROR_INVALID_PARAMETER);
  REQUIRE(freerdp_settings_set_bool(f.context->settings, FreeRDP_SynchronousDynamicChannels, TRUE));
  REQUIRE(f.provider.bind(*f.context) == CHANNEL_RC_OK);
  const auto load = freerdp_get_current_addin_provider();
  UINT status = CHANNEL_RC_OK, close = CHANNEL_RC_OK;
  std::thread foreign([&] {
    const auto entry = std::bit_cast<PDVC_PLUGIN_ENTRY>(
        load("fixture", nullptr, nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC));
    status = entry(nullptr);
    close = f.provider.close();
  });
  foreign.join();
  REQUIRE(status == ERROR_NOT_SUPPORTED);
  REQUIRE(close == ERROR_INVALID_STATE);
  REQUIRE(f.provider.bound());
  REQUIRE(f.provider.close() == CHANNEL_RC_OK);
  REQUIRE(f.provider.bind(*f.context) == ERROR_INVALID_STATE);
}
