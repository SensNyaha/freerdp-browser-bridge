#include "../compat/bit.hpp"
#include "../compat/span.hpp"
#include "pcm.hpp"
#include <limits>

namespace bridge::audio {
PcmNormalizer::PcmNormalizer()
    : output_(std::make_unique<std::array<std::uint8_t, max_output_bytes>>()) {}
bool PcmNormalizer::configure(PcmFormat value) noexcept {
  if (value.rate < 8000 || value.rate > output_rate ||
      (value.channels != 1 && value.channels != 2) || (value.bits != 8 && value.bits != 16))
    return false;
  format_ = value;
  reset();
  return true;
}
void PcmNormalizer::reset() noexcept {
  have_previous_ = false;
  previous_ = {};
  next_ = produced_ = 0;
  output_->fill(0);
}
PcmResult PcmNormalizer::process(::bridge::compat::span<const std::uint8_t> input) noexcept {
  if (!format_)
    return {PcmStatus::unconfigured, {}};
  const auto f = *format_;
  const auto align = static_cast<std::size_t>(f.channels) * (f.bits / 8U);
  if (input.empty() || input.size() > max_input_bytes || input.size() % align)
    return {PcmStatus::invalid, {}};
  const auto source_frames = input.size() / align;
  const auto intervals = source_frames - (have_previous_ ? 0U : 1U);
  const auto end = static_cast<std::uint64_t>(intervals) * output_rate;
  const auto first = have_previous_ ? next_ : f.rate;
  const auto count = (have_previous_ ? 0U : 1U) + (end < first ? 0 : (end - first) / f.rate + 1);
  // Validate complete output bounds before reading samples or mutating stream state.
  if (count > max_output_frames)
    return {PcmStatus::capacity, {}};
  if (count > (std::numeric_limits<std::uint64_t>::max)() - produced_)
    return {PcmStatus::invalid, {}};
  std::size_t written = 0;
  const auto emit = [&](const std::array<std::int16_t, 2> &samples) {
    for (const auto sample : samples) {
      const auto value = static_cast<std::uint16_t>(sample);
      (*output_)[written++] = static_cast<std::uint8_t>(value);
      (*output_)[written++] = static_cast<std::uint8_t>(value >> 8);
    }
  };
  for (std::size_t frame = 0; frame < source_frames; ++frame) {
    std::array<std::int16_t, 2> current{};
    for (std::size_t channel = 0; channel < f.channels; ++channel) {
      const auto at = frame * align + channel * (f.bits / 8U);
      if (f.bits == 8)
        current[channel] = static_cast<std::int16_t>((static_cast<int>(input[at]) - 128) * 256);
      else {
        const auto value = static_cast<std::uint16_t>(static_cast<unsigned>(input[at]) |
                                                      (static_cast<unsigned>(input[at + 1]) << 8));
        current[channel] = ::bridge::compat::bit_cast<std::int16_t>(value);
      }
    }
    if (f.channels == 1)
      current[1] = current[0];
    if (!have_previous_) {
      emit(current);
      have_previous_ = true;
      next_ = f.rate;
    } else {
      while (next_ <= output_rate) {
        std::array<std::int16_t, 2> sample{};
        for (std::size_t channel = 0; channel < sample.size(); ++channel) {
          const auto difference = static_cast<std::int64_t>(current[channel]) - previous_[channel];
          sample[channel] = static_cast<std::int16_t>(
              previous_[channel] + difference * static_cast<std::int64_t>(next_) / output_rate);
        }
        emit(sample);
        next_ += f.rate;
      }
      next_ -= output_rate;
    }
    previous_ = current;
  }
  produced_ += count;
  return {PcmStatus::accepted, ::bridge::compat::span(*output_).first(written), written / 4};
}
} // namespace bridge::audio
