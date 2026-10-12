#include "dvc_receive_guard.hpp"
#include <freerdp/channels/channels.h>
#include <limits>
#include <stdexcept>
#include <winpr/wtsapi.h>

namespace bridge::channels {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
constexpr UINT32 metadata_flags = CHANNEL_FLAG_SHOW_PROTOCOL | CHANNEL_FLAG_SHADOW_PERSISTENT;
constexpr UINT32 framing_flags = CHANNEL_FLAG_FIRST | CHANNEL_FLAG_LAST;
constexpr UINT32 notification_flags = CHANNEL_FLAG_SUSPEND | CHANNEL_FLAG_RESUME;
} // namespace
UINT16 DvcReceiveGuard::resolve_channel(freerdp *instance) {
  return freerdp_channels_get_id_by_name(instance, "drdynvc");
}
DvcReceiveGuard::DvcReceiveGuard(freerdp &instance, pReceiveChannelData delegate,
                                 DvcAllocationLimits limits, Resolve resolve)
    : instance_(instance), delegate_(delegate), resolve_(resolve),
      ingress_(
          [this](auto bytes) {
            return call(channel_, bytes.data(), bytes.size(), framing_flags | metadata_,
                        bytes.size());
          },
          limits) {
  if (!delegate_ || !resolve_)
    throw std::invalid_argument("Invalid DVC receive guard");
}
void DvcReceiveGuard::close() noexcept {
  closed_ = true;
  ingress_.close();
}
bool DvcReceiveGuard::fail() noexcept {
  if (!failed_) {
    failed_ = true;
    increment(counters_.failures);
  }
  close();
  return false;
}
bool DvcReceiveGuard::call(UINT16 channel, const BYTE *data, std::size_t size, UINT32 flags,
                           std::size_t total) {
  // Preserve the provider's actual result. The outer owner checks retirement;
  // reporting false here would turn a normal reentrant close into a false fault.
  return delegate_(&instance_, channel, data, size, flags, total) != FALSE;
}
bool DvcReceiveGuard::route(UINT16 id, const BYTE *data, std::size_t size, UINT32 flags,
                            std::size_t total, std::uint64_t now) {
  // Poll even when another SVC is active: its traffic cannot extend a partial DVC.
  if (!ingress_.poll(now))
    return fail();
  const auto resolved = resolve_(&instance_);
  if (closed_)
    return false;
  if (channel_ && resolved != channel_)
    return fail(); // One connection/generation only; never migrate partial ownership.
  channel_ = resolved;
  if (!channel_ || id != channel_) {
    const auto accepted = call(id, data, size, flags, total);
    if (accepted && !closed_)
      increment(counters_.other_packets);
    return accepted;
  }
  if (flags & ~(metadata_flags | framing_flags | notification_flags))
    return fail();
  const auto notification = flags & notification_flags;
  if (notification) {
    if (notification == notification_flags || (flags & framing_flags) || size || total)
      return fail();
    // The pinned host ignores these notifications. Preserve its public dispatch,
    // with a valid pointer for the core callback's zero-length argument contract.
    static constexpr BYTE empty = 0;
    const auto accepted = call(id, data ? data : &empty, 0, flags, 0);
    if (accepted && !closed_)
      increment(counters_.notifications);
    return accepted;
  }
  if (!data && size)
    return fail();
  if (flags & CHANNEL_FLAG_FIRST)
    metadata_ = 0;
  metadata_ |= flags & metadata_flags;
  return ingress_.receive(
      {{data, size}, total, (flags & CHANNEL_FLAG_FIRST) != 0, (flags & CHANNEL_FLAG_LAST) != 0},
      now);
}
bool DvcReceiveGuard::receive(UINT16 id, const BYTE *data, std::size_t size, UINT32 flags,
                              std::size_t total, std::uint64_t now) noexcept {
  if (closed_)
    return false;
  if (busy_)
    return fail();
  busy_ = true;
  bool accepted = false;
  try {
    accepted = route(id, data, size, flags, total, now);
  } catch (...) {
    (void)fail();
  }
  busy_ = false;
  if (!accepted && !closed_)
    return fail();
  return accepted && !closed_;
}
bool DvcReceiveGuard::poll(std::uint64_t now) noexcept {
  if (closed_)
    return false;
  if (busy_ || !ingress_.poll(now))
    return fail();
  return true;
}
DvcReceiveStats DvcReceiveGuard::stats() const noexcept {
  auto result = counters_;
  result.assembly = ingress_.stats();
  result.closed = closed_;
  result.failed = failed_ || result.assembly.failed;
  return result;
}
} // namespace bridge::channels
