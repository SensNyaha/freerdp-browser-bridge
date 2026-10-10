#pragma once
#include "queue.hpp"

namespace bridge::audio {
enum class PacketStatus { ready, idle, invalid };
struct PcmPacket {
  PacketStatus status;
  std::span<const std::uint8_t> bytes;
  std::uint64_t timestamp_us = 0;
  std::size_t frames = 0, silence_frames = 0;
  bool discontinuity = false;
};
struct PacketStats {
  std::uint64_t packets = 0, skipped_intervals = 0, discontinuities = 0, invalid_clocks = 0;
};
// One serialized consumer, caller supplies the common monotonic worker clock.
// Emits at most one 20 ms packet per call; no waits, allocation or catch-up queue.
class PcmPacketizer {
public:
  static constexpr std::size_t packet_frames = 960, packet_bytes = packet_frames * 4;
  static constexpr std::uint64_t interval_us = 20000;
  PcmPacket read(PcmQueue &, std::uint64_t worker_time_us) noexcept;
  // Starts a new stream epoch; preserves monotonic checks and lifetime metrics.
  void reset() noexcept;
  PacketStats stats() const noexcept { return stats_; }

private:
  std::array<std::uint8_t, packet_bytes> bytes_{};
  PacketStats stats_;
  std::uint64_t next_us_ = 0, observed_us_ = 0, previous_pts_ = 0;
  bool active_ = false, observed_ = false, emitted_ = false;
};
} // namespace bridge::audio
