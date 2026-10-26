#pragma once
#include "text.hpp"

namespace bridge::clipboard {
inline constexpr std::size_t max_html_header_bytes = 4096;
inline constexpr std::size_t max_html_header_lines = 32;
struct HtmlInspection {
  TextStatus status = TextStatus::invalid;
  std::size_t body_offset = 0, body_bytes = 0;
  std::size_t fragment_offset = 0, fragment_bytes = 0;
  std::size_t selection_offset = 0, selection_bytes = 0;
  bool context = false, selection = false;
};
// CF_HTML (registered name "HTML Format"). All offsets are UTF8 byte offsets.
// No allocation, HTML evaluation, URL access, logging or host clipboard access.
// Context/selection ranges are preserved separately from the selected fragment.
HtmlInspection inspect_html_clipboard(::bridge::compat::span<const std::uint8_t> input,
                                      std::size_t maximum) noexcept;
// Wrap one immutable UTF8 fragment in a minimal CF_HTML document. Maximum covers
// the complete wire representation including the header and final NUL. Validates
// before any output write; capacity returns the exact required byte count.
TextResult encode_html_clipboard(::bridge::compat::span<const std::uint8_t> fragment,
                                 ::bridge::compat::span<std::uint8_t> output,
                                 std::size_t maximum) noexcept;
} // namespace bridge::clipboard
