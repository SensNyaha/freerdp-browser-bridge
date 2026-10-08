#include "gdi_dirty.hpp"

namespace bridge::media {
static HGDI_WND window(rdpGdi *gdi) {
  if (!gdi || !gdi->primary || !gdi->primary->hdc)
    return nullptr;
  return gdi->primary->hdc->hwnd;
}
bool begin_gdi_paint(rdpGdi *gdi) noexcept {
  const auto wnd = window(gdi);
  if (!wnd || !wnd->invalid)
    return false;
  wnd->invalid->null = TRUE;
  wnd->ninvalid = 0;
  return true;
}
bool end_gdi_paint(rdpGdi *gdi, DirtyRegions &dirty) noexcept {
  const auto wnd = window(gdi);
  if (!wnd || !wnd->invalid || wnd->ninvalid < 0 ||
      static_cast<UINT32>(wnd->ninvalid) > wnd->count || (wnd->ninvalid && !wnd->cinvalid))
    return false;
  try {
    if (wnd->ninvalid || !wnd->invalid->null) {
      std::array<DirtyRect, DirtyRegions::capacity> rectangles{};
      std::size_t count = 0;
      const auto copy = [](const GDI_RGN &r) { return DirtyRect{r.x, r.y, r.w, r.h}; };
      if (static_cast<std::size_t>(wnd->ninvalid) > rectangles.size()) {
        // Upstream aggregate bounds can omit a one-pixel region at coordinate zero.
        // Keep work bounded without trusting that aggregate to cover every source rectangle.
        const auto extent = dirty.snapshot();
        rectangles[count++] = {0, 0, static_cast<std::int32_t>(extent.width),
                               static_cast<std::int32_t>(extent.height)};
      } else if (!wnd->ninvalid)
        rectangles[count++] = copy(*wnd->invalid);
      else {
        count = static_cast<std::size_t>(wnd->ninvalid);
        for (std::size_t i = 0; i < count; ++i)
          rectangles[i] = copy(wnd->cinvalid[i]);
      }
      dirty.paint(std::span(rectangles).first(count));
    }
    return begin_gdi_paint(gdi); // Only metadata is cleared; pending dirty state survives.
  } catch (...) {
    return false;
  }
}
} // namespace bridge::media
