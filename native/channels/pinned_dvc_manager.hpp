#pragma once
#include <freerdp/dvc.h>

namespace bridge::channels {
// Nonowning public facade for the exact pinned manager. It normalizes failed
// CreateListener output without reading/destroying that undefined pointer.
// Caller owns successful handles and retains this facade through plugin cleanup.
class PinnedDvcManager final {
public:
  explicit PinnedDvcManager(IWTSVirtualChannelManager &);
  PinnedDvcManager(const PinnedDvcManager &) = delete;
  PinnedDvcManager &operator=(const PinnedDvcManager &) = delete;
  IWTSVirtualChannelManager *interface() noexcept { return &box_.api; }
  void retire() noexcept;

private:
  struct Box {
    IWTSVirtualChannelManager api{};
    PinnedDvcManager *owner;
  } box_;
  IWTSVirtualChannelManager *original_;
  IWTSListener fallback_{};
  static PinnedDvcManager &owner(IWTSVirtualChannelManager *) noexcept;
  static UINT create(IWTSVirtualChannelManager *, const char *, ULONG, IWTSListenerCallback *,
                     IWTSListener **) noexcept;
  static UINT destroy(IWTSVirtualChannelManager *, IWTSListener *) noexcept;
  static IWTSVirtualChannel *find(IWTSVirtualChannelManager *, UINT32) noexcept;
};
} // namespace bridge::channels
