#pragma once
#include <freerdp/dvc.h>

namespace bridge::channels {
struct DvcPluginProxyStats {
  bool initialize_attempted = false, closed = false, busy = false, ended = false, failed = false;
  UINT termination_status = 0;
};
// Borrows the host-owned plugin; the owner supplies one shared manager facade
// for all plugins and retains this proxy through host unpublication/call return.
// Does not register, free, or prematurely terminate the original plugin.
class DvcPluginProxy final {
public:
  using ManagerResolver = IWTSVirtualChannelManager *(*)(void *, IWTSVirtualChannelManager &);
  DvcPluginProxy(IWTSPlugin &, ManagerResolver, void *resolver_context = nullptr);
  ~DvcPluginProxy();
  DvcPluginProxy(const DvcPluginProxy &) = delete;
  DvcPluginProxy &operator=(const DvcPluginProxy &) = delete;
  IWTSPlugin *interface() noexcept { return &box_.api; }
  void close() noexcept { state_.closed = true; }
  DvcPluginProxyStats stats() const noexcept { return state_; }

private:
  struct Box {
    IWTSPlugin api{};
    DvcPluginProxy *owner;
  } box_;
  IWTSPlugin *original_;
  const ManagerResolver resolver_;
  void *const resolver_context_;
  DvcPluginProxyStats state_;
  static DvcPluginProxy &owner(IWTSPlugin *) noexcept;
  static UINT initialize(IWTSPlugin *, IWTSVirtualChannelManager *) noexcept;
  static UINT connected(IWTSPlugin *) noexcept;
  static UINT disconnected(IWTSPlugin *, DWORD) noexcept;
  static UINT attached(IWTSPlugin *) noexcept;
  static UINT detached(IWTSPlugin *) noexcept;
  static UINT terminated(IWTSPlugin *) noexcept;
  UINT notify(unsigned, DWORD = 0) noexcept;
};
} // namespace bridge::channels
