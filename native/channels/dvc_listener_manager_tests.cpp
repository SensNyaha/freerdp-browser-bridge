#include "dvc_listener_manager.hpp"
#include <catch2/catch_test_macros.hpp>
#include <freerdp/client/channels.h>
#include <stdexcept>
#include <winpr/error.h>
using namespace bridge::channels;
namespace {
struct Fixture {
  struct Box {
    IWTSVirtualChannelManager api{};
    Fixture *owner;
  } native{{}, this};
  IWTSListener listener{};
  IWTSListenerCallback factory{};
  IWTSVirtualChannel channel{};
  IWTSVirtualChannelCallback target{};
  DvcChannelRegistry registry{clock, this};
  std::unique_ptr<DvcListenerManager> facade;
  IWTSListenerCallback *published = nullptr;
  unsigned creates = 0, destroys = 0, closes = 0;
  UINT create_status = CHANNEL_RC_OK, destroy_status = CHANNEL_RC_OK, nested = 0;
  bool cancel_create = false, destroy_in_factory = false, throw_destroy = false;
  Fixture() {
    native.api.CreateListener = [](IWTSVirtualChannelManager *p, const char *, ULONG,
                                   IWTSListenerCallback *callback, IWTSListener **out) -> UINT {
      auto &f = *reinterpret_cast<Box *>(p)->owner;
      ++f.creates;
      *out = &f.listener;
      if (f.create_status == CHANNEL_RC_OK)
        f.published = callback;
      else
        *out = reinterpret_cast<IWTSListener *>(static_cast<std::uintptr_t>(1));
      if (f.cancel_create)
        f.facade->close();
      return f.create_status;
    };
    native.api.DestroyListener = [](IWTSVirtualChannelManager *p, IWTSListener *listener) -> UINT {
      auto &f = *reinterpret_cast<Box *>(p)->owner;
      ++f.destroys;
      if (listener != &f.listener)
        return ERROR_INVALID_PARAMETER;
      if (f.throw_destroy)
        throw std::runtime_error("fixture");
      if (f.destroy_status == CHANNEL_RC_OK)
        f.published = nullptr;
      return f.destroy_status;
    };
    native.api.GetChannelId = [](IWTSVirtualChannel *) -> UINT32 { return 42; };
    native.api.FindChannelById = [](IWTSVirtualChannelManager *p, UINT32) -> IWTSVirtualChannel * {
      return &reinterpret_cast<Box *>(p)->owner->channel;
    };
    factory.pInterface = this;
    factory.OnNewChannelConnection = [](IWTSListenerCallback *p, IWTSVirtualChannel *, BYTE *,
                                        BOOL *, IWTSVirtualChannelCallback **out) -> UINT {
      auto &f = *static_cast<Fixture *>(p->pInterface);
      // Exact pinned generic behavior: leave the host's default acceptance untouched.
      *out = &f.target;
      if (f.destroy_in_factory)
        f.nested = f.facade->interface()->DestroyListener(f.facade->interface(), &f.listener);
      return CHANNEL_RC_OK;
    };
    target.pInterface = this;
    target.OnDataReceived = [](IWTSVirtualChannelCallback *, wStream *) -> UINT {
      return CHANNEL_RC_OK;
    };
    target.OnClose = [](IWTSVirtualChannelCallback *p) -> UINT {
      ++static_cast<Fixture *>(p->pInterface)->closes;
      return CHANNEL_RC_OK;
    };
    facade = std::make_unique<DvcListenerManager>(native.api, registry, clock, this, 1);
  }
  ~Fixture() {
    // Fake host teardown, not retry: unpublish native pointers before releasing proxies.
    published = nullptr;
    (void)registry.retire();
    (void)facade->host_unpublished();
  }
  static std::uint64_t clock(void *) { return 1; }
  UINT create(IWTSListener **out, const char *name = "fixture") {
    auto *api = facade->interface();
    return api->CreateListener(api, name, 0, &factory, out);
  }
  UINT destroy(IWTSListener *value) {
    auto *api = facade->interface();
    return api->DestroyListener(api, value);
  }
};
struct GenericHost {
  struct Box {
    IDRDYNVC_ENTRY_POINTS api{};
    GenericHost *owner;
  } entries{{}, this};
  IWTSPlugin *plugin = nullptr;
  GenericHost() {
    entries.api.GetPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *) -> IWTSPlugin * {
      return reinterpret_cast<Box *>(p)->owner->plugin;
    };
    entries.api.RegisterPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *,
                                    IWTSPlugin *plugin) -> UINT {
      reinterpret_cast<Box *>(p)->owner->plugin = plugin;
      return CHANNEL_RC_OK;
    };
  }
  ~GenericHost() {
    if (plugin)
      (void)plugin->Terminated(plugin);
  }
};
} // namespace
TEST_CASE(
    "DVC listener manager automatically wraps factories and retains accepted channel ownership") {
  Fixture f;
  IWTSListener *listener = nullptr;
  REQUIRE(f.create(&listener) == CHANNEL_RC_OK);
  REQUIRE(listener == &f.listener);
  REQUIRE(f.published != &f.factory);
  BOOL accept = TRUE;
  IWTSVirtualChannelCallback *out = nullptr;
  REQUIRE(f.published->OnNewChannelConnection(f.published, &f.channel, nullptr, &accept, &out) ==
          CHANNEL_RC_OK);
  REQUIRE(accept);
  REQUIRE(out != &f.target);
  REQUIRE(f.registry.owns_callback(f.target));
  REQUIRE(f.destroy(listener) == CHANNEL_RC_OK);
  REQUIRE(f.facade->stats().live_listeners == 0);
  REQUIRE(f.closes == 0); // Listener destruction does not retire accepted channels.
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
  REQUIRE(f.closes == 1);
  REQUIRE(f.facade->retire() == CHANNEL_RC_OK);
}
TEST_CASE("DVC listener manager bounds allocation and duplicate native listener names") {
  Fixture f;
  IWTSListener *listener = nullptr, *fallback = nullptr;
  REQUIRE(f.create(&listener) == CHANNEL_RC_OK);
  REQUIRE(f.create(&fallback) == ERROR_ALREADY_EXISTS);
  REQUIRE(f.create(&fallback, "second") == ERROR_NOT_ENOUGH_MEMORY);
  REQUIRE(fallback != listener);
  REQUIRE(f.creates == 1);
  REQUIRE(f.destroy(fallback) == CHANNEL_RC_OK);
  REQUIRE(f.destroys == 0);
  REQUIRE(f.destroy(listener) == CHANNEL_RC_OK);
  REQUIRE(f.create(&listener, "second") == CHANNEL_RC_OK);
  REQUIRE(f.creates == 2);
  REQUIRE(f.destroy(listener) == CHANNEL_RC_OK);
}
TEST_CASE("DVC listener manager preserves stable failure output and closes late created listener "
          "admission") {
  for (bool cancel : {false, true}) {
    Fixture f;
    f.cancel_create = cancel;
    f.create_status = cancel ? CHANNEL_RC_OK : ERROR_ACCESS_DENIED;
    IWTSListener *listener = nullptr;
    const UINT expected = cancel ? CHANNEL_RC_OK : ERROR_ACCESS_DENIED;
    REQUIRE(f.create(&listener) == expected);
    REQUIRE(listener);
    listener->pInterface = &f;
    if (cancel) {
      BOOL accept = TRUE;
      IWTSVirtualChannelCallback *out = nullptr;
      REQUIRE(f.published->OnNewChannelConnection(f.published, &f.channel, nullptr, &accept,
                                                  &out) == ERROR_INVALID_STATE);
      REQUIRE_FALSE(accept);
      REQUIRE(f.facade->retire() == ERROR_INVALID_STATE);
    }
    REQUIRE(f.destroy(listener) == CHANNEL_RC_OK);
    REQUIRE(f.destroys == (cancel ? 1U : 0U));
    REQUIRE_FALSE(f.facade->stats().failed);
  }
}
TEST_CASE("DVC listener manager defers native destruction until factory callback returns") {
  Fixture f;
  IWTSListener *listener = nullptr;
  REQUIRE(f.create(&listener) == CHANNEL_RC_OK);
  f.destroy_in_factory = true;
  BOOL accept = TRUE;
  IWTSVirtualChannelCallback *out = nullptr;
  REQUIRE(f.published->OnNewChannelConnection(f.published, &f.channel, nullptr, &accept, &out) ==
          CHANNEL_RC_OK);
  REQUIRE(f.nested == ERROR_IO_PENDING);
  REQUIRE(f.destroys == 0);
  REQUIRE(f.destroy(listener) == CHANNEL_RC_OK);
  REQUIRE(f.destroys == 1);
}
TEST_CASE("DVC listener manager retains failed destruction without uncertain retry until host "
          "unpublication") {
  for (bool exception : {false, true}) {
    Fixture f;
    IWTSListener *listener = nullptr;
    REQUIRE(f.create(&listener) == CHANNEL_RC_OK);
    f.throw_destroy = exception;
    f.destroy_status = ERROR_ACCESS_DENIED;
    const UINT expected = exception ? ERROR_INTERNAL_ERROR : ERROR_ACCESS_DENIED;
    REQUIRE(f.destroy(listener) == expected);
    REQUIRE(f.destroy(listener) == expected);
    REQUIRE(f.destroys == 1);
    REQUIRE(f.facade->stats().live_listeners == 1);
    REQUIRE(f.facade->stats().failed);
    REQUIRE(f.facade->retire() == ERROR_INVALID_STATE);
    f.published = nullptr; // Simulated final host teardown guarantee.
    REQUIRE(f.facade->host_unpublished() == ERROR_INTERNAL_ERROR);
    REQUIRE(f.facade->stats().retired);
    REQUIRE(f.facade->stats().live_listeners == 0);
  }
}
TEST_CASE(
    "Actual pinned generic addin leaves acceptance unchanged and cleans wrapped native listener") {
  Fixture f;
  GenericHost host;
  IWTSVirtualChannelCallback callbacks{};
  callbacks.OnDataReceived = [](IWTSVirtualChannelCallback *, wStream *) -> UINT {
    return CHANNEL_RC_OK;
  };
  callbacks.OnClose = [](IWTSVirtualChannelCallback *p) -> UINT {
    // GENERIC_CHANNEL_CALLBACK is a public SDK type, allocated by the actual generic factory.
    std::free(reinterpret_cast<GENERIC_CHANNEL_CALLBACK *>(p));
    return CHANNEL_RC_OK;
  };
  REQUIRE(freerdp_generic_DVCPluginEntry(&host.entries.api, "com.freerdp.bridge.fixture", "fixture",
                                         sizeof(GENERIC_DYNVC_PLUGIN),
                                         sizeof(GENERIC_CHANNEL_CALLBACK), &callbacks, nullptr,
                                         nullptr) == CHANNEL_RC_OK);
  REQUIRE(host.plugin->Initialize(host.plugin, f.facade->interface()) == CHANNEL_RC_OK);
  BOOL accept = TRUE;
  IWTSVirtualChannelCallback *out = nullptr;
  REQUIRE(f.published->OnNewChannelConnection(f.published, &f.channel, nullptr, &accept, &out) ==
          CHANNEL_RC_OK);
  REQUIRE(accept);
  REQUIRE(out);
  REQUIRE(f.registry.stats().bindings == 1);
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK); // Channel callback still needs live plugin.
  REQUIRE(host.plugin->Terminated(host.plugin) == CHANNEL_RC_OK);
  host.plugin = nullptr;
  REQUIRE(f.destroys == 1);
  REQUIRE(f.facade->retire() == CHANNEL_RC_OK);
}
