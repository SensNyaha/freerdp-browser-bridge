#pragma once
#include "dvc_listener_proxy.hpp"
#include "pinned_dvc_manager.hpp"

namespace bridge::channels {
struct DvcListenerManagerStats {
  std::size_t live_listeners = 0;
  bool closed = false, busy = false, failed = false, retired = false;
};
// Serialized, nonowning host facade. Owns up to 32 listener proxies, not the
// plugin factories or native listeners. Successful DestroyListener unpublishes
// a proxy; failed/uncertain destruction retains it and is never retried here.
// Close only stops acceptance. Retire follows plugin cleanup and host callbacks.
class DvcListenerManager final {
public:
  static constexpr std::size_t capacity = 32;
  DvcListenerManager(IWTSVirtualChannelManager &, DvcChannelRegistry &, DvcCompletionHook::Clock,
                     void *clock_context = nullptr, std::size_t slots = capacity);
  ~DvcListenerManager();
  DvcListenerManager(const DvcListenerManager &) = delete;
  DvcListenerManager &operator=(const DvcListenerManager &) = delete;
  IWTSVirtualChannelManager *interface() noexcept { return &box_.api; }
  void close() noexcept;
  UINT retire() noexcept;
  // Final host teardown has unpublished every listener and returned all calls.
  // Drops retained uncertain handles without dereferencing/freeing them.
  UINT host_unpublished() noexcept;
  DvcListenerManagerStats stats() const noexcept;

private:
  struct Box {
    IWTSVirtualChannelManager api{};
    DvcListenerManager *owner;
  } box_;
  struct Entry {
    std::array<char, 128> name{};
    std::unique_ptr<DvcListenerProxy> proxy;
    IWTSListener *listener = nullptr;
    bool destroy_attempted = false;
    UINT destroy_status = 0;
  };
  PinnedDvcManager pinned_;
  DvcChannelRegistry &registry_;
  const DvcCompletionHook::Clock clock_;
  void *const clock_context_;
  const std::size_t slots_;
  std::array<Entry, capacity> entries_{};
  IWTSListener fallback_{};
  bool closed_ = false, busy_ = false, failed_ = false, retired_ = false;
  static DvcListenerManager &owner(IWTSVirtualChannelManager *) noexcept;
  static UINT create(IWTSVirtualChannelManager *, const char *, ULONG, IWTSListenerCallback *,
                     IWTSListener **) noexcept;
  static UINT destroy(IWTSVirtualChannelManager *, IWTSListener *) noexcept;
  static IWTSVirtualChannel *find(IWTSVirtualChannelManager *, UINT32) noexcept;
};
} // namespace bridge::channels
