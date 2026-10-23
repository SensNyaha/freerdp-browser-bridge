#include "receive_guard.hpp"
#include <freerdp/channels/channels.h>
#include <stdexcept>
#include <winpr/wtsapi.h>

namespace bridge::clipboard {
namespace {
constexpr UINT32 framing = CHANNEL_FLAG_FIRST | CHANNEL_FLAG_LAST;
constexpr UINT32 metadata = CHANNEL_FLAG_SHOW_PROTOCOL | CHANNEL_FLAG_SHADOW_PERSISTENT;
constexpr UINT32 notifications = CHANNEL_FLAG_SUSPEND | CHANNEL_FLAG_RESUME;
} // namespace
UINT16 ClipboardReceiveGuard::resolve_channel(freerdp *instance) {
  return freerdp_channels_get_id_by_name(instance, "cliprdr");
}
ClipboardReceiveGuard::ClipboardReceiveGuard(freerdp &instance, pReceiveChannelData delegate,
                                             std::size_t maximum, Resolve resolve)
    : instance_(instance), delegate_(delegate), resolve_(resolve),
      ingress_(
          [this](auto b) {
            return delegate_(&instance_, channel_, b.data(), b.size(), framing | metadata_,
                             b.size()) != FALSE;
          },
          maximum) {
  if (!delegate_ || !resolve_)
    throw std::invalid_argument("Invalid clipboard receive guard");
}
void ClipboardReceiveGuard::close() noexcept {
  closed_ = true;
  ingress_.close();
}
bool ClipboardReceiveGuard::fail() noexcept {
  failed_ = true;
  close();
  return false;
}
bool ClipboardReceiveGuard::route(UINT16 id, const BYTE *data, std::size_t size, UINT32 flags,
                                  std::size_t total, std::uint64_t now) {
  if (!ingress_.poll(now))
    return fail();
  const auto resolved = resolve_(&instance_);
  if (closed_)
    return false;
  if (channel_ && resolved != channel_)
    return fail();
  channel_ = resolved;
  if (!channel_ || id != channel_)
    return delegate_(&instance_, id, data, size, flags, total) != FALSE;
  if (flags & ~(framing | metadata | notifications))
    return fail();
  if (const auto notification = flags & notifications) {
    if (notification == notifications || (flags & framing) || size || total)
      return fail();
    // The pinned client ignores these. Keep the original partial deadline.
    static constexpr BYTE empty = 0;
    return delegate_(&instance_, id, data ? data : &empty, 0, flags, 0) != FALSE;
  }
  if (!data && size)
    return fail();
  if (flags & CHANNEL_FLAG_FIRST)
    metadata_ = 0;
  metadata_ |= flags & metadata;
  return ingress_.receive(
      {{data, size}, total, (flags & CHANNEL_FLAG_FIRST) != 0, (flags & CHANNEL_FLAG_LAST) != 0},
      now);
}
bool ClipboardReceiveGuard::receive(UINT16 id, const BYTE *data, std::size_t size, UINT32 flags,
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
bool ClipboardReceiveGuard::poll(std::uint64_t now) noexcept {
  if (closed_)
    return false;
  if (busy_ || !ingress_.poll(now))
    return fail();
  return true;
}
IngressStats ClipboardReceiveGuard::stats() const noexcept {
  auto result = ingress_.stats();
  result.closed = closed_ || result.closed;
  result.failed = failed_ || result.failed;
  return result;
}
} // namespace bridge::clipboard
