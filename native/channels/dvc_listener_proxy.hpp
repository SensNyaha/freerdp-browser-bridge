#pragma once
#include "dvc_channel_handoff.hpp"
namespace bridge::channels {
struct DvcListenerProxyStats {
  std::uint64_t calls = 0, accepted = 0, refused = 0, faults = 0;
  UINT last_status = 0, cleanup_status = 0;
  bool closed = false, busy = false, failed = false;
};
// Borrowed public listener only; caller retains factory/manager/registry and this
// proxy through host unpublication and callback return. close does not destroy
// the native listener or retire any plugin.
class DvcListenerProxy final {
public:
  DvcListenerProxy(DvcChannelRegistry &, IWTSVirtualChannelManager &, IWTSListenerCallback &,
                   DvcCompletionHook::Clock, void *clock_context = nullptr);
  ~DvcListenerProxy();
  DvcListenerProxy(const DvcListenerProxy &) = delete;
  DvcListenerProxy &operator=(const DvcListenerProxy &) = delete;
  IWTSListenerCallback *interface() noexcept { return &box_.api; }
  void close() noexcept { stats_.closed = true; }
  DvcListenerProxyStats stats() const noexcept { return stats_; }

private:
  struct Box {
    IWTSListenerCallback api{};
    DvcListenerProxy *owner;
  } box_;
  DvcChannelRegistry &registry_;
  IWTSVirtualChannelManager &manager_;
  IWTSListenerCallback &original_;
  const DvcCompletionHook::Clock clock_;
  void *const clock_context_;
  DvcListenerProxyStats stats_;
  static UINT on_new(IWTSListenerCallback *, IWTSVirtualChannel *, BYTE *, BOOL *,
                     IWTSVirtualChannelCallback **) noexcept;
  UINT create(IWTSVirtualChannel *, BYTE *, BOOL *, IWTSVirtualChannelCallback **) noexcept;
  UINT fault(UINT) noexcept;
};
} // namespace bridge::channels
