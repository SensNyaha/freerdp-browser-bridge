#pragma once
#include <cstddef>
#include <cstdint>
#include <span>

namespace bridge::clipboard {
inline constexpr std::size_t max_item_bytes = 16 * 1024 * 1024;
enum class TextStatus { ok, invalid, too_large, capacity };
struct TextResult {
  TextStatus status;
  std::size_t bytes = 0; // Required output size on ok/capacity; zero on refusal.
};
// Immutable input/disjoint output. No allocation or partial output on refusal.
// UTF8 has no NUL; CF_UNICODETEXT is UTF16LE with a terminator/zero padding.
// Output line ends are CRLF on RDP and LF on the browser side.
TextResult encode_unicode_text(std::span<const std::uint8_t> utf8, std::span<std::uint8_t> output,
                               std::size_t maximum) noexcept;
TextResult decode_unicode_text(std::span<const std::uint8_t> utf16le,
                               std::span<std::uint8_t> output, std::size_t maximum) noexcept;
} // namespace bridge::clipboard
