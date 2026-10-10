#include "packetizer.hpp"
#include <algorithm>
#include <limits>

namespace bridge::audio {
namespace {
void add(std::uint64_t &counter, std::uint64_t amount) noexcept {
  const auto limit = (std::numeric_limits<std::uint64_t>::max)();
  counter = amount > limit - counter ? limit : counter + amount;
}
} // namespace
PcmPacket PcmPacketizer::read(PcmQueue &queue, std::uint64_t now) noexcept {
  if ((observed_ && now < observed_us_) ||
      now > (std::numeric_limits<std::uint64_t>::max)() - interval_us) {
    add(stats_.invalid_clocks, 1);
    return {PacketStatus::invalid, {}};
  }
  observed_us_ = now;
  observed_ = true;
  if (!active_) {
    if (queue.stats().queued_frames == 0 || (emitted_ && now <= previous_pts_))
      return {PacketStatus::idle, {}};
    next_us_ = now;
    active_ = true;
  }
  if (now < next_us_)
    return {PacketStatus::idle, {}};
  const auto skipped = (now - next_us_) / interval_us;
  if (skipped) {
    const auto frames = (std::min)(static_cast<std::uint64_t>(queue.stats().queued_frames),
                                   skipped * packet_frames);
    (void)queue.discard(static_cast<std::size_t>(frames));
    add(stats_.skipped_intervals, skipped);
  }
  const auto pts = next_us_ + skipped * interval_us; // <= now; preflight above guards next.
  const auto read = queue.read(bytes_);
  next_us_ = pts + interval_us;
  previous_pts_ = pts;
  emitted_ = true;
  const bool discontinuity = read.discontinuity || skipped != 0;
  add(stats_.packets, 1);
  if (discontinuity)
    add(stats_.discontinuities, 1);
  return {PacketStatus::ready, bytes_, pts, read.frames, read.silence_frames, discontinuity};
}
void PcmPacketizer::reset() noexcept {
  active_ = false;
  bytes_.fill(0);
}
} // namespace bridge::audio
