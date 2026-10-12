#include "dvc_listener_proxy.hpp"
#include <exception>
#include <limits>
#include <stdexcept>
#include <type_traits>
#include <winpr/error.h>
namespace bridge::channels {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
} // namespace
DvcListenerProxy::DvcListenerProxy(DvcChannelRegistry &registry, IWTSVirtualChannelManager &manager,
                                   IWTSListenerCallback &original, DvcCompletionHook::Clock clock,
                                   void *clock_context)
    : box_{{}, this}, registry_(registry), manager_(manager), original_(original), clock_(clock),
      clock_context_(clock_context) {
  static_assert(std::is_standard_layout_v<Box>);
  if (!clock || !original.OnNewChannelConnection)
    throw std::invalid_argument("Invalid DVC listener proxy");
  box_.api.OnNewChannelConnection = on_new;
  box_.api.pInterface = original.pInterface;
}
DvcListenerProxy::~DvcListenerProxy() {
  if (stats_.busy)
    std::terminate();
}
UINT DvcListenerProxy::fault(UINT status) noexcept {
  if (!stats_.failed) {
    stats_.failed = true;
    increment(stats_.faults);
  }
  stats_.closed = true;
  stats_.last_status = status;
  return status;
}
UINT DvcListenerProxy::on_new(IWTSListenerCallback *p, IWTSVirtualChannel *channel, BYTE *data,
                              BOOL *accept, IWTSVirtualChannelCallback **out) noexcept {
  return reinterpret_cast<Box *>(p)->owner->create(channel, data, accept, out);
}
UINT DvcListenerProxy::create(IWTSVirtualChannel *channel, BYTE *data, BOOL *accept,
                              IWTSVirtualChannelCallback **out) noexcept {
  if (accept)
    *accept = FALSE;
  if (out)
    *out = nullptr;
  if (!channel || !accept || !out)
    return fault(ERROR_INVALID_PARAMETER);
  if (stats_.busy)
    return fault(ERROR_INVALID_DATA);
  if (stats_.closed)
    return ERROR_INVALID_STATE;
  increment(stats_.calls);
  stats_.busy = true;
  // Pinned drdynvc starts accepted; generic addins leave this in/out flag untouched.
  BOOL admitted = TRUE;
  IWTSVirtualChannelCallback *target = nullptr;
  UINT status = ERROR_INTERNAL_ERROR;
  try {
    status = original_.OnNewChannelConnection(&original_, channel, data, &admitted, &target);
  } catch (...) {
    // A thrown/failed factory has not transferred a defined callback owner.
    (void)fault(ERROR_INTERNAL_ERROR);
  }
  if (status == CHANNEL_RC_OK && admitted) {
    if (!target) {
      status = fault(ERROR_INVALID_DATA);
    } else {
      try {
        const auto now = stats_.closed ? 0 : clock_(clock_context_);
        const auto handoff =
            stats_.closed ? reject_accepted_channel(registry_, *target, ERROR_INVALID_STATE)
                          : handoff_accepted_channel(registry_, manager_, *channel, *target, now);
        status = handoff.status;
        stats_.cleanup_status = handoff.cleanup_status;
        if (status == CHANNEL_RC_OK && !stats_.closed) {
          *accept = TRUE;
          *out = handoff.callback;
          increment(stats_.accepted);
        } else {
          if (status == CHANNEL_RC_OK)
            status = ERROR_INVALID_STATE;
          if (!(stats_.closed && !stats_.failed && handoff.cleanup_status == CHANNEL_RC_OK))
            (void)fault(status);
        }
      } catch (...) {
        const auto rejected = reject_accepted_channel(registry_, *target, ERROR_INTERNAL_ERROR);
        stats_.cleanup_status = rejected.cleanup_status;
        status = fault(ERROR_INTERNAL_ERROR);
      }
    }
  } else {
    increment(stats_.refused); // Factory error/denial is not accepted ownership.
  }
  stats_.last_status = status;
  stats_.busy = false;
  return status;
}
} // namespace bridge::channels
