#include "dvc_channel_handoff.hpp"
#include <winpr/error.h>
namespace bridge::channels {
namespace {
DvcAcceptedChannelResult cleanup_rejected(DvcAcceptedChannelResult result,
                                          IWTSVirtualChannelCallback &original) noexcept {
  if (result.already_owned)
    return result;
  const auto close = original.OnClose;
  if (!close) {
    result.cleanup_status = ERROR_NOT_SUPPORTED;
    return result;
  }
  result.close_invoked = true;
  try {
    result.cleanup_status = close(&original);
  } catch (...) {
    result.cleanup_status = ERROR_INTERNAL_ERROR;
  }
  return result;
}
} // namespace
DvcAcceptedChannelResult reject_accepted_channel(DvcChannelRegistry &registry,
                                                 IWTSVirtualChannelCallback &original,
                                                 UINT status) noexcept {
  return cleanup_rejected({status, CHANNEL_RC_OK, nullptr, false, registry.owns_callback(original)},
                          original);
}
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
  return cleanup_rejected(result, original); // Never retry or read original after close.
}
} // namespace bridge::channels
