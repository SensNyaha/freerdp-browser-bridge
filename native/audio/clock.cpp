#include "clock.hpp"
#include "pcm.hpp"

namespace bridge::audio {
std::optional<bool> AudioClock::observe(const AudioStamp &stamp) noexcept {
  if ((stamp.bits != 16 && stamp.bits != 32) || (stamp.bits == 16 && stamp.timestamp > 65535) ||
      stamp.rate < 8000 || stamp.rate > 48000 || stamp.frames == 0 ||
      stamp.frames > PcmNormalizer::max_input_bytes)
    return {};
  bool discontinuous = !active_;
  if (active_) {
    const auto budget = (static_cast<std::uint64_t>(previous_.frames) * 1000 + previous_.rate - 1) /
                            previous_.rate +
                        gap_budget_ms;
    discontinuous = stamp.bits != previous_.bits || stamp.format != previous_.format ||
                    stamp.rate != previous_.rate ||
                    stamp.block != static_cast<std::uint8_t>(previous_.block + 1U) ||
                    stamp.arrival_ms < previous_.arrival_ms;
    if (stamp.arrival_ms >= previous_.arrival_ms)
      discontinuous = discontinuous || stamp.arrival_ms - previous_.arrival_ms > budget;
    if (stamp.bits == previous_.bits) {
      const auto modulus = std::uint64_t{1} << stamp.bits;
      const auto delta =
          (static_cast<std::uint64_t>(stamp.timestamp) - previous_.timestamp) & (modulus - 1);
      discontinuous = discontinuous || delta >= modulus / 2 || delta > budget;
    }
  }
  previous_ = stamp;
  active_ = true;
  return discontinuous;
}
} // namespace bridge::audio
