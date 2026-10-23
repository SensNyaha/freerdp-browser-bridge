#include "cursor_convert.hpp"
#include <algorithm>
namespace bridge::cursor {
Shape convert(const rdpPointer &p, std::uint64_t id, const gdiPalette *palette) {
  if (!id || !p.width || !p.height || p.width > max_dimension || p.height > max_dimension ||
      p.xPos >= p.width || p.yPos >= p.height || !p.xorMaskData || !p.lengthXorMask ||
      p.lengthXorMask > max_rgba_bytes ||
      p.lengthAndMask > ((max_dimension + 7) / 8) * max_dimension ||
      (p.lengthAndMask && !p.andMaskData) ||
      (p.xorBpp != 1 && p.xorBpp != 8 && p.xorBpp != 16 && p.xorBpp != 24 && p.xorBpp != 32))
    throw ipc::ProtocolError();
  Shape result{id,
               static_cast<std::uint16_t>(p.width),
               static_cast<std::uint16_t>(p.height),
               static_cast<std::uint16_t>(p.xPos),
               static_cast<std::uint16_t>(p.yPos),
               {}};
  result.rgba.resize(static_cast<std::size_t>(p.width) * p.height * 4);
  if (!freerdp_image_copy_from_pointer_data(result.rgba.data(), PIXEL_FORMAT_RGBA32, p.width * 4, 0,
                                            0, p.width, p.height, p.xorMaskData, p.lengthXorMask,
                                            p.andMaskData, p.lengthAndMask, p.xorBpp, palette))
    throw ipc::ProtocolError();
  return result;
}
} // namespace bridge::cursor
