#include "../compat/bit.hpp"
#include "addin_provider.hpp"
#include <catch2/catch_test_macros.hpp>
#include <cstring>
#include <freerdp/client.h>
#include <freerdp/client/channels.h>
#include <memory>
#include <stdexcept>
#include <thread>
#include <winpr/error.h>
using namespace bridge::touch;
namespace {
struct ProviderGuard {
  FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN previous = freerdp_get_current_addin_provider();
  ~ProviderGuard() { (void)freerdp_register_addin_provider(previous, 0); }
};
struct Host {
  IDRDYNVC_ENTRY_POINTS api{};
  rdpContext *context = nullptr;
  IWTSPlugin *plugin = nullptr;
  unsigned registrations = 0;
  bool throw_context = false;
  static Host &get(IDRDYNVC_ENTRY_POINTS *p) { return *reinterpret_cast<Host *>(p); }
  explicit Host(rdpContext *value) : context(value) {
    api.GetRdpContext = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpContext * {
      if (get(p).throw_context)
        throw std::runtime_error("fixture");
      return get(p).context;
    };
    api.GetRdpSettings = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpSettings * {
      return get(p).context->settings;
    };
    api.GetPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *) -> IWTSPlugin * {
      return get(p).plugin;
    };
    api.RegisterPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *, IWTSPlugin *plugin) -> UINT {
      auto &host = get(p);
      ++host.registrations;
      host.plugin = plugin;
      return CHANNEL_RC_OK;
    };
  }
};
struct Fixture {
  ProviderGuard restore;
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{
      nullptr, freerdp_client_context_free};
  PluginRegistration registration;
  AddinProvider provider;
  Fixture() {
    RDP_CLIENT_ENTRY_POINTS points{};
    points.Size = sizeof(points);
    points.Version = RDP_CLIENT_INTERFACE_VERSION;
    points.ContextSize = sizeof(rdpClientContext);
    context.reset(freerdp_client_context_new(&points));
    REQUIRE(context);
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_SynchronousDynamicChannels, TRUE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_AsyncChannels, FALSE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_AsyncUpdate, FALSE));
  }
  UINT bind() { return provider.bind(*context, registration); }
  static PVIRTUALCHANNELENTRY load(const char *name = RDPEI_CHANNEL_NAME,
                                   const char *subsystem = nullptr, const char *type = nullptr,
                                   DWORD flags = FREERDP_ADDIN_CHANNEL_DYNAMIC) {
    const auto callback = freerdp_get_current_addin_provider();
    REQUIRE(callback);
    return callback(name, subsystem, type, flags);
  }
  static UINT enter(PVIRTUALCHANNELENTRY entry, Host &host) {
    REQUIRE(entry);
    return ::bridge::compat::bit_cast<PDVC_PLUGIN_ENTRY>(entry)(&host.api);
  }
};
struct Previous {
  static inline unsigned calls = 0;
  static inline bool throws = false;
  static inline AddinProvider *scope = nullptr;
  static inline PVIRTUALCHANNELENTRY nested = nullptr;
  static inline UINT closed = CHANNEL_RC_OK;
  static PVIRTUALCHANNELENTRY load(LPCSTR name, LPCSTR subsystem, LPCSTR type, DWORD flags) {
    ++calls;
    if (throws)
      throw std::runtime_error("fixture");
    if (scope) {
      const auto callback = freerdp_get_current_addin_provider();
      nested = callback(RDPEI_CHANNEL_NAME, nullptr, nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC);
      closed = scope->close();
    }
    return freerdp_channels_load_static_addin_entry(name, subsystem, type, flags);
  }
  static void reset() {
    calls = 0;
    throws = false;
    scope = nullptr;
    nested = nullptr;
    closed = CHANNEL_RC_OK;
  }
};
} // namespace
TEST_CASE("RDPEI scoped provider preserves and restores the existing public provider") {
  Fixture f;
  const auto original = freerdp_get_current_addin_provider();
  const auto disp = original("disp", nullptr, nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC);
  REQUIRE(disp);
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  REQUIRE(freerdp_get_current_addin_provider() != original);
  REQUIRE(Fixture::load("disp") == disp);
  Host host(f.context.get());
  const auto entry = freerdp_load_channel_addin_entry(RDPEI_CHANNEL_NAME, nullptr, nullptr,
                                                      FREERDP_ADDIN_CHANNEL_DYNAMIC);
  REQUIRE(Fixture::enter(entry, host) == CHANNEL_RC_OK);
  REQUIRE(host.registrations == 1);
  REQUIRE(host.plugin->pInterface == f.registration.client());
  REQUIRE(Fixture::enter(entry, host) == ERROR_INVALID_STATE);
  REQUIRE(f.provider.close() == CHANNEL_RC_OK);
  REQUIRE(f.registration.retired());
  REQUIRE(freerdp_get_current_addin_provider() == original);
  REQUIRE(Fixture::enter(entry, host) == ERROR_INVALID_STATE);
  REQUIRE(host.plugin->Terminated(host.plugin) == CHANNEL_RC_OK);
  REQUIRE(f.provider.close() == CHANNEL_RC_OK);
  REQUIRE(f.bind() == ERROR_INVALID_STATE);
}
TEST_CASE("RDPEI scoped provider rejects invalid profile and overlapping process scopes") {
  Fixture first, second;
  rdpContext missing{};
  REQUIRE(first.provider.bind(missing, first.registration) == ERROR_INVALID_PARAMETER);
  for (const auto key :
       {FreeRDP_SynchronousDynamicChannels, FreeRDP_AsyncChannels, FreeRDP_AsyncUpdate}) {
    REQUIRE(freerdp_settings_set_bool(first.context->settings, key,
                                      key == FreeRDP_SynchronousDynamicChannels ? FALSE : TRUE));
    REQUIRE(first.bind() == ERROR_INVALID_PARAMETER);
    REQUIRE(freerdp_settings_set_bool(first.context->settings, key,
                                      key == FreeRDP_SynchronousDynamicChannels ? TRUE : FALSE));
  }
  REQUIRE(first.bind() == CHANNEL_RC_OK);
  const auto current = freerdp_get_current_addin_provider();
  REQUIRE(first.bind() == ERROR_INVALID_STATE);
  REQUIRE(second.bind() == ERROR_INVALID_STATE);
  REQUIRE(freerdp_get_current_addin_provider() == current);
  REQUIRE(first.provider.close() == CHANNEL_RC_OK);
  REQUIRE(second.bind() == CHANNEL_RC_OK);
  REQUIRE(second.provider.close() == CHANNEL_RC_OK);
}
TEST_CASE("RDPEI provider verifies the public entry context and denies selector fallback") {
  Fixture f;
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  Host wrong(nullptr);
  const auto entry = Fixture::load();
  REQUIRE(Fixture::enter(entry, wrong) == ERROR_INVALID_PARAMETER);
  REQUIRE(wrong.registrations == 0);
  Host host(f.context.get());
  host.throw_context = true;
  REQUIRE(Fixture::enter(entry, host) == ERROR_INTERNAL_ERROR);
  host.throw_context = false;
  REQUIRE(::bridge::compat::bit_cast<PDVC_PLUGIN_ENTRY>(entry)(nullptr) == ERROR_INVALID_PARAMETER);
  REQUIRE(Fixture::enter(Fixture::load(RDPEI_CHANNEL_NAME, "unexpected"), host) ==
          ERROR_INVALID_STATE);
  REQUIRE(Fixture::enter(Fixture::load(RDPEI_CHANNEL_NAME, nullptr, "unexpected"), host) ==
          ERROR_INVALID_STATE);
  REQUIRE(host.registrations == 0);
  REQUIRE(Fixture::enter(entry, host) == CHANNEL_RC_OK);
  REQUIRE(f.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.plugin->Terminated(host.plugin) == CHANNEL_RC_OK);
}
TEST_CASE(
    "RDPEI provider rejects foreign entry and close while permitting later host termination") {
  Fixture f;
  Host host(f.context.get());
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  const auto callback = freerdp_get_current_addin_provider();
  const auto entry = Fixture::load();
  UINT loaded = CHANNEL_RC_OK, cached = CHANNEL_RC_OK, closed = CHANNEL_RC_OK;
  std::thread foreign([&] {
    const auto refused =
        callback(RDPEI_CHANNEL_NAME, nullptr, nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC);
    loaded = refused ? ::bridge::compat::bit_cast<PDVC_PLUGIN_ENTRY>(refused)(&host.api) : ERROR_INVALID_DATA;
    cached = ::bridge::compat::bit_cast<PDVC_PLUGIN_ENTRY>(entry)(&host.api);
    closed = f.provider.close();
  });
  foreign.join();
  REQUIRE(loaded == ERROR_INVALID_STATE);
  REQUIRE(cached == ERROR_INVALID_STATE);
  REQUIRE(closed == ERROR_INVALID_STATE);
  REQUIRE(host.registrations == 0);
  REQUIRE(Fixture::enter(entry, host) == CHANNEL_RC_OK);
  REQUIRE(f.provider.close() == CHANNEL_RC_OK);
  std::thread context_free([&] { closed = host.plugin->Terminated(host.plugin); });
  context_free.join();
  REQUIRE(closed == CHANNEL_RC_OK);
}
TEST_CASE("RDPEI provider forwards other addin classes and bounds lookup reentry and exceptions") {
  Fixture f;
  Previous::reset();
  REQUIRE(freerdp_register_addin_provider(Previous::load, 0) == 0);
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  REQUIRE(Fixture::load("disp"));
  REQUIRE(Previous::calls == 1);
  // Non-DVC RDPEI requests remain the existing provider's responsibility.
  (void)Fixture::load(RDPEI_CHANNEL_NAME, nullptr, nullptr, FREERDP_ADDIN_CHANNEL_STATIC);
  REQUIRE(Previous::calls == 2);
  Previous::throws = true;
  REQUIRE(Fixture::load("disp") == nullptr);
  Previous::throws = false;
  Previous::scope = &f.provider;
  REQUIRE(Fixture::load("disp"));
  Host host(f.context.get());
  REQUIRE(Fixture::enter(Previous::nested, host) == ERROR_INVALID_STATE);
  REQUIRE(Previous::closed == ERROR_INVALID_STATE);
  REQUIRE_FALSE(f.registration.retired());
  Previous::scope = nullptr;
  REQUIRE(f.provider.close() == CHANNEL_RC_OK);
  REQUIRE(freerdp_get_current_addin_provider() == Previous::load);
}
TEST_CASE("RDPEI provider detects replacement without overwriting another provider") {
  Fixture f;
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  Host host(f.context.get());
  const auto entry = Fixture::load();
  REQUIRE(Fixture::enter(entry, host) == CHANNEL_RC_OK);
  REQUIRE(freerdp_register_addin_provider(Previous::load, 0) == 0);
  REQUIRE(Fixture::enter(entry, host) == ERROR_INVALID_STATE);
  REQUIRE(f.provider.close() == ERROR_INVALID_STATE);
  REQUIRE(f.registration.retired());
  REQUIRE(freerdp_get_current_addin_provider() == Previous::load);
  REQUIRE(host.plugin->Terminated(host.plugin) == CHANNEL_RC_OK);
  REQUIRE(f.provider.close() == CHANNEL_RC_OK);
}
TEST_CASE("RDPEI scoped provider RAII retires an unopened actual addin and restores null") {
  Fixture f;
  REQUIRE(freerdp_register_addin_provider(nullptr, 0) == 0);
  Host host(f.context.get());
  {
    AddinProvider local;
    REQUIRE(local.bind(*f.context, f.registration) == CHANNEL_RC_OK);
    REQUIRE(Fixture::enter(Fixture::load(), host) == CHANNEL_RC_OK);
    REQUIRE(f.registration.client());
  }
  REQUIRE(f.registration.retired());
  REQUIRE(freerdp_get_current_addin_provider() == nullptr);
  REQUIRE(host.plugin->Terminated(host.plugin) == CHANNEL_RC_OK);
}
TEST_CASE("RDPEI actual addin cleanup precedes context free after joining its RDP thread") {
  Fixture f;
  Host host(f.context.get());
  const auto original = freerdp_get_current_addin_provider();
  UINT bound = ERROR_INVALID_STATE, installed = ERROR_INVALID_STATE, closed = ERROR_INVALID_STATE;
  bool had_client = false;
  std::thread rdp([&] {
    bound = f.bind();
    if (bound != CHANNEL_RC_OK)
      return;
    const auto entry = freerdp_load_channel_addin_entry(RDPEI_CHANNEL_NAME, nullptr, nullptr,
                                                        FREERDP_ADDIN_CHANNEL_DYNAMIC);
    if (entry)
      installed = ::bridge::compat::bit_cast<PDVC_PLUGIN_ENTRY>(entry)(&host.api);
    had_client = f.registration.client() != nullptr;
    closed = f.provider.close();
  });
  rdp.join();
  REQUIRE(bound == CHANNEL_RC_OK);
  REQUIRE(installed == CHANNEL_RC_OK);
  REQUIRE(had_client);
  REQUIRE(closed == CHANNEL_RC_OK);
  REQUIRE(f.registration.retired());
  REQUIRE(freerdp_get_current_addin_provider() == original);
  REQUIRE(host.plugin->Terminated(host.plugin) == CHANNEL_RC_OK);
  REQUIRE(host.plugin->pInterface == nullptr);
  f.context.reset();
  REQUIRE(host.plugin->Terminated(host.plugin) == CHANNEL_RC_OK);
}
