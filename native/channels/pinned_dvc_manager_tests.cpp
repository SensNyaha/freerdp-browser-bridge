#include "pinned_dvc_manager.hpp"
#include <catch2/catch_test_macros.hpp>
#include <freerdp/client/channels.h>
#include <memory>
#include <stdexcept>
#include <winpr/error.h>
using namespace bridge::channels;
namespace {
struct Fixture {
  struct Box {
    IWTSVirtualChannelManager api{};
    Fixture *owner;
  } original{{}, this};
  IWTSListener listener{};
  IWTSVirtualChannel channel{};
  IWTSListenerCallback callback{};
  unsigned creates = 0, destroys = 0, finds = 0;
  ULONG flags = 0;
  IWTSListenerCallback *received_callback = nullptr;
  UINT status = CHANNEL_RC_OK;
  bool dangling = false, null_success = false, throw_create = false, throw_destroy = false,
       throw_find = false;
  std::unique_ptr<PinnedDvcManager> facade;
  Fixture() {
    original.api.CreateListener = [](IWTSVirtualChannelManager *p, const char *, ULONG flags,
                                     IWTSListenerCallback *callback, IWTSListener **out) -> UINT {
      auto &f = *reinterpret_cast<Box *>(p)->owner;
      ++f.creates;
      f.flags = flags;
      f.received_callback = callback;
      *out = &f.listener;
      if (f.dangling) {
        auto temporary = std::make_unique<IWTSListener>();
        *out = temporary.get();
        temporary
            .reset(); // Exact pinned failure-output lifetime; must never be inspected/destroyed.
      }
      if (f.null_success)
        *out = nullptr;
      if (f.throw_create)
        throw std::runtime_error("fixture");
      return f.status;
    };
    original.api.DestroyListener = [](IWTSVirtualChannelManager *p,
                                      IWTSListener *listener) -> UINT {
      auto &f = *reinterpret_cast<Box *>(p)->owner;
      ++f.destroys;
      if (f.throw_destroy)
        throw std::runtime_error("fixture");
      return listener == &f.listener ? CHANNEL_RC_OK : ERROR_INVALID_PARAMETER;
    };
    original.api.FindChannelById = [](IWTSVirtualChannelManager *p,
                                      UINT32 id) -> IWTSVirtualChannel * {
      auto &f = *reinterpret_cast<Box *>(p)->owner;
      ++f.finds;
      if (f.throw_find)
        throw std::runtime_error("fixture");
      return id == 42 ? &f.channel : nullptr;
    };
    original.api.GetChannelId = [](IWTSVirtualChannel *) -> UINT32 { return 42; };
    original.api.GetChannelName = [](IWTSVirtualChannel *) -> const char * { return "fixture"; };
    callback.OnNewChannelConnection = [](IWTSListenerCallback *, IWTSVirtualChannel *, BYTE *,
                                         BOOL *, IWTSVirtualChannelCallback **) -> UINT {
      return CHANNEL_RC_OK;
    };
    facade = std::make_unique<PinnedDvcManager>(original.api);
  }
  UINT create(IWTSListener **out) {
    return facade->interface()->CreateListener(facade->interface(), "fixture", 42, &callback, out);
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
    "Pinned public manager facade preserves successful listener and actual delegate identities") {
  Fixture f;
  auto *api = f.facade->interface();
  IWTSListener *listener = nullptr;
  REQUIRE(f.create(&listener) == CHANNEL_RC_OK);
  REQUIRE(listener == &f.listener);
  REQUIRE(f.flags == 42);
  REQUIRE(f.received_callback == &f.callback);
  REQUIRE(api->GetChannelId == f.original.api.GetChannelId);
  REQUIRE(api->GetChannelName == f.original.api.GetChannelName);
  REQUIRE(api->FindChannelById(api, 42) == &f.channel);
  REQUIRE(f.finds == 1);
  REQUIRE(api->DestroyListener(api, listener) == CHANNEL_RC_OK);
  REQUIRE(f.destroys == 1);
}
TEST_CASE("Pinned failed listener output is normalized to stable fallback without dangling pointer "
          "access") {
  for (unsigned failure = 0; failure < 3; ++failure) {
    Fixture f;
    f.status = ERROR_INTERNAL_ERROR;
    f.dangling = true;
    f.throw_create = failure == 1;
    f.null_success = failure == 2;
    if (failure == 2)
      f.status = CHANNEL_RC_OK;
    IWTSListener *listener = nullptr;
    const UINT expected = failure == 2 ? ERROR_INVALID_DATA : ERROR_INTERNAL_ERROR;
    REQUIRE(f.create(&listener) == expected);
    REQUIRE(listener);
    REQUIRE(listener != &f.listener);
    listener->pInterface = &f; // Same dereference as actual generic Initialize, valid on error.
    void *properties = &f;
    REQUIRE(listener->GetConfiguration(listener, &properties) == ERROR_INVALID_STATE);
    REQUIRE(properties == nullptr);
    REQUIRE(f.facade->interface()->DestroyListener(f.facade->interface(), listener) ==
            CHANNEL_RC_OK);
    REQUIRE(f.destroys == 0);
  }
}
TEST_CASE("Pinned public manager facade refuses invalid input and retired delegation") {
  Fixture f;
  auto *api = f.facade->interface();
  IWTSListener *listener = nullptr;
  REQUIRE(api->CreateListener(api, nullptr, 0, &f.callback, &listener) == ERROR_INVALID_PARAMETER);
  REQUIRE(listener);
  REQUIRE(f.creates == 0);
  REQUIRE(f.create(nullptr) == ERROR_INVALID_PARAMETER);
  f.facade->retire();
  REQUIRE(f.create(&listener) == ERROR_INVALID_STATE);
  REQUIRE(api->DestroyListener(api, listener) ==
          CHANNEL_RC_OK); // Fallback is still safe for delayed cleanup.
  REQUIRE(api->DestroyListener(api, &f.listener) == ERROR_INVALID_STATE);
  REQUIRE(api->FindChannelById(api, 42) == nullptr);
  REQUIRE(api->GetChannelId == nullptr);
  REQUIRE(api->GetChannelName == nullptr);
  REQUIRE(f.destroys == 0);
  IWTSVirtualChannelManager missing{};
  REQUIRE_THROWS_AS(PinnedDvcManager(missing), std::invalid_argument);
}
TEST_CASE(
    "Pinned public manager facade catches delegate exceptions without retry or output disclosure") {
  Fixture f;
  auto *api = f.facade->interface();
  f.throw_destroy = true;
  REQUIRE(api->DestroyListener(api, &f.listener) == ERROR_INTERNAL_ERROR);
  REQUIRE(f.destroys == 1);
  f.throw_find = true;
  REQUIRE(api->FindChannelById(api, 42) == nullptr);
  REQUIRE(f.finds == 1);
}
TEST_CASE("Actual pinned public generic addin safely initializes and terminates with normalized "
          "listener failure") {
  for (bool failure : {false, true}) {
    Fixture f;
    f.status = failure ? ERROR_INTERNAL_ERROR : CHANNEL_RC_OK;
    f.dangling = failure;
    GenericHost host;
    IWTSVirtualChannelCallback callbacks{};
    callbacks.OnDataReceived = [](IWTSVirtualChannelCallback *, wStream *) -> UINT {
      return CHANNEL_RC_OK;
    };
    REQUIRE(freerdp_generic_DVCPluginEntry(&host.entries.api, "com.freerdp.bridge.fixture",
                                           "fixture", sizeof(GENERIC_DYNVC_PLUGIN),
                                           sizeof(GENERIC_CHANNEL_CALLBACK), &callbacks, nullptr,
                                           nullptr) == CHANNEL_RC_OK);
    if (!host.plugin || !host.plugin->Initialize || !host.plugin->Terminated)
      throw std::runtime_error("Missing pinned generic callbacks");
    const UINT expected = failure ? ERROR_INTERNAL_ERROR : CHANNEL_RC_OK;
    REQUIRE(host.plugin->Initialize(host.plugin, f.facade->interface()) == expected);
    REQUIRE(host.plugin->Terminated(host.plugin) == CHANNEL_RC_OK);
    host.plugin = nullptr;
    REQUIRE(f.destroys == (failure ? 0U : 1U));
  }
}
