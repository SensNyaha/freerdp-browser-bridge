#pragma once
#include "dvc_channel_registry.hpp"
namespace bridge::channels {
struct DvcAcceptedChannelResult {
  UINT status, cleanup_status;
  IWTSVirtualChannelCallback *callback;
  bool close_invoked = false, already_owned = false;
};
// Only for a live callback explicitly transferred by a successful, accepted
// listener factory. Error/denied factory output has not transferred ownership.
DvcAcceptedChannelResult handoff_accepted_channel(DvcChannelRegistry &, IWTSVirtualChannelManager &,
                                                  IWTSVirtualChannel &,
                                                  IWTSVirtualChannelCallback &,
                                                  std::uint64_t now_ms) noexcept;
DvcAcceptedChannelResult reject_accepted_channel(DvcChannelRegistry &, IWTSVirtualChannelCallback &,
                                                 UINT status) noexcept;
} // namespace bridge::channels
