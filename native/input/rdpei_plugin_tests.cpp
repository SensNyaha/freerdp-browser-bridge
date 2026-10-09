#include "rdpei_plugin.hpp"
#include <catch2/catch_test_macros.hpp>
#include <freerdp/client.h>
#include <memory>
#include <stdexcept>
#include <thread>
#include <winpr/error.h>
using namespace bridge::touch;
namespace {
struct Fixture {
  template <class Api> struct Box {
    Api api{};
    Fixture *owner;
  };
  Box<IDRDYNVC_ENTRY_POINTS> host{{}, this};
  Box<IWTSVirtualChannelManager> manager{{}, this};
  PluginRegistration registration;
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{
      nullptr, freerdp_client_context_free};
  RdpeiClientContext client{};
  IWTSPlugin original{}, *registered = nullptr;
  IWTSListenerCallback listener_callback{};
  IWTSListener listener{}, *delegated_listener = nullptr;
  IWTSVirtualChannelManager *delegated_manager = nullptr;
  UINT register_status = CHANNEL_RC_OK, create_status = CHANNEL_RC_OK;
  UINT destroy_status = CHANNEL_RC_OK, terminate_status = CHANNEL_RC_OK;
  unsigned entries = 0, registrations = 0, initializes = 0, terminations = 0;
  unsigned creations = 0, destructions = 0, notifications = 0;
  DWORD disconnect_code = 0;
  bool partial = true, throw_register = false, throw_notify = false, fail_entry = false;
  bool entry_without_plugin = false, wrong_listener = false;
  bool throw_create = false, throw_destroy = false, wrong_plugin_name = false;
  static inline thread_local Fixture *active_entry = nullptr;
  Fixture() {
    RDP_CLIENT_ENTRY_POINTS points{};
    points.Size = sizeof(points);
    points.Version = RDP_CLIENT_INTERFACE_VERSION;
    points.ContextSize = sizeof(rdpClientContext);
    context.reset(freerdp_client_context_new(&points));
    REQUIRE(context);
    boolean(FreeRDP_SynchronousDynamicChannels, TRUE);
    boolean(FreeRDP_AsyncChannels, FALSE);
    boolean(FreeRDP_AsyncUpdate, FALSE);
    client.custom = this;
    original.pInterface = &client;
    host.api.GetPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *) -> IWTSPlugin * {
      return reinterpret_cast<Box<IDRDYNVC_ENTRY_POINTS> *>(p)->owner->registered;
    };
    host.api.GetRdpContext = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpContext * {
      return reinterpret_cast<Box<IDRDYNVC_ENTRY_POINTS> *>(p)->owner->context.get();
    };
    host.api.GetRdpSettings = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpSettings * {
      return reinterpret_cast<Box<IDRDYNVC_ENTRY_POINTS> *>(p)->owner->context->settings;
    };
    host.api.RegisterPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *,
                                 IWTSPlugin *plugin) -> UINT {
      auto &f = *reinterpret_cast<Box<IDRDYNVC_ENTRY_POINTS> *>(p)->owner;
      ++f.registrations;
      if (f.throw_register)
        throw std::runtime_error("fixture");
      if (f.register_status == CHANNEL_RC_OK)
        f.registered = plugin;
      return f.register_status;
    };
    original.Initialize = [](IWTSPlugin *p, IWTSVirtualChannelManager *m) -> UINT {
      auto &f = owner(p);
      ++f.initializes;
      f.delegated_manager = m;
      const auto result =
          m->CreateListener(m, f.wrong_listener ? "unexpected" : RDPEI_DVC_CHANNEL_NAME, 0,
                            &f.listener_callback, &f.delegated_listener);
      REQUIRE(f.delegated_listener); // Same unconditional dereference as the pinned generic addin.
      f.delegated_listener->pInterface = &f.client;
      return result;
    };
    original.Terminated = [](IWTSPlugin *p) -> UINT {
      auto &f = owner(p);
      ++f.terminations;
      if (f.delegated_listener) {
        const auto status =
            f.delegated_manager->DestroyListener(f.delegated_manager, f.delegated_listener);
        (void)status; // Pinned generic termination ignores this; wrapper must retain its error.
        f.delegated_listener = nullptr;
      }
      return f.terminate_status;
    };
    original.Connected = original.Attached = original.Detached = [](IWTSPlugin *p) -> UINT {
      auto &f = owner(p);
      ++f.notifications;
      if (f.throw_notify)
        throw std::runtime_error("fixture");
      return CHANNEL_RC_OK;
    };
    original.Disconnected = [](IWTSPlugin *p, DWORD code) -> UINT {
      owner(p).disconnect_code = code;
      return CHANNEL_RC_OK;
    };
    listener_callback.OnNewChannelConnection =
        [](IWTSListenerCallback *, IWTSVirtualChannel *, BYTE *, BOOL *,
           IWTSVirtualChannelCallback **) -> UINT { return ERROR_NOT_SUPPORTED; };
    manager.api.CreateListener = [](IWTSVirtualChannelManager *m, const char *, ULONG,
                                    IWTSListenerCallback *, IWTSListener **out) -> UINT {
      auto &f = *reinterpret_cast<Box<IWTSVirtualChannelManager> *>(m)->owner;
      ++f.creations;
      *out = f.partial ? &f.listener : nullptr;
      if (f.throw_create)
        throw std::runtime_error("fixture");
      return f.create_status;
    };
    manager.api.DestroyListener = [](IWTSVirtualChannelManager *m, IWTSListener *) -> UINT {
      auto &f = *reinterpret_cast<Box<IWTSVirtualChannelManager> *>(m)->owner;
      ++f.destructions;
      if (f.throw_destroy)
        throw std::runtime_error("fixture");
      return f.destroy_status;
    };
  }
  ~Fixture() {
    if (registered)
      (void)registered->Terminated(registered);
  }
  static Fixture &owner(IWTSPlugin *p) {
    return *static_cast<Fixture *>(static_cast<RdpeiClientContext *>(p->pInterface)->custom);
  }
  static UINT VCAPITYPE entry(IDRDYNVC_ENTRY_POINTS *p) {
    auto &f = *active_entry;
    ++f.entries;
    REQUIRE(p->GetRdpContext(p) == f.context.get());
    REQUIRE(p->GetRdpSettings(p) == f.context->settings);
    REQUIRE(p->GetPluginData(p) == nullptr);
    if (f.entry_without_plugin)
      return CHANNEL_RC_OK;
    auto result = p->RegisterPlugin(p, f.wrong_plugin_name ? "unexpected" : RDPEI_DVC_CHANNEL_NAME,
                                    &f.original);
    if (result == CHANNEL_RC_OK && f.fail_entry)
      result = ERROR_INTERNAL_ERROR;
    if (result != CHANNEL_RC_OK)
      (void)f.original.Terminated(&f.original);
    return result;
  }
  UINT install() {
    active_entry = this;
    const auto result = registration.install(&host.api, entry);
    active_entry = nullptr;
    return result;
  }
  void boolean(FreeRDP_Settings_Keys_Bool key, BOOL value) {
    REQUIRE(freerdp_settings_set_bool(context->settings, key, value));
  }
};
} // namespace
TEST_CASE("RDPEI registration checks host and synchronous policy before invoking an entry") {
  for (const auto key :
       {FreeRDP_SynchronousDynamicChannels, FreeRDP_AsyncChannels, FreeRDP_AsyncUpdate}) {
    Fixture f;
    f.boolean(key, key == FreeRDP_SynchronousDynamicChannels ? FALSE : TRUE);
    REQUIRE(f.install() == ERROR_INVALID_PARAMETER);
    REQUIRE(f.entries == 0);
  }
  Fixture f;
  REQUIRE(f.registration.install(nullptr, Fixture::entry) == ERROR_INVALID_PARAMETER);
  f.host.api.RegisterPlugin = nullptr;
  REQUIRE(f.install() == ERROR_INVALID_PARAMETER);
  REQUIRE(f.entries == 0);
  Fixture existing;
  existing.registered = &existing.original;
  REQUIRE(existing.install() == CHANNEL_RC_ALREADY_INITIALIZED);
  REQUIRE(existing.entries == 0);
  existing.registered = nullptr;
}
TEST_CASE(
    "RDPEI registration owns successful entry output and cleans failed host registration once") {
  for (const bool throwing : {false, true}) {
    Fixture f;
    f.register_status = ERROR_ACCESS_DENIED;
    f.throw_register = throwing;
    REQUIRE(f.install() ==
            static_cast<UINT>(throwing ? ERROR_INTERNAL_ERROR : ERROR_ACCESS_DENIED));
    REQUIRE(f.terminations == 1);
    REQUIRE(f.registration.client() == nullptr);
    REQUIRE(f.install() == ERROR_INVALID_STATE);
    REQUIRE(f.terminations == 1);
  }
  Fixture entry_failure;
  entry_failure.fail_entry = true;
  REQUIRE(entry_failure.install() == ERROR_INTERNAL_ERROR);
  REQUIRE(entry_failure.terminations == 1);
  REQUIRE(entry_failure.registrations == 0);
  Fixture absent;
  absent.entry_without_plugin = true;
  REQUIRE(absent.install() == ERROR_INVALID_DATA);
  REQUIRE(absent.registrations == 0);
  Fixture wrong;
  wrong.wrong_plugin_name = true;
  REQUIRE(wrong.install() == ERROR_INVALID_PARAMETER);
  REQUIRE(wrong.terminations == 1);
  REQUIRE(wrong.registrations == 0);
}
TEST_CASE(
    "RDPEI registration forwards lifecycle and preserves context identity until termination") {
  Fixture f;
  REQUIRE(f.install() == CHANNEL_RC_OK);
  REQUIRE(f.registered != &f.original);
  REQUIRE(f.registered->pInterface == &f.client);
  REQUIRE(f.registration.client() == &f.client);
  REQUIRE(f.registered->Initialize(f.registered, nullptr) == ERROR_INVALID_PARAMETER);
  REQUIRE(f.registered->Initialize(f.registered, &f.manager.api) == CHANNEL_RC_OK);
  REQUIRE(f.listener.pInterface == &f.client);
  REQUIRE(f.registered->Initialize(f.registered, &f.manager.api) == ERROR_INVALID_STATE);
  REQUIRE(f.registered->Connected(f.registered) == CHANNEL_RC_OK);
  REQUIRE(f.registered->Attached(f.registered) == CHANNEL_RC_OK);
  REQUIRE(f.registered->Detached(f.registered) == CHANNEL_RC_OK);
  REQUIRE(f.notifications == 3);
  REQUIRE(f.registered->Disconnected(f.registered, 42) == CHANNEL_RC_OK);
  REQUIRE(f.disconnect_code == 42);
  REQUIRE(f.registered->Terminated(f.registered) == CHANNEL_RC_OK);
  REQUIRE(f.registered->pInterface == nullptr);
  REQUIRE(f.registration.client() == nullptr);
  REQUIRE(f.terminations == 1);
  REQUIRE(f.destructions == 1);
  REQUIRE(f.registered->Terminated(f.registered) == CHANNEL_RC_OK);
  REQUIRE(f.terminations == 1);
}
TEST_CASE("RDPEI partial listener cleanup surfaces errors ignored by the upstream termination") {
  Fixture f;
  REQUIRE(f.install() == CHANNEL_RC_OK);
  f.create_status = ERROR_INTERNAL_ERROR;
  f.destroy_status = ERROR_ACCESS_DENIED;
  REQUIRE(f.registered->Initialize(f.registered, &f.manager.api) == ERROR_INTERNAL_ERROR);
  REQUIRE(f.registered->Terminated(f.registered) == ERROR_ACCESS_DENIED);
  REQUIRE(f.destructions == 1);
  REQUIRE(f.terminations == 1);
  REQUIRE(f.registered->Terminated(f.registered) == ERROR_ACCESS_DENIED);
  REQUIRE(f.destructions == 1);
}
TEST_CASE(
    "RDPEI registration rejects unexpected listener names and converts lifecycle exceptions") {
  Fixture f;
  REQUIRE(f.install() == CHANNEL_RC_OK);
  f.wrong_listener = true;
  REQUIRE(f.registered->Initialize(f.registered, &f.manager.api) == ERROR_INVALID_PARAMETER);
  REQUIRE(f.creations == 0);
  f.throw_notify = true;
  REQUIRE(f.registered->Connected(f.registered) == ERROR_INTERNAL_ERROR);
  REQUIRE(f.registered->Terminated(f.registered) == CHANNEL_RC_OK);
  REQUIRE(f.destructions == 0);
}
TEST_CASE("RDPEI registration rejects foreign-thread lifecycle calls without ending the addin") {
  Fixture f;
  REQUIRE(f.install() == CHANNEL_RC_OK);
  UINT notified = 0, terminated = 0;
  RdpeiClientContext *client = &f.client;
  std::thread foreign([&] {
    notified = f.registered->Connected(f.registered);
    terminated = f.registered->Terminated(f.registered);
    client = f.registration.client();
  });
  foreign.join();
  REQUIRE(notified == ERROR_INVALID_STATE);
  REQUIRE(terminated == ERROR_INVALID_STATE);
  REQUIRE(client == nullptr);
  REQUIRE(f.terminations == 0);
  REQUIRE(f.registration.client() == &f.client);
}
TEST_CASE("RDPEI registration cleans partial listeners after host callback exceptions") {
  Fixture creation;
  REQUIRE(creation.install() == CHANNEL_RC_OK);
  creation.throw_create = true;
  REQUIRE(creation.registered->Initialize(creation.registered, &creation.manager.api) ==
          ERROR_INTERNAL_ERROR);
  REQUIRE(creation.registered->Terminated(creation.registered) == CHANNEL_RC_OK);
  REQUIRE(creation.destructions == 1);
  Fixture destruction;
  REQUIRE(destruction.install() == CHANNEL_RC_OK);
  REQUIRE(destruction.registered->Initialize(destruction.registered, &destruction.manager.api) ==
          CHANNEL_RC_OK);
  destruction.throw_destroy = true;
  REQUIRE(destruction.registered->Terminated(destruction.registered) == ERROR_INTERNAL_ERROR);
  REQUIRE(destruction.destructions == 1);
  REQUIRE(destruction.registration.client() == nullptr);
}
