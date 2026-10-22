#include "../compat/span.hpp"
#include "gfx_pdu_admission.hpp"

namespace bridge::media {
namespace {
std::uint16_t le16(::bridge::compat::span<const std::uint8_t> bytes, std::size_t at) noexcept {
  return static_cast<std::uint16_t>(bytes[at] | (std::uint16_t{bytes[at + 1]} << 8));
}
std::uint32_t le32(::bridge::compat::span<const std::uint8_t> bytes, std::size_t at) noexcept {
  return bytes[at] | (std::uint32_t{bytes[at + 1]} << 8) | (std::uint32_t{bytes[at + 2]} << 16) |
         (std::uint32_t{bytes[at + 3]} << 24);
}
bool array(::bridge::compat::span<const std::uint8_t> body, std::size_t prefix, std::size_t count,
           std::size_t item) noexcept {
  return body.size() >= prefix && count <= (body.size() - prefix) / item;
}
bool wire(::bridge::compat::span<const std::uint8_t> body, bool first, GfxPduLimits limits) noexcept {
  const std::size_t prefix = first ? 17U : 13U;
  if (body.size() < prefix)
    return false;
  const auto count = le32(body, prefix - 4);
  if (count > 8U * 1024U * 1024U || count > body.size() - prefix)
    return false;
  const auto codec = le16(body, 2);
  if (codec == 14 || codec == 15)
    return false; // AVC444/v2 is explicitly unsupported by the current renderer.
  // Pinned wire-to-surface-2 calls logSurfaceCommand directly, without AVC metadata parsing.
  if (!first || codec != 11)
    return true;
  const auto bitmap = body.subspan(prefix, count);
  if (bitmap.size() < 4)
    return false;
  const auto regions = le32(bitmap, 0);
  return regions <= limits.regions && array(bitmap, 4, regions, 10);
}
bool body(std::uint16_t command, ::bridge::compat::span<const std::uint8_t> bytes,
          GfxPduLimits limits) noexcept {
  switch (command) {
  case 1:
  case 2:
    return wire(bytes, command == 1, limits);
  case 4: // SolidFill: fixed 8-byte prefix, 8-byte rectangles.
    return bytes.size() >= 8 && array(bytes, 8, le16(bytes, 6), 8);
  case 5: // SurfaceToSurface: 14-byte prefix, 4-byte destination points.
    return bytes.size() >= 14 && array(bytes, 14, le16(bytes, 12), 4);
  case 7: // CacheToSurface: 6-byte prefix, 4-byte destination points.
    return bytes.size() >= 6 && array(bytes, 6, le16(bytes, 4), 4);
  case 14: // ResetGraphics has a mandatory 340-byte total PDU including padding.
    return bytes.size() >= 332 && le32(bytes, 0) > 0 && le32(bytes, 0) <= 7680 &&
           le32(bytes, 4) > 0 && le32(bytes, 4) <= 4320 && le32(bytes, 8) <= 16 &&
           array(bytes, 12, le32(bytes, 8), 20);
  case 17: // CacheImportReply uses a fixed SDK array; bridge supports 4096 entries.
    return bytes.size() >= 2 && le16(bytes, 0) <= 4096 && array(bytes, 2, le16(bytes, 0), 2);
  default:
    return true; // Other command semantics remain with pinned parser/public renderer.
  }
}
} // namespace
bool admit_gfx_pdus(::bridge::compat::span<const std::uint8_t> bytes, GfxPduLimits limits) noexcept {
  if (!limits.bytes || limits.bytes > GfxPduLimits::hard_bytes || !limits.pdus ||
      limits.pdus > GfxPduLimits::hard_pdus || !limits.regions ||
      limits.regions > GfxPduLimits::hard_regions || bytes.empty() || bytes.size() > limits.bytes)
    return false;
  std::size_t count = 0;
  while (!bytes.empty()) {
    if (++count > limits.pdus || bytes.size() < 8)
      return false;
    const auto length = le32(bytes, 4);
    if (length < 8 || length > bytes.size() ||
        !body(le16(bytes, 0), bytes.subspan(8, length - 8), limits))
      return false;
    bytes = bytes.subspan(length);
  }
  return true;
}
} // namespace bridge::media
