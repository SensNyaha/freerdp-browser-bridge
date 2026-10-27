#pragma once
#include "text.hpp"
#include <array>

namespace bridge::clipboard {
enum class ImageStatus { ok, invalid, unsupported, too_large, capacity };
inline constexpr std::size_t dibv5_header_bytes = 124;
struct ImageInspection {
  ImageStatus status = ImageStatus::invalid;
  std::uint32_t width = 0, height = 0;
  std::size_t pixel_offset = 0, row_bytes = 0, pixel_bytes = 0, rgba_bytes = 0;
  std::uint16_t bits = 0;
  std::array<std::uint8_t, 4> shifts{};
  bool bottom_up = false, alpha = false;
};
struct ImageResult {
  ImageStatus status = ImageStatus::invalid;
  std::size_t bytes = 0;
  std::uint32_t width = 0, height = 0;
};
// Packed CF_DIB/CF_DIBV5 bytes, not a BMP file or host bitmap handle. Supported
// headers: 40/108/124; uncompressed BGR24/BGRX32 and disjoint eight-bit masks.
// Extended headers require sRGB/Windows sRGB and no linked/embedded profile.
// Both encoded and decoded byte budgets are admitted before any pixel access.
// No allocation, host clipboard, image library, profile lookup or diagnostics.
ImageInspection inspect_dib_clipboard(::bridge::compat::span<const std::uint8_t> input,
                                      std::size_t maximum) noexcept;
// Compact top-down straight RGBA8. Immutable input and disjoint output; every
// refusal leaves output unchanged. Capacity reports the exact required bytes.
ImageResult decode_dib_clipboard(::bridge::compat::span<const std::uint8_t> input,
                                 ::bridge::compat::span<std::uint8_t> output,
                                 std::size_t maximum) noexcept;
// Canonical top-down sRGB DIBV5, 32-bit BI_BITFIELDS with explicit alpha.
ImageResult encode_dibv5_clipboard(::bridge::compat::span<const std::uint8_t> rgba,
                                   std::uint32_t width, std::uint32_t height,
                                   ::bridge::compat::span<std::uint8_t> output,
                                   std::size_t maximum) noexcept;
} // namespace bridge::clipboard
