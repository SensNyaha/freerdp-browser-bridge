#pragma once
#include "dirty_regions.hpp"
#include <freerdp/gdi/gdi.h>

namespace bridge::media {
bool begin_gdi_paint(rdpGdi *gdi) noexcept;
bool end_gdi_paint(rdpGdi *gdi, DirtyRegions &dirty) noexcept;
} // namespace bridge::media
