#include "volume.hpp"
#include <cmath>

namespace bridge::audio {
std::uint32_t PcmVolume::gain(std::uint16_t code) noexcept {
  if (code == 0)
    return 0;
  if (code == 65535)
    return unity;
  const auto exponent = -3.0 * (65535.0 - code) / 65534.0;
  return static_cast<std::uint32_t>(std::llround(std::pow(10.0, exponent) * unity));
}
void PcmVolume::set(std::uint32_t value) noexcept {
  gains_ = {gain(static_cast<std::uint16_t>(value)), gain(static_cast<std::uint16_t>(value >> 16))};
  packed_ = value;
}
std::int16_t PcmVolume::apply(std::int16_t sample, bool right) const noexcept {
  return static_cast<std::int16_t>(static_cast<std::int64_t>(sample) * gains_[right ? 1 : 0] /
                                   unity);
}
} // namespace bridge::audio
