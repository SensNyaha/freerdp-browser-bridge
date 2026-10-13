#pragma once
#include "pcm.hpp"

namespace bridge::audio {
enum class QueueStatus { accepted, invalid, full };
enum class OutputBufferProfile { low_latency, compatibility };
struct QueueStats {
  std::uint64_t accepted_frames = 0, consumed_frames = 0, silence_frames = 0;
  std::uint64_t dropped_packets = 0, dropped_frames = 0, reset_discarded_frames = 0;
  std::uint64_t underflows = 0, invalid_calls = 0;
  std::uint64_t playback_skipped_frames = 0;
  std::size_t queued_frames = 0, high_water_frames = 0;
};
struct QueueRead {
  QueueStatus status;
  std::size_t frames = 0, silence_frames = 0;
  bool discontinuity = false;
};
// Single serialized owner; no waits, per-call allocation, wire metadata or clock.
class PcmQueue {
public:
  static constexpr std::size_t capacity_frames = 5760; // 120 ms at 48 kHz.
  static constexpr std::size_t capacity_bytes = capacity_frames * 4;
  static constexpr std::size_t compatibility_frames = 9600; // 200 ms, opt-in.
  explicit PcmQueue(OutputBufferProfile profile = OutputBufferProfile::low_latency);
  PcmQueue(const PcmQueue &) = delete;
  PcmQueue &operator=(const PcmQueue &) = delete;
  QueueStatus push(std::span<const std::uint8_t>) noexcept;
  // Fills all valid destination frames, padding shortages with silence.
  QueueRead read(std::span<std::uint8_t>) noexcept;
  // Discard up to this many old frames without synthesizing/consuming silence.
  // Request is bounded by capacity; a nonempty discard marks discontinuity.
  std::size_t discard(std::size_t frames) noexcept;
  // Trim raw source before assigning packet timestamps or encoding. Loss is
  // counted, but this alone does not invalidate an already-delivered codec history.
  // Existing reset/timeline boundaries remain owned; discard() keeps its semantics.
  std::size_t discard_unstamped(std::size_t frames) noexcept;
  void reset() noexcept;
  QueueStats stats() const noexcept { return stats_; }
  std::size_t capacity() const noexcept { return capacity_; }

private:
  const std::size_t capacity_;
  std::unique_ptr<std::array<std::uint8_t, compatibility_frames * 4>> bytes_;
  QueueStats stats_;
  std::size_t head_ = 0;
  bool discontinuity_ = true;
};
} // namespace bridge::audio
