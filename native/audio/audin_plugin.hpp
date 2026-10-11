#pragma once
#include "audin_dvc.hpp"

namespace bridge::audio {
// Pinned static AUDIN plugin/listener owner. No worker activation. Retire on the
// constructing RDP thread before joining; preserve wrapper until host Terminated.
class AudinRegistration {
  template <class Api> struct Box {
    Api api{};
    AudinRegistration *owner;
    explicit Box(AudinRegistration *value) : owner(value) {}
  };
  Box<IDRDYNVC_ENTRY_POINTS> entries_{this};
  Box<IWTSPlugin> plugin_{this};
  Box<IWTSVirtualChannelManager> manager_{this};
  Box<IWTSListenerCallback> listener_{this};
  AudinSource &source_;
  AudinDvcGate gate_;
  rdpContext *context_;
  std::thread::id thread_;
  IDRDYNVC_ENTRY_POINTS *host_ = nullptr;
  IWTSPlugin *delegate_ = nullptr;
  IWTSVirtualChannelManager *host_manager_ = nullptr;
  IWTSListener *host_listener_ = nullptr;
  IWTSListenerCallback *delegate_listener_ = nullptr;
  IWTSListener fallback_{};
  char name_[6] = "audin", backend_[12] = "sys:browser";
  char *values_[2]{name_, backend_};
  ADDIN_ARGV args_{2, values_};
  std::atomic<bool> retired_{false};
  bool attempted_ = false, registered_ = false, initialized_ = false, listener_ready_ = false;
  bool channel_used_ = false, busy_ = false, destroying_ = false, ended_ = false;
  UINT cleanup_ = CHANNEL_RC_OK;
  template <class Api> static AudinRegistration &get(Api *) noexcept;
  bool on_thread() const noexcept;
  UINT initialize(IWTSVirtualChannelManager *) noexcept;
  UINT notify(UINT (*)(IWTSPlugin *), bool stop = false) noexcept;
  UINT disconnect(DWORD) noexcept;
  UINT create_listener(const char *, ULONG, IWTSListenerCallback *, IWTSListener **) noexcept;
  UINT destroy_listener(IWTSListener *) noexcept;
  UINT new_channel(IWTSVirtualChannel *, BYTE *, BOOL *, IWTSVirtualChannelCallback **) noexcept;

public:
  AudinRegistration(rdpContext &, AudinSource &) noexcept;
  AudinRegistration(const AudinRegistration &) = delete;
  AudinRegistration &operator=(const AudinRegistration &) = delete;
  ~AudinRegistration();
  bool ready_for(rdpContext &, AudinSource &) const noexcept;
  // Native-only injected entry must follow pinned cleanup-on-failure semantics.
  UINT install(IDRDYNVC_ENTRY_POINTS *, PDVC_PLUGIN_ENTRY = nullptr) noexcept;
  UINT retire() noexcept;
  bool retired() const noexcept { return retired_.load(std::memory_order_acquire); }
  AudinDvcGate &gate() noexcept { return gate_; }
};
} // namespace bridge::audio
