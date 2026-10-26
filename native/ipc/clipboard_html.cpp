#include "clipboard_html.hpp"
#include "../clipboard/text.hpp"
#include <algorithm>

namespace bridge::ipc::clipboard {
namespace {
bool boundary(::bridge::compat::span<const std::uint8_t> bytes, std::size_t offset) noexcept {
  return offset <= bytes.size() &&
         (offset == bytes.size() || (bytes[offset] & 0xc0U) != 0x80U);
}
void put(::bridge::compat::span<std::uint8_t> bytes, std::size_t offset,
          std::size_t value, std::size_t width) {
  for (std::size_t i = 0; i < width; ++i)
    bytes[offset + i] = static_cast<std::uint8_t>(value >> ((width - i - 1) * 8));
}
} // namespace
void validate_html_item(const HtmlItem &item, std::size_t maximum) {
  const auto body = item.body;
  const auto text_bytes = item.text ? item.text->size() : 0;
  if (!maximum || maximum > max_text_bytes || body.size() > maximum ||
      text_bytes > maximum - body.size() ||
      body.size() > max_text_bytes - html_item_metadata_bytes ||
      text_bytes > max_text_bytes - html_item_metadata_bytes - body.size() ||
      item.fragment_offset > body.size() ||
      item.fragment_bytes > body.size() - item.fragment_offset ||
      (!item.context && (item.fragment_offset || item.fragment_bytes != body.size())) ||
      (item.context && body.empty()) ||
      (!item.selection && (item.selection_offset || item.selection_bytes)))
    throw ProtocolError();
  if (item.selection &&
      (item.selection_offset < item.fragment_offset ||
       item.selection_offset - item.fragment_offset > item.fragment_bytes ||
       item.selection_bytes > item.fragment_bytes - (item.selection_offset - item.fragment_offset)))
    throw ProtocolError();
  if (!bridge::clipboard::valid_clipboard_utf8(body) ||
      !boundary(body, item.fragment_offset) ||
      !boundary(body, item.fragment_offset + item.fragment_bytes) ||
      (item.selection && (!boundary(body, item.selection_offset) ||
                          !boundary(body, item.selection_offset + item.selection_bytes))))
    throw ProtocolError();
  if (item.text && bridge::clipboard::encode_unicode_text(*item.text, {}, maximum).status !=
                       bridge::clipboard::TextStatus::capacity)
    throw ProtocolError();
}
std::vector<std::uint8_t> encode_html_item(const HtmlItem &item, std::size_t maximum) {
  validate_html_item(item, maximum);
  const auto text_bytes = item.text ? item.text->size() : 0;
  std::vector<std::uint8_t> bytes(html_item_metadata_bytes + item.body.size() + text_bytes);
  put(bytes, 0, 1, 2);
  put(bytes, 2, unsigned(item.text.has_value()) | (unsigned(item.context) << 1) |
                    (unsigned(item.selection) << 2), 2);
  put(bytes, 4, item.body.size(), 4);
  put(bytes, 8, text_bytes, 4);
  put(bytes, 12, item.fragment_offset, 4);
  put(bytes, 16, item.fragment_bytes, 4);
  put(bytes, 20, item.selection_offset, 4);
  put(bytes, 24, item.selection_bytes, 4);
  std::copy(item.body.begin(), item.body.end(), bytes.begin() + html_item_metadata_bytes);
  if (item.text)
    std::copy(item.text->begin(), item.text->end(),
              bytes.begin() + html_item_metadata_bytes + item.body.size());
  return bytes;
}
HtmlItem decode_html_item(::bridge::compat::span<const std::uint8_t> bytes, std::size_t maximum) {
  if (bytes.size() < html_item_metadata_bytes || bytes.size() > max_text_bytes ||
      !maximum || maximum > max_text_bytes || bytes.size() - html_item_metadata_bytes > maximum ||
      read_be(bytes.first(2)) != 1 || read_be(bytes.subspan(2, 2)) > 7 ||
      read_be(bytes.subspan(28, 4)))
    throw ProtocolError();
  const auto flags = read_be(bytes.subspan(2, 2));
  const auto body = static_cast<std::size_t>(read_be(bytes.subspan(4, 4)));
  const auto text = static_cast<std::size_t>(read_be(bytes.subspan(8, 4)));
  const auto content = bytes.size() - html_item_metadata_bytes;
  if (body > content || text != content - body || (!(flags & 1) && text))
    throw ProtocolError();
  HtmlItem item{bytes.subspan(html_item_metadata_bytes, body),
                static_cast<std::size_t>(read_be(bytes.subspan(12, 4))),
                static_cast<std::size_t>(read_be(bytes.subspan(16, 4))),
                static_cast<std::size_t>(read_be(bytes.subspan(20, 4))),
                static_cast<std::size_t>(read_be(bytes.subspan(24, 4))),
                (flags & 2) != 0, (flags & 4) != 0, {}};
  if (flags & 1)
    item.text = bytes.subspan(html_item_metadata_bytes + body, text);
  validate_html_item(item, maximum);
  return item;
}
} // namespace bridge::ipc::clipboard
