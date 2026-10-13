#include "dvc_plugin_registry.hpp"
#include <catch2/catch_test_macros.hpp>
#include <cstdlib>
#include <cstring>
#include <freerdp/client/channels.h>
#include <freerdp/freerdp.h>
#include <stdexcept>
#include <winpr/error.h>
using namespace bridge::channels;
namespace {
struct Fixture {
  struct Points {
    IDRDYNVC_ENTRY_POINTS api{};
    Fixture *owner;
  } points{{}, this};
  struct Manager {
    IWTSVirtualChannelManager api{};
    Fixture *owner;
  } manager{{}, this};
  std::array<IWTSPlugin *, 2> published{};
  std::array<const char *, 2> published_names{};
  std::array<IWTSListener, 2> listeners{};
  std::array<IWTSListenerCallback *, 2> factories{};
  IWTSVirtualChannel channel{};
  IWTSVirtualChannelCallback callbacks{};
  rdpContext context{};
  char selected[128] = "first";
  char *argv[1]{selected};
  ADDIN_ARGV args{1, argv};
  unsigned entries = 0, registrations = 0, creates = 0, destroys = 0;
  IWTSPlugin *observed_original = nullptr;
  UINT register_status = CHANNEL_RC_OK;
  bool throw_register = false, retain_failed = false, identities = true;
  DvcChannelRegistry channels{clock, this};
  DvcPluginRegistry registry{channels, clock, this, 2};
  static inline thread_local Fixture *active = nullptr;
  Fixture() {
    active = this;
    points.api.GetPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *name) -> IWTSPlugin * {
      auto &f = *reinterpret_cast<Points *>(p)->owner;
      for (std::size_t index = 0; index < f.published.size(); ++index)
        if (f.published[index] && std::strcmp(f.published_names[index], name) == 0)
          return f.published[index];
      return nullptr;
    };
    points.api.GetPluginData = [](IDRDYNVC_ENTRY_POINTS *p) -> const ADDIN_ARGV * {
      return &reinterpret_cast<Points *>(p)->owner->args;
    };
    points.api.GetRdpContext = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpContext * {
      return &reinterpret_cast<Points *>(p)->owner->context;
    };
    points.api.GetRdpSettings = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpSettings * {
      return reinterpret_cast<Points *>(p)->owner->context.settings;
    };
    points.api.RegisterPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *name,
                                   IWTSPlugin *plugin) -> UINT {
      auto &f = *reinterpret_cast<Points *>(p)->owner;
      const auto index = f.registrations++;
      if (index >= f.published.size())
        return ERROR_NOT_ENOUGH_MEMORY;
      if (f.register_status == CHANNEL_RC_OK || f.retain_failed) {
        f.published[index] = plugin;
        f.published_names[index] = name;
      }
      if (f.throw_register)
        throw std::runtime_error("fixture");
      return f.register_status;
    };
    manager.api.CreateListener = [](IWTSVirtualChannelManager *p, const char *, ULONG,
                                    IWTSListenerCallback *callback, IWTSListener **out) -> UINT {
      auto &f = *reinterpret_cast<Manager *>(p)->owner;
      if (f.creates >= f.listeners.size())
        return ERROR_NOT_ENOUGH_MEMORY;
      const auto index = f.creates++;
      f.factories[index] = callback;
      *out = &f.listeners[index];
      return CHANNEL_RC_OK;
    };
    manager.api.DestroyListener = [](IWTSVirtualChannelManager *p, IWTSListener *listener) -> UINT {
      auto &f = *reinterpret_cast<Manager *>(p)->owner;
      ++f.destroys;
      for (std::size_t index = 0; index < f.listeners.size(); ++index)
        if (listener == &f.listeners[index]) {
          f.factories[index] = nullptr;
          return CHANNEL_RC_OK;
        }
      return ERROR_INVALID_PARAMETER;
    };
    manager.api.GetChannelId = [](IWTSVirtualChannel *) -> UINT32 { return 42; };
    manager.api.GetChannelName = [](IWTSVirtualChannel *) -> const char * { return "fixture"; };
    callbacks.OnDataReceived = [](IWTSVirtualChannelCallback *, wStream *) -> UINT {
      return CHANNEL_RC_OK;
    };
    callbacks.OnClose = [](IWTSVirtualChannelCallback *p) -> UINT {
      std::free(reinterpret_cast<GENERIC_CHANNEL_CALLBACK *>(p));
      return CHANNEL_RC_OK;
    };
  }
  ~Fixture() {
    (void)registry.retire(); // Close callback targets before the generic plugin frees state.
    for (auto *&plugin : published) {
      if (plugin)
        (void)plugin->Terminated(plugin);
      plugin = nullptr;
    }
    factories.fill(nullptr); // Final fake host unpublication, not an uncertain retry.
    (void)registry.host_unpublished();
    active = nullptr;
  }
  static std::uint64_t clock(void *) { return 1; }
  static UINT VCAPITYPE entry(IDRDYNVC_ENTRY_POINTS *p) {
    auto &f = *active;
    ++f.entries;
    f.identities = f.identities && p->GetPluginData(p) == &f.args &&
                   p->GetRdpContext(p) == &f.context && p->GetRdpSettings(p) == f.context.settings;
    const auto status = freerdp_generic_DVCPluginEntry(
        p, "com.freerdp.bridge.registry", f.selected, sizeof(GENERIC_DYNVC_PLUGIN),
        sizeof(GENERIC_CHANNEL_CALLBACK), &f.callbacks, nullptr, nullptr);
    f.observed_original = p->GetPlugin(p, f.selected);
    return status;
  }
  UINT install(const char *name) {
    const auto length = std::strlen(name);
    if (length >= sizeof(selected))
      return ERROR_INVALID_PARAMETER;
    std::memcpy(selected, name, length + 1);
    return registry.install(points.api, entry);
  }
};
} // namespace
TEST_CASE(
    "Public DVC entry registry projects original entry getters and retains stable host names") {
  Fixture f;
  REQUIRE(f.install("first") == CHANNEL_RC_OK);
  REQUIRE(f.install("second") == CHANNEL_RC_OK);
  REQUIRE(f.identities);
  REQUIRE(std::strcmp(f.published_names[0], "first") == 0);
  REQUIRE(std::strcmp(f.published_names[1], "second") == 0);
  REQUIRE(f.registry.stats().retained_plugins == 2);
  REQUIRE(f.published[0]->Initialize(f.published[0], &f.manager.api) == CHANNEL_RC_OK);
  REQUIRE(f.published[1]->Initialize(f.published[1], &f.manager.api) == CHANNEL_RC_OK);
  REQUIRE(f.creates == 2);
  BOOL accept = TRUE;
  IWTSVirtualChannelCallback *out = nullptr;
  REQUIRE(f.factories[0]->OnNewChannelConnection(f.factories[0], &f.channel, nullptr, &accept,
                                                 &out) == CHANNEL_RC_OK);
  REQUIRE(accept);
  REQUIRE(out);
  REQUIRE(f.channels.stats().bindings == 1);
  REQUIRE(f.registry.host_unpublished() == ERROR_INVALID_STATE);
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
}
TEST_CASE("Public DVC entry registry GetPlugin returns original generic plugin instead of bridge "
          "wrapper") {
  Fixture f;
  REQUIRE(f.install("first") == CHANNEL_RC_OK);
  const auto original = f.observed_original;
  REQUIRE(original);
  REQUIRE(original != f.published[0]);
  // The actual generic entry privately extends IWTSPlugin and checks GetPlugin.
  // It must see the original allocation, never the proxy structure.
  REQUIRE(f.install("first") == CHANNEL_RC_ALREADY_INITIALIZED);
  REQUIRE(f.observed_original == original);
  REQUIRE(f.entries == 2);
  REQUIRE(f.registrations == 1);
  REQUIRE(f.registry.stats().failed);
}
TEST_CASE("Public DVC entry registry bounds retained plugin slots before entering another addin") {
  Fixture f;
  REQUIRE(f.install("first") == CHANNEL_RC_OK);
  REQUIRE(f.install("second") == CHANNEL_RC_OK);
  REQUIRE(f.install("third") == ERROR_NOT_ENOUGH_MEMORY);
  REQUIRE(f.entries == 2);
  REQUIRE(f.registrations == 2);
}
TEST_CASE("Public DVC entry registry failed host publication retires original and retains inert "
          "late callback") {
  for (bool exception : {false, true}) {
    Fixture f;
    f.register_status = ERROR_ACCESS_DENIED;
    f.throw_register = exception;
    f.retain_failed = true;
    const UINT expected = exception ? ERROR_INTERNAL_ERROR : ERROR_ACCESS_DENIED;
    REQUIRE(f.install("first") == expected);
    REQUIRE(f.published[0]);
    REQUIRE(f.registry.stats().retained_plugins == 1);
    REQUIRE(f.registry.stats().failed);
    // The actual generic original has already self-freed after failed publication.
    REQUIRE(f.published[0]->Initialize(f.published[0], &f.manager.api) == ERROR_INVALID_STATE);
    REQUIRE(f.published[0]->Terminated(f.published[0]) == CHANNEL_RC_OK);
    REQUIRE(f.published[0]->Terminated(f.published[0]) == CHANNEL_RC_OK);
    REQUIRE(f.creates == 0);
  }
}
TEST_CASE("Public DVC entry registry refuses manager migration and preserves required cleanup") {
  Fixture f;
  REQUIRE(f.install("first") == CHANNEL_RC_OK);
  REQUIRE(f.install("second") == CHANNEL_RC_OK);
  REQUIRE(f.published[0]->Initialize(f.published[0], &f.manager.api) == CHANNEL_RC_OK);
  IWTSVirtualChannelManager other = f.manager.api;
  REQUIRE(f.published[1]->Initialize(f.published[1], &other) == ERROR_INVALID_DATA);
  REQUIRE(f.registry.stats().failed);
  REQUIRE(f.creates == 1);
  REQUIRE(f.registry.retire() == ERROR_INTERNAL_ERROR);
}
TEST_CASE("Public DVC entry registry requires actual host unpublication and rejects invalid "
          "construction") {
  Fixture f;
  REQUIRE(f.install("first") == CHANNEL_RC_OK);
  REQUIRE(f.registry.host_unpublished() == ERROR_INVALID_STATE);
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
  REQUIRE(f.published[0]->Terminated(f.published[0]) == CHANNEL_RC_OK);
  f.published.fill(nullptr);
  REQUIRE(f.registry.host_unpublished() == CHANNEL_RC_OK);
  REQUIRE(f.registry.stats().host_unpublished);
  REQUIRE(f.install("second") == ERROR_INVALID_STATE);
  REQUIRE_THROWS_AS(DvcPluginRegistry(f.channels, Fixture::clock, &f, 0), std::invalid_argument);
  REQUIRE_THROWS_AS(DvcPluginRegistry(f.channels, Fixture::clock, &f, 33), std::invalid_argument);
  REQUIRE_THROWS_AS(DvcPluginRegistry(f.channels, nullptr), std::invalid_argument);
}

