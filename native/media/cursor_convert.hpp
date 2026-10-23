#pragma once
#include "cursor.hpp"
#include <freerdp/codec/color.h>
#include <freerdp/graphics.h>
namespace bridge::cursor {
Shape convert(const rdpPointer &pointer, std::uint64_t id, const gdiPalette *palette);
}
