#pragma once
#include "../compat/span.hpp"
#include <cstddef>
#include <cstdint>

namespace bridge::clipboard {
inline constexpr std::size_t max_item_bytes = 16 * 1024 * 1024;
enum class TextStatus { ok, invalid, too_large, capacity };
struct TextResult {
  TextStatus status;
  std::size_t bytes = 0; // Required output size on ok/capacity; zero on refusal.
};
// Strict scalar UTF8 without NUL; caller admits its byte budget before this scan.
bool valid_clipboard_utf8(::bridge::compat::span<const std::uint8_t> input) noexcept;
// Immutable input/disjoint output. No allocation or partial output on refusal.
// UTF8 has no NUL; CF_UNICODETEXT is UTF16LE with a terminator/zero padding.
// Output line ends are CRLF on RDP and LF on the browser side.
TextResult encode_unicode_text(::bridge::compat::span<const std::uint8_t> utf8, ::bridge::compat::span<std::uint8_t> output,
                               std::size_t maximum) noexcept;
TextResult decode_unicode_text(::bridge::compat::span<const std::uint8_t> utf16le,
                               ::bridge::compat::span<std::uint8_t> output, std::size_t maximum) noexcept;
} // namespace bridge::clipboard
