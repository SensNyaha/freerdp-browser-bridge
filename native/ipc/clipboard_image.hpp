#pragma once
#include "clipboard.hpp"

namespace bridge::ipc::clipboard {
inline constexpr std::size_t image_item_metadata_bytes = 16;
struct ImageItem {
  std::uint32_t width = 0, height = 0;
  ::bridge::compat::span<const std::uint8_t> rgba;
};
// Inner image schema 1: compact top-down straight sRGB RGBA8. No PNG/DIB header,
// path, stride, compression, bitmap handle or optional textual fallback.
// An outer negotiated image operation/owner is still required. No current
// command or capability is extended by this independently checked item codec.
void validate_image_item(const ImageItem &, std::size_t maximum = max_text_bytes);
// Additionally admit the actual canonical native DIBV5 representation.
void validate_image_write(const ImageItem &, std::size_t maximum = max_text_bytes);
std::vector<std::uint8_t> encode_image_item(const ImageItem &,
                                            std::size_t maximum = max_text_bytes);
// Returned pixels borrow immutable input after header/geometry/quota admission.
ImageItem decode_image_item(::bridge::compat::span<const std::uint8_t>,
                            std::size_t maximum = max_text_bytes);
} // namespace bridge::ipc::clipboard
