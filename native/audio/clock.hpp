#pragma once
#include <cstdint>
#include <optional>

namespace bridge::audio {
struct AudioStamp {
  std::uint32_t timestamp, rate, frames;
  std::uint16_t format;
  std::uint8_t bits, block;
  std::uint64_t arrival_ms;
};
struct AudioClockStats {
  std::uint64_t first = 0, profile = 0, block = 0;
  std::uint64_t arrival_backward = 0, arrival_gap = 0;
  std::uint64_t timestamp_backward = 0, timestamp_gap = 0;
};
// Serialized owner continuity policy, not a presentation clock or AV sync mapper.
class AudioClock {
  AudioStamp previous_{};
  bool active_ = false;
  AudioClockStats stats_;

public:
  static constexpr std::uint64_t gap_budget_ms = 120;
  // Invalid metadata leaves history unchanged. True asks the sink to reset;
  // false means continuity. Both accepted outcomes establish the next baseline.
  std::optional<bool> observe(const AudioStamp &) noexcept;
  void reset() noexcept { active_ = false; }
  AudioClockStats stats() const noexcept { return stats_; }
};
} // namespace bridge::audio
