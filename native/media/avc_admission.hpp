#pragma once
#include <cstddef>
#include <cstdint>
#include <span>

namespace bridge::media {
// Admission of decoder-controlled SPS dimensions, not a full H.264 validator or RSS budget.
struct AvcDecodeLimits {
  static constexpr std::size_t hard_bytes = 8U * 1024U * 1024U;
  static constexpr std::uint32_t hard_width = 7680, hard_height = 4320;
  static constexpr std::size_t hard_nals = 4096;
  std::size_t bytes = hard_bytes, nals = hard_nals;
  std::uint32_t width = hard_width, height = hard_height;
};
// Complete Annex-B input, including predictive units without a new SPS. All SPS/subset SPS
// prefixes must fit the limits before any part of the unit reaches the decoder.
[[nodiscard]] bool admit_avc_decode(std::span<const std::uint8_t>, AvcDecodeLimits = {}) noexcept;
} // namespace bridge::media
