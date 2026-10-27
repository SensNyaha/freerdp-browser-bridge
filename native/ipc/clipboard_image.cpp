#include "clipboard_image.hpp"
#include "../clipboard/image.hpp"
#include <algorithm>

namespace bridge::ipc::clipboard {
namespace {
using Bytes = ::bridge::compat::span<const std::uint8_t>;
void size(std::uint32_t width, std::uint32_t height, std::size_t actual, std::size_t maximum) {
  if (!maximum || maximum > max_text_bytes || !width || !height || width > 0x7fffffffU ||
      height > 0x7fffffffU || actual > maximum ||
      actual > max_text_bytes - image_item_metadata_bytes)
    throw ProtocolError();
  // Positive signed-32 dimensions keep this multiplication within uint64_t.
  if (std::uint64_t{width} * height * 4 != actual)
    throw ProtocolError();
}
std::uint32_t get(Bytes bytes, std::size_t at) noexcept {
  return (std::uint32_t{bytes[at]} << 24) | (std::uint32_t{bytes[at + 1]} << 16) |
         (std::uint32_t{bytes[at + 2]} << 8) | std::uint32_t{bytes[at + 3]};
}
void put(::bridge::compat::span<std::uint8_t> bytes, std::size_t at, std::uint32_t value) noexcept {
  for (std::size_t i = 0; i < 4; ++i)
    bytes[at + i] = static_cast<std::uint8_t>(value >> ((3 - i) * 8));
}
} // namespace
void validate_image_item(const ImageItem &item, std::size_t maximum) {
  size(item.width, item.height, item.rgba.size(), maximum);
}
void validate_image_write(const ImageItem &item, std::size_t maximum) {
  validate_image_item(item, maximum);
  if (maximum < bridge::clipboard::dibv5_header_bytes ||
      item.rgba.size() > maximum - bridge::clipboard::dibv5_header_bytes)
    throw ProtocolError();
}
std::vector<std::uint8_t> encode_image_item(const ImageItem &item, std::size_t maximum) {
  validate_image_item(item, maximum);
  std::vector<std::uint8_t> bytes(image_item_metadata_bytes + item.rgba.size());
  bytes[1] = 1;
  put(bytes, 4, item.width);
  put(bytes, 8, item.height);
  put(bytes, 12, static_cast<std::uint32_t>(item.rgba.size()));
  std::copy(item.rgba.begin(), item.rgba.end(), bytes.begin() + image_item_metadata_bytes);
  return bytes;
}
ImageItem decode_image_item(Bytes bytes, std::size_t maximum) {
  if (bytes.size() < image_item_metadata_bytes || bytes.size() > max_text_bytes || !maximum ||
      maximum > max_text_bytes || bytes.size() - image_item_metadata_bytes > maximum || bytes[0] ||
      bytes[1] != 1 || bytes[2] || bytes[3])
    throw ProtocolError();
  const auto width = get(bytes, 4), height = get(bytes, 8), count = get(bytes, 12);
  const auto actual = bytes.size() - image_item_metadata_bytes;
  if (count != actual)
    throw ProtocolError();
  size(width, height, actual, maximum);
  return {width, height, bytes.subspan(image_item_metadata_bytes)};
}
} // namespace bridge::ipc::clipboard
