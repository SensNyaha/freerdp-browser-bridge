#include "avc_decode_probe.hpp"
#include "gdi_dirty.hpp"
#include "jpeg.hpp"
#include "video_encoder.hpp"
#include <catch2/catch_test_macros.hpp>
#include <cstdlib>
#include <freerdp/client.h>
#include <freerdp/gdi/bitmap.h>
#include <freerdp/gdi/dc.h>
#include <freerdp/gdi/region.h>
#include <freerdp/settings.h>
#include <limits>
#include <memory>
#include <turbojpeg.h>
using namespace bridge::media;
namespace {
void release(GDI_DC *dc) {
  if (!gdi_DeleteDC(dc))
    std::terminate();
}
struct PaintFixture {
  std::unique_ptr<GDI_DC, decltype(&release)> dc{gdi_GetDC(), release};
  rdpGdi gdi{};
  gdiBitmap primary{};
  PaintFixture() {
    REQUIRE(dc);
    dc->format = PIXEL_FORMAT_BGRA32;
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
namespace {
struct ResizeContext {
  rdpClientContext base;
  DirtyRegions *dirty;
};
void release_resize_context(rdpContext *context) {
  gdi_free(context->instance);
  freerdp_client_context_free(context);
}
struct ResizeFixture {
  std::unique_ptr<rdpContext, decltype(&release_resize_context)> context{nullptr,
                                                                         release_resize_context};
  DirtyRegions dirty;
  ResizeFixture() {
    RDP_CLIENT_ENTRY_POINTS entry{};
    entry.Size = sizeof(entry);
    entry.Version = RDP_CLIENT_INTERFACE_VERSION;
    entry.ContextSize = sizeof(ResizeContext);
    context.reset(freerdp_client_context_new(&entry));
    REQUIRE(context);
    reinterpret_cast<ResizeContext *>(context.get())->dirty = &dirty;
    // Public GDI objects provide an initial primary bitmap. Real gdi_resize owns
    // all subsequent allocations. Full gdi_init still needs negotiated RDP caches.
    context->gdi = static_cast<rdpGdi *>(std::calloc(1, sizeof(rdpGdi)));
    REQUIRE(context->gdi);
    auto *gdi = context->gdi;
    gdi->context = context.get();
    gdi->width = gdi->height = 200;
    gdi->dstFormat = PIXEL_FORMAT_BGRA32;
    gdi->hdc = gdi_CreateDC(PIXEL_FORMAT_BGRA32);
    REQUIRE(gdi->hdc);
    std::unique_ptr<GDI_DC, decltype(&release)> primary_dc{gdi_CreateCompatibleDC(gdi->hdc),
                                                           release};
    REQUIRE(primary_dc);
    gdi->primary = static_cast<gdiBitmap *>(std::calloc(1, sizeof(gdiBitmap)));
    REQUIRE(gdi->primary);
    gdi->primary->hdc = primary_dc.release();
    gdi->primary->bitmap = gdi_CreateCompatibleBitmap(gdi->hdc, 200, 200);
    REQUIRE(gdi->primary->bitmap);
    (void)gdi_SelectObject(gdi->primary->hdc, reinterpret_cast<HGDIOBJECT>(gdi->primary->bitmap));
    auto *dc = gdi->primary->hdc;
    dc->hwnd = static_cast<HGDI_WND>(std::calloc(1, sizeof(GDI_WND)));
    REQUIRE(dc->hwnd);
    dc->hwnd->invalid = gdi_CreateRectRgn(0, 0, 0, 0);
    REQUIRE(dc->hwnd->invalid);
    dc->hwnd->invalid->null = TRUE;
    dc->hwnd->count = 32;
    dc->hwnd->cinvalid = static_cast<HGDI_RGN>(std::calloc(32, sizeof(GDI_RGN)));
    REQUIRE(dc->hwnd->cinvalid);
    gdi->primary_buffer = gdi->primary->bitmap->data;
    gdi->stride = gdi->primary->bitmap->scanline;
    gdi->drawing = gdi->primary;
    context->update->EndPaint = [](rdpContext *ctx) {
      return end_gdi_paint(ctx->gdi, *reinterpret_cast<ResizeContext *>(ctx)->dirty) ? TRUE : FALSE;
    };
    settings(200, 200);
    dirty.resize(200, 200);
  }
  void settings(UINT32 width, UINT32 height) {
    REQUIRE(freerdp_settings_set_uint32(context->settings, FreeRDP_DesktopWidth, width));
    REQUIRE(freerdp_settings_set_uint32(context->settings, FreeRDP_DesktopHeight, height));
  }
  void fill(BYTE shade) {
    auto *gdi = context->gdi;
    for (int y = 0; y < gdi->height; ++y)
      for (int x = 0; x < gdi->width; ++x) {
        auto *pixel = gdi->primary_buffer + static_cast<std::size_t>(y) * gdi->stride + x * 4;
        pixel[0] = pixel[1] = pixel[2] = shade;
        pixel[3] = 255;
      }
  }
  VideoFrame frame(std::uint64_t timestamp) {
    const auto *gdi = context->gdi;
    return {{gdi->primary_buffer,
             static_cast<std::size_t>(gdi->stride) * static_cast<std::size_t>(gdi->height)},
            gdi->width,
            gdi->height,
            static_cast<int>(gdi->stride),
            timestamp};
  }
};
} // namespace
TEST_CASE("Server-confirmed GDI resize reallocates and produces fresh decodable AVC and JPEG") {
  ResizeFixture f;
  SoftwareH264Encoder avc;
  JpegEncoder jpeg;
  bridge::diagnostics::AvcDecodeProbe decoder;
  f.fill(40);
  auto unit = avc.encode(f.frame(1000000), false);
  REQUIRE(unit.keyframe);
  const std::vector<BYTE> original_config(unit.config.begin(), unit.config.end());
  REQUIRE(decoder.decode(unit).width == 200);
  f.dirty.consume(f.dirty.revision());
  REQUIRE(gdi_InvalidateRegion(f.context->gdi->primary->hdc, 2, 2, 4, 4));
  const auto before = f.dirty.revision();
  f.settings(320, 240);
  REQUIRE(resize_gdi_desktop(f.context.get(), f.dirty));
  REQUIRE(f.context->gdi->width == 320);
  REQUIRE(f.context->gdi->height == 240);
  REQUIRE(f.context->gdi->primary_buffer);
  REQUIRE(f.context->gdi->stride >= 320 * 4);
  REQUIRE(f.dirty.revision() == before + 2); // EndPaint flush and resize both advance state.
  REQUIRE(f.dirty.snapshot().area == 320 * 240);
  f.fill(240);
  unit = avc.encode(f.frame(1033333), false);
  REQUIRE(unit.keyframe);
  REQUIRE(std::vector<BYTE>(unit.config.begin(), unit.config.end()) != original_config);
  const auto decoded = decoder.decode(unit, 319, 239);
  REQUIRE(decoded.width == 320);
  REQUIRE(decoded.height == 240);
  REQUIRE(std::abs(static_cast<int>(decoded.yuv[0]) - 222) <= 4);
  bridge::diagnostics::AvcDecodeProbe fresh_decoder;
  REQUIRE(fresh_decoder.decode(unit, 319, 239).width == 320);
  const auto frame = f.frame(1066666);
  const auto jpeg_bytes = jpeg.encode(frame.bgra, frame.width, frame.height, frame.stride);
  const std::unique_ptr<void, decltype(&tj3Destroy)> jpeg_decoder(tj3Init(TJINIT_DECOMPRESS),
                                                                  tj3Destroy);
  REQUIRE(jpeg_decoder);
  REQUIRE(tj3DecompressHeader(jpeg_decoder.get(), jpeg_bytes.data(), jpeg_bytes.size()) == 0);
  REQUIRE(tj3Get(jpeg_decoder.get(), TJPARAM_JPEGWIDTH) == 320);
  REQUIRE(tj3Get(jpeg_decoder.get(), TJPARAM_JPEGHEIGHT) == 240);
  std::vector<BYTE> rgb(320 * 240 * 3);
  REQUIRE(tj3Decompress8(jpeg_decoder.get(), jpeg_bytes.data(), jpeg_bytes.size(), rgb.data(),
                         320 * 3, TJPF_RGB) == 0);
  REQUIRE(rgb.back() >= 235);
  const auto revision = f.dirty.revision();
  REQUIRE(resize_gdi_desktop(f.context.get(), f.dirty));
  REQUIRE(f.dirty.revision() == revision + 1); // Same-size GFX reset is still discontinuous.
  REQUIRE(f.dirty.snapshot().area == 320 * 240);
}
TEST_CASE("Invalid server dimensions are rejected before changing GDI buffer or dirty state") {
  ResizeFixture f;
  auto *buffer = f.context->gdi->primary_buffer;
  const auto revision = f.dirty.revision();
  for (const auto size : {std::array<UINT32, 2>{0, 200},
                          {200, 0},
                          {7681, 200},
                          {200, 4321},
                          {(std::numeric_limits<UINT32>::max)(), 200}}) {
    f.settings(size[0], size[1]);
    REQUIRE_FALSE(resize_gdi_desktop(f.context.get(), f.dirty));
    REQUIRE(f.context->gdi->primary_buffer == buffer);
    REQUIRE(f.context->gdi->width == 200);
    REQUIRE(f.context->gdi->height == 200);
    REQUIRE(f.dirty.revision() == revision);
  }
  REQUIRE_FALSE(resize_gdi_desktop(nullptr, f.dirty));
  f.settings(200, 200);
  auto *gdi = f.context->gdi;
  f.context->gdi = nullptr;
  const auto missing_gdi = resize_gdi_desktop(f.context.get(), f.dirty);
  f.context->gdi = gdi;
  REQUIRE_FALSE(missing_gdi);
}
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
