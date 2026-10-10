#pragma once
#include <array>
#include <cstdint>

namespace bridge::audio {
// RDPSND low word = left, high word = right. Zero mutes; nonzero codes span
// -60..0 dB uniformly. The protocol leaves the device's attenuation range open.
class PcmVolume {
  static constexpr std::uint32_t unity = 1U << 30;
  std::array<std::uint32_t, 2> gains_{unity, unity};
  std::uint32_t packed_ = 0xffffffffU;
  static std::uint32_t gain(std::uint16_t) noexcept;

public:
  void set(std::uint32_t) noexcept;
  std::uint32_t packed() const noexcept { return packed_; }
  std::int16_t apply(std::int16_t, bool right) const noexcept;
};
} // namespace bridge::audio