TEST_CASE("Public DVC entry registry validates name boundary before retaining factory ownership") {
  for (std::size_t length : {0U, 127U, 128U}) {
    Fixture f;
    std::array<char, 129> name{};
    std::fill_n(name.begin(), length, 'x');
    if (length == 127) {
      REQUIRE(f.install(name.data()) == CHANNEL_RC_OK);
      REQUIRE(std::strlen(f.published_names[0]) == 127);
    } else {
      const auto entry = +[](IDRDYNVC_ENTRY_POINTS *p) -> UINT {
        std::array<char, 129> invalid{};
        if (Fixture::active->selected[0])
          std::fill_n(invalid.begin(), 128, 'x');
        IWTSPlugin raw{};
        return p->RegisterPlugin(p, invalid.data(), &raw);
      };
      f.selected[0] = length ? 'x' : 0;
      REQUIRE(f.registry.install(f.points.api, entry) == ERROR_INVALID_PARAMETER);
      REQUIRE(f.registrations == 0);
      REQUIRE(f.registry.stats().retained_plugins == 0);
    }
  }
}
TEST_CASE("Production DVC manager resolver requires public channel identity and name APIs") {
  for (bool missing_name : {false, true}) {
    Fixture f;
    REQUIRE(f.install("first") == CHANNEL_RC_OK);
    if (missing_name)
      f.manager.api.GetChannelName = nullptr;
    else
      f.manager.api.GetChannelId = nullptr;
    REQUIRE(f.published[0]->Initialize(f.published[0], &f.manager.api) == ERROR_INVALID_DATA);
    REQUIRE(f.creates == 0);
    REQUIRE(f.registry.stats().failed);
  }
}
