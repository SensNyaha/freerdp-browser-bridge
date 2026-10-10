#pragma once
#include "dvc_gate.hpp"
#include <atomic>
#include <freerdp/client/rdpei.h>

namespace bridge::touch {
// One pinned addin/listener/channel lifetime, owned by the RDP thread. Must outlive
// the host's Terminated call; destruction is not host unregistration. No input API.
class PluginRegistration {
  template <class Api> struct Box {
    Api api{};
    PluginRegistration *owner;
    explicit Box(PluginRegistration *value) : owner(value) {}
  };
  Box<IDRDYNVC_ENTRY_POINTS> entries_{this};
  Box<IWTSPlugin> plugin_{this};
  Box<IWTSVirtualChannelManager> manager_{this};
  Box<IWTSListenerCallback> listener_callback_{this};
  DvcGate gate_;
  IWTSListener fallback_{};
  IDRDYNVC_ENTRY_POINTS *host_ = nullptr;
  IWTSPlugin *delegate_ = nullptr;
  IWTSVirtualChannelManager *host_manager_ = nullptr;
  IWTSListenerCallback *delegate_listener_ = nullptr;
  IWTSListener *host_listener_ = nullptr;
  rdpContext *context_ = nullptr;
  std::thread::id thread_;
  bool attempted_ = false, registered_ = false, initialized_ = false;
  bool channel_used_ = false, busy_ = false, listener_ready_ = false;
  UINT listener_cleanup_ = CHANNEL_RC_OK;
  std::atomic<bool> retired_{false};
  UINT retirement_result_ = CHANNEL_RC_OK;
  template <class Api> static PluginRegistration &get(Api *api) noexcept;
  bool on_thread() const noexcept;
  UINT initialize(IWTSVirtualChannelManager *) noexcept;
  UINT notify(UINT (*)(IWTSPlugin *)) noexcept;
  UINT disconnect(DWORD) noexcept;
  UINT terminate() noexcept;
  UINT create_listener(const char *, ULONG, IWTSListenerCallback *, IWTSListener **) noexcept;
  UINT destroy_listener(IWTSListener *) noexcept;
  UINT new_channel(IWTSVirtualChannel *, BYTE *, BOOL *, IWTSVirtualChannelCallback **) noexcept;

public:
  PluginRegistration() noexcept;
  PluginRegistration(const PluginRegistration &) = delete;
  PluginRegistration &operator=(const PluginRegistration &) = delete;
  ~PluginRegistration();
  // Default loads the pinned static RDPEI entry. Explicit entry is native test injection.
  // An injected entry must expose RdpeiClientContext and preserve the pinned
  // entry's cleanup-on-error contract. Multi-pen injection is disabled by this owner.
  UINT install(IDRDYNVC_ENTRY_POINTS *, PDVC_PLUGIN_ENTRY entry = nullptr) noexcept;
  // End all delegated resources on the RDP thread, before joining it. The wrapper
  // remains alive for the host's later Terminated call on the context-free thread.
  // No concurrent destruction/callbacks; release/acquire publishes only this no-op.
  UINT retire() noexcept;
  bool retired() const noexcept { return retired_.load(std::memory_order_acquire); }
  const DvcGate &gate() const noexcept { return gate_; }
  DvcGate &gate() noexcept { return gate_; }
  RdpeiClientContext *client() const noexcept;
};
} // namespace bridge::touch
