#pragma once
#include <cstdint>
#include <optional>

namespace bridge::audio {
enum class CaptureTickStatus { inactive, waiting, due, invalid, exhausted };
struct CaptureTick {
  CaptureTickStatus status;
  std::uint64_t skipped_frames = 0;
};
struct CaptureCadenceStats {
  std::uint64_t callbacks = 0, skipped_frames = 0;
};
// Serialized 48 kHz callback clock. Constant work and no catch-up loop/queue.
// Deadlines retain sixth-microsecond phase: one frame is exactly 125/6 us.
class CaptureCadence {
  std::uint64_t epoch_ = 0, floor_ = 0, observed_ = 0;
  std::uint32_t frames_ = 0, ticks_ = 0, phase_ = 0;
  bool active_ = false;
  CaptureCadenceStats stats_;

public:
  bool start(std::uint64_t epoch, std::uint32_t frames, std::uint64_t now_us) noexcept;
  void stop() noexcept { active_ = false; }
  CaptureTick poll(std::uint64_t now_us) noexcept;
  std::optional<std::uint64_t> deadline() const noexcept;
  CaptureCadenceStats stats() const noexcept { return stats_; }
};
} // namespace bridge::audio
