#include "../compat/span.hpp"
#include "display.hpp"

namespace bridge::ipc {
DisplaySize decode_display_resize(::bridge::compat::span<const std::uint8_t> bytes) {
  if (bytes.size() != 4)
    throw ProtocolError();
  // Semantic geometry rejection produces a typed result, not a fatal parser error.
  return {static_cast<std::uint16_t>(read_be(bytes.first(2))),
          static_cast<std::uint16_t>(read_be(bytes.subspan(2, 2)))};
}
std::vector<std::uint8_t> encode_display_update(const DisplayUpdate &u) {
  if (!u.generation || !u.framebuffer_revision || !u.actual.width || u.actual.width > 7680 ||
      !u.actual.height || u.actual.height > 4320 ||
      (u.negotiated ? u.maximum.width != 3840 || u.maximum.height != 2160 || !u.max_area ||
                          u.max_area > 3840U * 2160U
                    : u.maximum.width || u.maximum.height || u.max_area))
    throw ProtocolError();
  std::vector<std::uint8_t> bytes;
  bytes.reserve(display_update_bytes);
  append_be(bytes, u.generation, 8);
  append_be(bytes, u.framebuffer_revision, 8);
  append_be(bytes, u.actual.width, 2);
  append_be(bytes, u.actual.height, 2);
  append_be(bytes, (u.enabled ? 1U : 0U) | (u.negotiated ? 2U : 0U), 1);
  append_be(bytes, 0, 1);
  append_be(bytes, u.maximum.width, 2);
  append_be(bytes, u.maximum.height, 2);
  append_be(bytes, 0, 2);
  append_be(bytes, u.max_area, 4);
  return bytes;
}
std::vector<std::uint8_t> encode_resize_result(ResizeResult result) {
  if (result > ResizeResult::disconnected)
    throw ProtocolError();
  std::vector<std::uint8_t> bytes;
  append_be(bytes, static_cast<std::uint16_t>(result), 2);
  append_be(bytes, 0, 2);
  return bytes;
}
} // namespace bridge::ipc
