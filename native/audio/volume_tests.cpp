#include "volume.hpp"
#include <catch2/catch_test_macros.hpp>
#include <cmath>

using namespace bridge::audio;

TEST_CASE("PCM volume unity preserves every signed sample and mute is exact") {
  PcmVolume volume;
  REQUIRE(volume.packed() == 0xffffffffU);
  for (int value = -32768; value <= 32767; ++value) {
    const auto sample = static_cast<std::int16_t>(value);
    REQUIRE(volume.apply(sample, false) == sample);
    REQUIRE(volume.apply(sample, true) == sample);
  }
  volume.set(0);
  for (const auto value : {-32768, -1, 0, 1, 32767}) {
    REQUIRE(volume.apply(static_cast<std::int16_t>(value), false) == 0);
    REQUIRE(volume.apply(static_cast<std::int16_t>(value), true) == 0);
  }
}

TEST_CASE("PCM volume uses independent perceptual channels and fixed attenuation vectors") {
  PcmVolume volume;
  volume.set(0xffff8000U);
  REQUIRE(volume.packed() == 0xffff8000U);
  REQUIRE(volume.apply(-32768, false) == -1036);
  REQUIRE(volume.apply(32767, false) == 1036);
  REQUIRE(volume.apply(-32768, true) == -32768);
  REQUIRE(volume.apply(32767, true) == 32767);
  volume.set(0x00010000U);
  REQUIRE(volume.apply(-32768, false) == 0);
  REQUIRE(volume.apply(-32768, true) == -32);
  REQUIRE(volume.apply(32767, true) == 32);
  const std::array<std::uint16_t, 3> codes{0x4000, 0x5000, 0x6000};
  const std::array<std::int16_t, 3> expected{184, 283, 436};
  for (std::size_t at = 0; at < codes.size(); ++at) {
    volume.set(codes[at]);
    REQUIRE(volume.apply(32767, false) == expected[at]);
    REQUIRE(volume.apply(-32768, false) == -expected[at]);
    REQUIRE(volume.apply(32767, true) == 0);
  }
  // Independent amplitude ratios check equal dB increments, including integer
  // sample quantization; linear amplitude scaling would fail these vectors.
  const auto first = 20.0 * std::log10(283.0 / 184.0);
  const auto second = 20.0 * std::log10(436.0 / 283.0);
  REQUIRE(std::abs(first - second) < 0.025);
  REQUIRE(std::abs(first - 3.7501) < 0.025);
}

TEST_CASE("PCM volume all codes are monotone bounded and preserve polarity") {
  PcmVolume volume;
  std::int16_t previous = 0;
  for (std::uint32_t code = 0; code <= 65535; ++code) {
    volume.set(code | (code << 16));
    const auto positive = volume.apply(32767, false);
    const auto negative = volume.apply(-32768, true);
    REQUIRE(positive >= previous);
    REQUIRE(negative <= 0);
    REQUIRE(std::abs(static_cast<int>(positive) + negative) <= 1);
    previous = positive;
  }
  // int16_t's upper bound is a type invariant. Check the actual full-volume
  // endpoint instead of a tautological comparison rejected by GCC 8.
  REQUIRE(previous == 32767);
}
