#pragma once
#include "clipboard.hpp"
#include <optional>

namespace bridge::ipc::clipboard {
inline constexpr std::size_t html_item_metadata_bytes = 32;
struct HtmlItem {
  ::bridge::compat::span<const std::uint8_t> body;
  std::size_t fragment_offset = 0, fragment_bytes = 0;
  std::size_t selection_offset = 0, selection_bytes = 0;
  bool context = false, selection = false;
  std::optional<::bridge::compat::span<const std::uint8_t>> text;
};
// Inner HTML item schema 1. This is not a schema-1 clipboard text command.
// Parent envelope selection/capability/identity and quotas must be admitted
// before allocation. The item including its fixed header fits max_text_bytes,
// preserving the existing outer command/result maximum. Views borrow input.
void validate_html_item(const HtmlItem &, std::size_t maximum = max_text_bytes);
std::vector<std::uint8_t> encode_html_item(const HtmlItem &,
                                         std::size_t maximum = max_text_bytes);
HtmlItem decode_html_item(::bridge::compat::span<const std::uint8_t>,
                          std::size_t maximum = max_text_bytes);
} // namespace bridge::ipc::clipboard
