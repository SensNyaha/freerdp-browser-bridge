#include "gdi_dirty.hpp"
#include <catch2/catch_test_macros.hpp>
#include <cstdlib>
#include <freerdp/gdi/dc.h>
#include <freerdp/gdi/region.h>
#include <memory>
using namespace bridge::media;
namespace {
void release(GDI_DC *dc) {
  if (!gdi_DeleteDC(dc))
    std::terminate();
}
struct PaintFixture {
  std::unique_ptr<GDI_DC, decltype(&release)> dc{gdi_CreateDC(PIXEL_FORMAT_BGRA32), release};
  rdpGdi gdi{};
  gdiBitmap primary{};
  PaintFixture() {
    REQUIRE(dc);
    dc->hwnd = static_cast<HGDI_WND>(std::calloc(1, sizeof(GDI_WND)));
    REQUIRE(dc->hwnd);
    dc->hwnd->invalid = gdi_CreateRectRgn(0, 0, 0, 0);
    REQUIRE(dc->hwnd->invalid);
    dc->hwnd->count = 64;
    dc->hwnd->cinvalid = static_cast<HGDI_RGN>(std::calloc(64, sizeof(GDI_RGN)));
    REQUIRE(dc->hwnd->cinvalid);
    primary.hdc = dc.get();
    gdi.primary = &primary;
    gdi.width = 80;
    gdi.height = 48;
  }
};
} // namespace
TEST_CASE("Public FreeRDP paint metadata resets without losing uncaptured desktop changes") {
  PaintFixture fixture;
  auto *gdi = &fixture.gdi;
  auto *dc = gdi->primary->hdc;
  const auto capacity = dc->hwnd->count;
  DirtyRegions dirty;
  dirty.resize(80, 48);
  dirty.consume(1);
  for (int i = 0; i < 1000; ++i) {
    REQUIRE(begin_gdi_paint(gdi));
    REQUIRE(gdi_InvalidateRegion(dc, 10, 10, 2, 2));
    REQUIRE(gdi_InvalidateRegion(dc, 50, 40, 2, 2));
    REQUIRE(dc->hwnd->ninvalid == 2);
    REQUIRE(end_gdi_paint(gdi, dirty));
    REQUIRE(dc->hwnd->ninvalid == 0);
    REQUIRE(dc->hwnd->invalid->null);
    REQUIRE(dc->hwnd->count == capacity);
    REQUIRE(dirty.snapshot().count == 2);
  }
  REQUIRE(dirty.snapshot().revision == 1001);
  REQUIRE(dirty.snapshot().area == 8);
  const auto revision = dirty.snapshot().revision;
  REQUIRE(begin_gdi_paint(gdi));
  REQUIRE(end_gdi_paint(gdi, dirty));
  REQUIRE(dirty.snapshot().revision == revision);
  REQUIRE(dirty.snapshot().area == 8);
}
TEST_CASE("Large public GDI paints cover the full desktop and inconsistent metadata is rejected") {
  PaintFixture fixture;
  auto *gdi = &fixture.gdi;
  auto *dc = gdi->primary->hdc;
  DirtyRegions dirty;
  dirty.resize(80, 48);
  dirty.consume(1);
  REQUIRE(begin_gdi_paint(gdi));
  for (int x = 0; x < 80; ++x)
    REQUIRE(gdi_InvalidateRegion(dc, x, 5, 1, 2));
  REQUIRE(end_gdi_paint(gdi, dirty));
  REQUIRE(dirty.snapshot().count == 1);
  CAPTURE(dirty.snapshot().rectangles[0].x, dirty.snapshot().rectangles[0].y,
          dirty.snapshot().rectangles[0].width, dirty.snapshot().rectangles[0].height);
  REQUIRE(dirty.snapshot().rectangles[0] == DirtyRect{0, 0, 80, 48});
  REQUIRE_FALSE(begin_gdi_paint(nullptr));
  dc->hwnd->ninvalid = -1;
  REQUIRE_FALSE(end_gdi_paint(gdi, dirty));
  dc->hwnd->ninvalid = static_cast<INT32>(dc->hwnd->count) + 1;
  REQUIRE_FALSE(end_gdi_paint(gdi, dirty));
  dc->hwnd->ninvalid = 0;
}
TEST_CASE("Public GDI individual rectangles preserve origin pixels omitted by its aggregate") {
  PaintFixture fixture;
  auto *gdi = &fixture.gdi;
  DirtyRegions dirty;
  dirty.resize(80, 48);
  dirty.consume(1);
  REQUIRE(begin_gdi_paint(gdi));
  REQUIRE(gdi_InvalidateRegion(gdi->primary->hdc, 0, 0, 1, 1));
  REQUIRE(gdi->primary->hdc->hwnd->invalid->null);
  REQUIRE(end_gdi_paint(gdi, dirty));
  REQUIRE(dirty.snapshot().area == 1);
  REQUIRE(dirty.snapshot().rectangles[0] == DirtyRect{0, 0, 1, 1});
}
