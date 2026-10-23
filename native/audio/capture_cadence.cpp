#include "capture_cadence.hpp"
#include <limits>

namespace bridge::audio {
namespace {
constexpr auto limit = (std::numeric_limits<std::uint64_t>::max)();
void add(std::uint64_t &value, std::uint64_t amount) noexcept {
  value = amount > limit - value ? limit : value + amount;
}
} // namespace
bool CaptureCadence::start(std::uint64_t epoch, std::uint32_t frames, std::uint64_t now) noexcept {
  if (active_ || !epoch || epoch <= epoch_ || !frames || frames > 4800)
    return false;
  epoch_ = epoch;
  frames_ = frames;
  ticks_ = frames * 125;
  floor_ = observed_ = now;
  phase_ = 0;
  active_ = true;
  return true;
}
std::optional<std::uint64_t> CaptureCadence::deadline() const noexcept {
  if (!active_)
    return {};
  return floor_ + (phase_ != 0 ? 1U : 0U);
}
CaptureTick CaptureCadence::poll(std::uint64_t now) noexcept {
  if (!active_)
    return {CaptureTickStatus::inactive};
  if (now < observed_)
    return {CaptureTickStatus::invalid};
  observed_ = now;
  if (now < *deadline())
    return {CaptureTickStatus::waiting};
  const auto elapsed = now - floor_;
  // Divide before multiplying. ticks >= 125, so neither quotient*6 nor
  // remainder*6 can overflow even across the entire uint64_t clock range.
  auto intervals = (elapsed / ticks_) * 6;
  auto remainder = (elapsed % ticks_) * 6;
  if (remainder < phase_) {
    --intervals; // elapsed >= ceil(phase/6); a borrow always has a quotient.
    remainder += ticks_;
  }
  remainder -= phase_;
  intervals += remainder / ticks_;
  remainder %= ticks_;
  const auto distance = ticks_ - remainder;
  const auto whole = distance / 6;
  const auto fraction = static_cast<std::uint32_t>(distance % 6);
  if (whole > limit - now || (fraction && whole == limit - now)) {
    active_ = false;
    return {CaptureTickStatus::exhausted};
  }
  floor_ = now + whole;
  phase_ = fraction;
  // At most elapsed*48000/1e6 skipped frames: the product is bounded.
  const auto skipped = intervals * frames_;
  add(stats_.callbacks, 1);
  add(stats_.skipped_frames, skipped);
  return {CaptureTickStatus::due, skipped};
}
} // namespace bridge::audio
