#include "clock.hpp"
#include "pcm.hpp"
#include <limits>

namespace bridge::audio {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
} // namespace
std::optional<bool> AudioClock::observe(const AudioStamp &stamp) noexcept {
  if ((stamp.bits != 16 && stamp.bits != 32) || (stamp.bits == 16 && stamp.timestamp > 65535) ||
      stamp.rate < 8000 || stamp.rate > 48000 || stamp.frames == 0 ||
      stamp.frames > PcmNormalizer::max_input_bytes)
    return {};
  bool discontinuous = !active_;
  if (!active_)
    increment(stats_.first);
  if (active_) {
    const auto budget = (static_cast<std::uint64_t>(previous_.frames) * 1000 + previous_.rate - 1) /
                            previous_.rate +
                        gap_budget_ms;
    const bool profile = stamp.bits != previous_.bits || stamp.format != previous_.format ||
                         stamp.rate != previous_.rate;
    const bool block = stamp.block != static_cast<std::uint8_t>(previous_.block + 1U);
    const bool backward = stamp.arrival_ms < previous_.arrival_ms;
    const bool gap = !backward && stamp.arrival_ms - previous_.arrival_ms > budget;
    if (profile)
      increment(stats_.profile);
    if (block)
      increment(stats_.block);
    if (backward)
      increment(stats_.arrival_backward);
    if (gap)
      increment(stats_.arrival_gap);
    discontinuous = profile || block || backward || gap;
    if (stamp.bits == previous_.bits) {
      const auto modulus = std::uint64_t{1} << stamp.bits;
      const auto delta =
          (static_cast<std::uint64_t>(stamp.timestamp) - previous_.timestamp) & (modulus - 1);
      if (delta >= modulus / 2)
        increment(stats_.timestamp_backward);
      else if (delta > budget)
        increment(stats_.timestamp_gap);
      discontinuous = discontinuous || delta >= modulus / 2 || delta > budget;
    }
  }
  previous_ = stamp;
  active_ = true;
  return discontinuous;
}
} // namespace bridge::audio
