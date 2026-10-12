#include "dvc_channel_handoff.hpp"
#include <winpr/error.h>
namespace bridge::channels {
DvcAcceptedChannelResult handoff_accepted_channel(DvcChannelRegistry &registry,
                                                  IWTSVirtualChannelManager &manager,
                                                  IWTSVirtualChannel &channel,
                                                  IWTSVirtualChannelCallback &original,
                                                  std::uint64_t now) noexcept {
  const bool already_owned = registry.owns_callback(original);
  const auto binding = registry.bind(manager, channel, original, now);
  DvcAcceptedChannelResult result{binding.status, CHANNEL_RC_OK, binding.callback, false,
                                  already_owned};
  if (binding.status == CHANNEL_RC_OK || already_owned)
    return result;
  // Snapshot before call: OnClose may delete original, including on an error.
  const auto close = original.OnClose;
  if (!close) {
    result.cleanup_status = ERROR_NOT_SUPPORTED;
    return result; // Caller retains an unresolved close/resource obligation.
  }
  result.close_invoked = true;
  try {
    result.cleanup_status = close(&original);
  } catch (...) {
    result.cleanup_status = ERROR_INTERNAL_ERROR;
  }
  return result; // Never retry uncertain close, and never read original after it.
}
} // namespace bridge::channels
