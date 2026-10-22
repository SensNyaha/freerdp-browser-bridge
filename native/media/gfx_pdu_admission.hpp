#pragma once
#include "../compat/span.hpp"
#include <cstddef>
#include <cstdint>

namespace bridge::media {
struct GfxPduLimits {
  static constexpr std::size_t hard_bytes = 16U * 1024U * 1024U, hard_pdus = 4096;
  static constexpr std::uint32_t hard_regions = 1024;
  std::size_t bytes = hard_bytes, pdus = hard_pdus;
  std::uint32_t regions = hard_regions;
};
// Allocation-free inspection of an already decoded whole GFX batch. Not installed
// before pinned metadata parsing until a production decoded-message owner exists.
[[nodiscard]] bool admit_gfx_pdus(::bridge::compat::span<const std::uint8_t>, GfxPduLimits = {}) noexcept;
} // namespace bridge::media
