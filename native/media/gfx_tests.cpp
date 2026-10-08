#include "avc_decode_probe.hpp"
#include "gdi_dirty.hpp"
#include "gfx.hpp"
#include "video_encoder.hpp"
#include <catch2/catch_test_macros.hpp>
#include <cstdlib>
#include <freerdp/gdi/dc.h>
#include <freerdp/gdi/region.h>
#include <freerdp/settings.h>
#include <memory>
#include <vector>
using namespace bridge::media;
namespace {
struct Fixture;
struct Client {
  GfxClientContext base;
  Fixture *fixture;
};
void release_dc(GDI_DC *dc) {
  if (!gdi_DeleteDC(dc))
    std::terminate();
}
struct Fixture {
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{
      nullptr, freerdp_client_context_free};
  std::unique_ptr<GDI_DC, decltype(&release_dc)> dc{gdi_CreateDC(PIXEL_FORMAT_BGRA32), release_dc};
  rdpGdi gdi{};
  gdiBitmap primary{};
  RdpgfxClientContext channel{};
  struct Surface {
    UINT16 id = 0;
    void *data = nullptr;
  };
  std::array<Surface, 16> surfaces{};
  std::array<void *, 4096> cache{};
  std::vector<BYTE> pixels;
  DirtyRegions dirty;
  Gfx gfx;
  std::uint32_t paints = 0;
  explicit Fixture(std::size_t surface_budget = Gfx::surface_limit,
                   std::size_t cache_budget = Gfx::cache_limit)
      : gfx(surface_budget, cache_budget) {
    RDP_CLIENT_ENTRY_POINTS entry{};
    entry.Size = sizeof(entry);
    entry.Version = RDP_CLIENT_INTERFACE_VERSION;
    entry.ContextSize = sizeof(Client);
    context.reset(freerdp_client_context_new(&entry));
    REQUIRE(context);
    context->codecs = freerdp_client_codecs_new(THREADING_FLAGS_DISABLE_THREADS);
    REQUIRE(context->codecs);
    reinterpret_cast<Client *>(context.get())->fixture = this;
    const auto boolean = [&](auto key, BOOL value) {
      REQUIRE(freerdp_settings_set_bool(context->settings, key, value));
    };
    boolean(FreeRDP_SynchronousDynamicChannels, TRUE);
    boolean(FreeRDP_AsyncChannels, FALSE);
    boolean(FreeRDP_AsyncUpdate, FALSE);
    boolean(FreeRDP_RemoteApplicationMode, FALSE);
    boolean(FreeRDP_BitmapCachePersistEnabled, FALSE);
    boolean(FreeRDP_DeactivateClientDecoding, FALSE);
    boolean(FreeRDP_GfxSmallCache, TRUE);
    boolean(FreeRDP_SoftwareGdi, TRUE);
    REQUIRE(dc);
    dc->hwnd = static_cast<HGDI_WND>(std::calloc(1, sizeof(GDI_WND)));
    REQUIRE(dc->hwnd);
    dc->hwnd->invalid = gdi_CreateRectRgn(0, 0, 0, 0);
    REQUIRE(dc->hwnd->invalid);
    dc->hwnd->count = 64;
    dc->hwnd->cinvalid = static_cast<HGDI_RGN>(std::calloc(64, sizeof(GDI_RGN)));
    REQUIRE(dc->hwnd->cinvalid);
    primary.hdc = dc.get();
    gdi.hdc = dc.get();
    gdi.primary = &primary;
    gdi.context = context.get();
    gdi.dstFormat = PIXEL_FORMAT_BGRA32;
    context->gdi = &gdi;
    context->update->BeginPaint = [](rdpContext *ctx) {
      return begin_gdi_paint(ctx->gdi) ? TRUE : FALSE;
    };
    context->update->EndPaint = [](rdpContext *ctx) {
      auto &f = *reinterpret_cast<Client *>(ctx)->fixture;
      ++f.paints;
      return end_gdi_paint(ctx->gdi, f.dirty) ? TRUE : FALSE;
    };
    context->update->DesktopResize = [](rdpContext *ctx) {
      auto &f = *reinterpret_cast<Client *>(ctx)->fixture;
      f.resize(freerdp_settings_get_uint32(ctx->settings, FreeRDP_DesktopWidth),
               freerdp_settings_get_uint32(ctx->settings, FreeRDP_DesktopHeight));
      return TRUE;
    };
    resize(80, 48);
    channel.handle = this; // Fixture storage replaces the DVC plugin, not FreeRDP GFX rendering.
    channel.GetSurfaceIds = [](RdpgfxClientContext *c, UINT16 **ids, UINT16 *count) {
      auto &f = *static_cast<Fixture *>(c->handle);
      *count = 0;
      *ids = static_cast<UINT16 *>(std::calloc(f.surfaces.size(), sizeof(UINT16)));
      if (!*ids)
        return UINT{ERROR_NOT_ENOUGH_MEMORY};
      for (const auto &s : f.surfaces)
        if (s.data)
          (*ids)[(*count)++] = s.id;
      return UINT{CHANNEL_RC_OK};
    };
    channel.GetSurfaceData = [](RdpgfxClientContext *c, UINT16 id) -> void * {
      for (const auto &s : static_cast<Fixture *>(c->handle)->surfaces)
        if (s.id == id && s.data)
          return s.data;
      return nullptr;
    };
    channel.SetSurfaceData = [](RdpgfxClientContext *c, UINT16 id, void *data) {
      auto &f = *static_cast<Fixture *>(c->handle);
      for (auto &s : f.surfaces)
        if (s.id == id && s.data) {
          s.data = data;
          return UINT{CHANNEL_RC_OK};
        }
      if (!data)
        return UINT{CHANNEL_RC_OK};
      for (auto &s : f.surfaces)
        if (!s.data) {
          s = {id, data};
          return UINT{CHANNEL_RC_OK};
        }
      return UINT{ERROR_NOT_ENOUGH_MEMORY};
    };
    channel.GetCacheSlotData = [](RdpgfxClientContext *c, UINT16 slot) -> void * {
      auto &f = *static_cast<Fixture *>(c->handle);
      return slot && slot <= f.cache.size() ? f.cache[slot - 1] : nullptr;
    };
    channel.SetCacheSlotData = [](RdpgfxClientContext *c, UINT16 slot, void *data) {
      auto &f = *static_cast<Fixture *>(c->handle);
      if (!slot || slot > f.cache.size())
        return UINT{ERROR_INVALID_DATA};
      f.cache[slot - 1] = data;
      return UINT{CHANNEL_RC_OK};
    };
  }
  ~Fixture() {
    if (!gfx.unbind())
      std::terminate();
    context->gdi = nullptr; // Stack fixture metadata is not an upstream gdi_init allocation.
  }
  void resize(UINT32 width, UINT32 height) {
    REQUIRE(freerdp_settings_set_uint32(context->settings, FreeRDP_DesktopWidth, width));
    REQUIRE(freerdp_settings_set_uint32(context->settings, FreeRDP_DesktopHeight, height));
    gdi.width = static_cast<INT32>(width);
    gdi.height = static_cast<INT32>(height);
    gdi.stride = width * 4;
    pixels.assign(static_cast<std::size_t>(gdi.stride) * height, 0);
    gdi.primary_buffer = pixels.data();
    dirty.resize(width, height);
  }
  bool bind() { return gfx.bind(reinterpret_cast<Client *>(context.get())->base, &channel); }
  UINT create(UINT16 id, UINT16 width = 32, UINT16 height = 32) {
    const RDPGFX_CREATE_SURFACE_PDU pdu{id, width, height, GFX_PIXEL_FORMAT_ARGB_8888};
    return channel.CreateSurface(&channel, &pdu);
  }
};
} // namespace
TEST_CASE("Public GFX frame end copies mapped pixels through bounded GDI dirty tracking") {
  auto fixture = std::make_unique<Fixture>();
  auto &f = *fixture;
  REQUIRE(f.bind());
  REQUIRE(f.create(0) == CHANNEL_RC_OK);
  REQUIRE(f.create(0) == ERROR_INVALID_DATA);
  const RDPGFX_MAP_SURFACE_TO_OUTPUT_PDU mapping{0, 0, 7, 9};
  REQUIRE(f.channel.MapSurfaceToOutput(&f.channel, &mapping) == CHANNEL_RC_OK);
  f.dirty.consume(f.dirty.revision());
  const RDPGFX_START_FRAME_PDU start{0, 1};
  REQUIRE(f.channel.StartFrame(&f.channel, &start) == CHANNEL_RC_OK);
  const RECTANGLE_16 rectangle{2, 3, 6, 5};
  const RDPGFX_COLOR32 red{0, 0, 255, 255};
  const RDPGFX_SOLID_FILL_PDU fill{0, red, 1, const_cast<RECTANGLE_16 *>(&rectangle)};
  REQUIRE(f.channel.SolidFill(&f.channel, &fill) == CHANNEL_RC_OK);
  REQUIRE(f.paints == 0);
  REQUIRE(f.dirty.snapshot().count == 0);
  const RDPGFX_END_FRAME_PDU end{1};
  REQUIRE(f.channel.EndFrame(&f.channel, &end) == CHANNEL_RC_OK);
  REQUIRE(f.paints == 1);
  REQUIRE(f.dirty.snapshot().rectangles[0] == DirtyRect{9, 12, 4, 2});
  for (int y = 0; y < 48; ++y)
    for (int x = 0; x < 80; ++x) {
      const auto offset = static_cast<std::size_t>(y * 80 + x) * 4;
      const bool changed = x >= 9 && x < 13 && y >= 12 && y < 14;
      REQUIRE(f.pixels[offset + 2] == (changed ? 255 : 0));
    }
  const auto revision = f.dirty.revision();
  REQUIRE(f.channel.EndFrame(&f.channel, &end) == CHANNEL_RC_OK);
  REQUIRE(f.dirty.revision() == revision);
  REQUIRE(f.gfx.unbind());
  REQUIRE_FALSE(f.gfx.bound());
  REQUIRE(f.gdi.gfx == nullptr);
  REQUIRE(f.channel.custom == nullptr);
  REQUIRE(f.channel.DeleteSurface == nullptr);
  REQUIRE(f.gfx.surface_bytes() == 0);
  REQUIRE(f.bind()); // Channel recreation after teardown.
  REQUIRE(f.create(0) == CHANNEL_RC_OK);
}
TEST_CASE("GFX rejects asynchronous binding and invalid remote allocations before upstream work") {
  auto fixture = std::make_unique<Fixture>();
  auto &f = *fixture;
  REQUIRE(
      freerdp_settings_set_bool(f.context->settings, FreeRDP_SynchronousDynamicChannels, FALSE));
  REQUIRE_FALSE(f.bind());
  REQUIRE(freerdp_settings_set_bool(f.context->settings, FreeRDP_SynchronousDynamicChannels, TRUE));
  REQUIRE(f.bind());
  REQUIRE(f.create(0, 0) == ERROR_INVALID_DATA);
  REQUIRE(f.create(0, 7681) == ERROR_INVALID_DATA);
  REQUIRE(f.create(0, 32, 4321) == ERROR_INVALID_DATA);
  REQUIRE(f.gfx.surface_bytes() == 0);
  for (UINT16 i = 0; i < 16; ++i)
    REQUIRE(f.create(i) == CHANNEL_RC_OK);
  const auto bytes = f.gfx.surface_bytes();
  REQUIRE(f.create(16) == ERROR_NOT_ENOUGH_MEMORY);
  REQUIRE(f.gfx.surface_bytes() == bytes);
  const RDPGFX_DELETE_SURFACE_PDU remove{5};
  REQUIRE(f.channel.DeleteSurface(&f.channel, &remove) == CHANNEL_RC_OK);
  REQUIRE(f.gfx.surface_bytes() < bytes);
  REQUIRE(f.create(16) == CHANNEL_RC_OK);
  const RDPGFX_MAP_SURFACE_TO_SCALED_OUTPUT_PDU mapping{0, 0, UINT32_MAX, 0, 80, 48};
  REQUIRE(f.channel.MapSurfaceToScaledOutput(&f.channel, &mapping) == ERROR_INVALID_DATA);
  RDPGFX_RESET_GRAPHICS_PDU reset{7681, 48, 0, nullptr};
  REQUIRE(f.channel.ResetGraphics(&f.channel, &reset) == ERROR_INVALID_DATA);
  REQUIRE(f.gdi.width == 80);
  reset = {96, 64, 0, nullptr};
  REQUIRE(f.channel.ResetGraphics(&f.channel, &reset) == CHANNEL_RC_OK);
  REQUIRE(f.gdi.width == 96);
  REQUIRE(f.dirty.snapshot().rectangles[0] == DirtyRect{0, 0, 96, 64});
  UINT other_thread = CHANNEL_RC_OK;
  std::thread thread([&] { other_thread = f.create(17); });
  thread.join();
  REQUIRE(other_thread == ERROR_INVALID_DATA);
}
TEST_CASE("GFX session cache replacement eviction and teardown keep bounded accounting") {
  auto fixture = std::make_unique<Fixture>();
  auto &f = *fixture;
  REQUIRE(f.bind());
  REQUIRE(f.create(1) == CHANNEL_RC_OK);
  RDPGFX_SURFACE_TO_CACHE_PDU store{1, 7, 1, {0, 0, 32, 32}};
  REQUIRE(f.channel.SurfaceToCache(&f.channel, &store) == CHANNEL_RC_OK);
  const auto bytes = f.gfx.cache_bytes();
  REQUIRE(bytes >= 32 * 32 * 4);
  REQUIRE(f.channel.SurfaceToCache(&f.channel, &store) == CHANNEL_RC_OK);
  REQUIRE(f.gfx.cache_bytes() == bytes);
  store.cacheSlot = 4097;
  REQUIRE(f.channel.SurfaceToCache(&f.channel, &store) == ERROR_INVALID_DATA);
  store.cacheSlot = 2;
  store.rectSrc.right = 33;
  REQUIRE(f.channel.SurfaceToCache(&f.channel, &store) == ERROR_INVALID_DATA);
  REQUIRE(f.gfx.cache_bytes() == bytes);
  const RDPGFX_EVICT_CACHE_ENTRY_PDU evict{1};
  REQUIRE(f.channel.EvictCacheEntry(&f.channel, &evict) == CHANNEL_RC_OK);
  REQUIRE(f.gfx.cache_bytes() == 0);
  RDPGFX_CACHE_IMPORT_REPLY_PDU reply{};
  reply.importedEntriesCount = 2;
  reply.cacheSlots[0] = 1;
  reply.cacheSlots[1] = 4096;
  REQUIRE(f.channel.CacheImportReply(&f.channel, &reply) == CHANNEL_RC_OK);
  REQUIRE(f.gfx.cache_bytes() == 2 * sizeof(gdiGfxCacheEntry));
  REQUIRE(f.gfx.unbind());
  REQUIRE(f.cache[0] == nullptr);
  REQUIRE(f.cache[4095] == nullptr);
  REQUIRE(f.gfx.cache_bytes() == 0);
}
TEST_CASE("GFX byte budgets include padding metadata and transient cache replacement allocation") {
  auto fixture = std::make_unique<Fixture>(10U * 1024U, 8U * 1024U);
  auto &f = *fixture;
  REQUIRE(f.bind());
  REQUIRE(f.create(0, 31, 31) == CHANNEL_RC_OK);
  const auto *surface = static_cast<gdiGfxSurface *>(f.channel.GetSurfaceData(&f.channel, 0));
  REQUIRE(surface);
  REQUIRE(f.gfx.surface_bytes() ==
          static_cast<std::size_t>(surface->scanline) * surface->height + sizeof(*surface));
  const auto one = f.gfx.surface_bytes();
  REQUIRE(f.create(1, 31, 31) == CHANNEL_RC_OK);
  REQUIRE(f.gfx.surface_bytes() == one * 2);
  REQUIRE(f.create(2, 31, 31) == ERROR_NOT_ENOUGH_MEMORY);
  REQUIRE(f.channel.GetSurfaceData(&f.channel, 2) == nullptr);
  RDPGFX_SURFACE_TO_CACHE_PDU store{0, 1, 1, {0, 0, 32, 32}};
  REQUIRE(f.channel.SurfaceToCache(&f.channel, &store) == CHANNEL_RC_OK);
  const auto bytes = f.gfx.cache_bytes();
  REQUIRE(bytes > 4096);
  REQUIRE(f.channel.SurfaceToCache(&f.channel, &store) == ERROR_NOT_ENOUGH_MEMORY);
  REQUIRE(f.gfx.cache_bytes() == bytes);
  store.cacheSlot = 2;
  REQUIRE(f.channel.SurfaceToCache(&f.channel, &store) == ERROR_NOT_ENOUGH_MEMORY);
  REQUIRE(f.channel.GetCacheSlotData(&f.channel, 2) == nullptr);
  const RDPGFX_EVICT_CACHE_ENTRY_PDU evict{1};
  REQUIRE(f.channel.EvictCacheEntry(&f.channel, &evict) == CHANNEL_RC_OK);
  REQUIRE(f.channel.SurfaceToCache(&f.channel, &store) == CHANNEL_RC_OK);
  REQUIRE(f.gfx.cache_bytes() == bytes);
}
TEST_CASE("Public GFX inter-frame output preserves origin pixels and rejects unavailable scaling") {
  auto fixture = std::make_unique<Fixture>();
  auto &f = *fixture;
  REQUIRE(f.bind());
  REQUIRE(f.create(0) == CHANNEL_RC_OK);
  RDPGFX_MAP_SURFACE_TO_SCALED_OUTPUT_PDU mapping{0, 0, 0, 0, 64, 32};
  REQUIRE(f.channel.MapSurfaceToScaledOutput(&f.channel, &mapping) == ERROR_NOT_SUPPORTED);
  const auto *surface = static_cast<gdiGfxSurface *>(f.channel.GetSurfaceData(&f.channel, 0));
  REQUIRE_FALSE(surface->outputMapped);
  mapping.targetWidth = 32;
  REQUIRE(f.channel.MapSurfaceToScaledOutput(&f.channel, &mapping) == CHANNEL_RC_OK);
  f.dirty.consume(f.dirty.revision());
  std::array<BYTE, 16> pixels{0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255};
  RDPGFX_SURFACE_COMMAND command{};
  command.surfaceId = 0;
  command.codecId = RDPGFX_CODECID_UNCOMPRESSED;
  command.format = PIXEL_FORMAT_BGRA32;
  command.left = command.top = 0;
  command.right = command.bottom = command.width = command.height = 2;
  command.length = static_cast<UINT32>(pixels.size());
  command.data = pixels.data();
  REQUIRE(f.channel.SurfaceCommand(&f.channel, &command) == CHANNEL_RC_OK);
  REQUIRE(f.paints == 1);
  REQUIRE(f.dirty.snapshot().rectangles[0] == DirtyRect{0, 0, 2, 2});
  REQUIRE(f.pixels[1] == 255);
  REQUIRE(f.pixels[4 + 1] == 255);
  REQUIRE(f.pixels[4 * 2 + 1] == 0);
  const auto revision = f.dirty.revision();
  command.length = 15;
  REQUIRE(f.channel.SurfaceCommand(&f.channel, &command) != CHANNEL_RC_OK);
  REQUIRE(f.dirty.revision() == revision);
  REQUIRE(f.paints == 1);
}
namespace {
struct AvcCommand {
  std::vector<BYTE> bytes;
  RDPGFX_H264_QUANT_QUALITY quality{};
  RECTANGLE_16 region;
  RDPGFX_AVC420_BITMAP_STREAM stream{};
  RDPGFX_SURFACE_COMMAND command{};
  AvcCommand(const AvcUnit &unit, RECTANGLE_16 rectangle)
      : bytes(bridge::diagnostics::AvcDecodeProbe::annex_b(unit)), region(rectangle) {
    stream.meta = {1, &region, &quality};
    stream.data = bytes.data();
    stream.length = static_cast<UINT32>(bytes.size());
    command.surfaceId = 0;
    command.codecId = RDPGFX_CODECID_AVC420;
    command.format = PIXEL_FORMAT_BGRA32;
    command.right = command.width = 64;
    command.bottom = command.height = 32;
    command.data = bytes.data();
    command.length = static_cast<UINT32>(bytes.size());
    command.extra = &stream;
  }
};
} // namespace
TEST_CASE("Public GFX AVC420 decodes IDR and predictive regions into the canonical desktop") {
  auto fixture = std::make_unique<Fixture>();
  auto &f = *fixture;
  REQUIRE(f.bind());
  REQUIRE(f.create(0, 64, 32) == CHANNEL_RC_OK);
  const RDPGFX_MAP_SURFACE_TO_OUTPUT_PDU mapping{0, 0, 7, 9};
  REQUIRE(f.channel.MapSurfaceToOutput(&f.channel, &mapping) == CHANNEL_RC_OK);
  f.dirty.consume(f.dirty.revision());
  SoftwareH264Encoder encoder;
  // Browser encoding uses limited-range YUV: these neutral inputs encode Y=50/222.
  // RDP's full-range YUV-to-RGB conversion preserves that luma, not the source RGB.
  std::vector<BYTE> source(64 * 32 * 4, 40);
  AvcCommand initial(encoder.encode({source, 64, 32, 64 * 4, 1000}, true), {0, 0, 64, 32});
  const RDPGFX_START_FRAME_PDU start{0, 1};
  const RDPGFX_END_FRAME_PDU end{1};
  REQUIRE(f.channel.StartFrame(&f.channel, &start) == CHANNEL_RC_OK);
  REQUIRE(f.channel.SurfaceCommand(&f.channel, &initial.command) == CHANNEL_RC_OK);
  REQUIRE(f.paints == 0);
  REQUIRE(f.channel.EndFrame(&f.channel, &end) == CHANNEL_RC_OK);
  REQUIRE(f.paints == 1);
  REQUIRE(f.dirty.snapshot().rectangles[0] == DirtyRect{7, 9, 64, 32});
  for (int y = 0; y < 48; ++y)
    for (int x = 0; x < 80; ++x) {
      const auto offset = static_cast<std::size_t>(y * 80 + x) * 4;
      const bool inside = x >= 7 && x < 71 && y >= 9 && y < 41;
      for (std::size_t component = 0; component < 3; ++component)
        REQUIRE(std::abs(static_cast<int>(f.pixels[offset + component]) - (inside ? 50 : 0)) <=
                (inside ? 5 : 0));
    }
  f.dirty.consume(f.dirty.revision());
  const auto before = f.pixels;
  for (int y = 0; y < 16; ++y)
    for (int x = 0; x < 16; ++x) {
      const auto offset = static_cast<std::size_t>(y * 64 + x) * 4;
      source[offset] = source[offset + 1] = source[offset + 2] = 240;
    }
  const auto delta = encoder.encode({source, 64, 32, 64 * 4, 34333}, false);
  REQUIRE_FALSE(delta.keyframe);
  AvcCommand changed(delta, {0, 0, 16, 16});
  REQUIRE(f.channel.SurfaceCommand(&f.channel, &changed.command) == CHANNEL_RC_OK);
  REQUIRE(f.paints == 2); // Inter-frame path: no StartFrame/EndFrame needed.
  REQUIRE(f.dirty.snapshot().rectangles[0] == DirtyRect{7, 9, 16, 16});
  for (int y = 0; y < 48; ++y)
    for (int x = 0; x < 80; ++x) {
      const auto offset = static_cast<std::size_t>(y * 80 + x) * 4;
      const bool inside = x >= 7 && x < 23 && y >= 9 && y < 25;
      for (std::size_t component = 0; component < 3; ++component)
        REQUIRE(std::abs(static_cast<int>(f.pixels[offset + component]) -
                         (inside ? 222 : before[offset + component])) <= (inside ? 5 : 0));
    }
  const auto revision = f.dirty.revision();
  const auto pixels = f.pixels;
  std::array<BYTE, 6> corrupt{0, 0, 0, 1, 0x67, 0};
  changed.command.data = changed.stream.data = corrupt.data();
  changed.command.length = changed.stream.length = static_cast<UINT32>(corrupt.size());
  REQUIRE(f.channel.SurfaceCommand(&f.channel, &changed.command) == CHANNEL_RC_OK);
  // Pinned OpenH264 can return zero for an incomplete SPS. Upstream GDI then
  // invalidates the region without new pixels; retain and test that behavior.
  REQUIRE(f.dirty.revision() > revision);
  REQUIRE(f.pixels == pixels);
  REQUIRE(f.paints == 3);
  AvcCommand recovery(encoder.encode({source, 64, 32, 64 * 4, 67666}, true), {0, 0, 64, 32});
  REQUIRE(f.channel.SurfaceCommand(&f.channel, &recovery.command) == CHANNEL_RC_OK);
  REQUIRE(f.paints == 4);
  REQUIRE(f.dirty.revision() > revision);
  REQUIRE(std::abs(static_cast<int>(f.pixels[(9 * 80 + 7) * 4]) - 222) <= 5);
  REQUIRE(f.gfx.unbind());
  REQUIRE(f.bind());
  REQUIRE(f.create(0, 64, 32) == CHANNEL_RC_OK);
  REQUIRE(f.channel.MapSurfaceToOutput(&f.channel, &mapping) == CHANNEL_RC_OK);
  REQUIRE(f.channel.SurfaceCommand(&f.channel, &recovery.command) == CHANNEL_RC_OK);
  REQUIRE(f.paints == 5); // Fresh surface/decoder accepts the config + IDR.
}
TEST_CASE("GFX AVC420 rejects malformed commands before allocating a decoder or mutating pixels") {
  auto fixture = std::make_unique<Fixture>();
  auto &f = *fixture;
  REQUIRE(f.bind());
  REQUIRE(f.create(0, 64, 32) == CHANNEL_RC_OK);
  std::array<BYTE, 8> data{};
  RECTANGLE_16 region{0, 0, 64, 32};
  RDPGFX_H264_QUANT_QUALITY quality{};
  RDPGFX_AVC420_BITMAP_STREAM stream{{1, &region, &quality}, 8, data.data()};
  RDPGFX_SURFACE_COMMAND command{};
  command.codecId = RDPGFX_CODECID_AVC420;
  command.right = command.width = 64;
  command.bottom = command.height = 32;
  command.data = data.data();
  command.length = static_cast<UINT32>(data.size());
  command.extra = &stream;
  const auto *surface = static_cast<gdiGfxSurface *>(f.channel.GetSurfaceData(&f.channel, 0));
  const auto rejected = [&](const RDPGFX_SURFACE_COMMAND &invalid) {
    REQUIRE(f.channel.SurfaceCommand(&f.channel, &invalid) == ERROR_INVALID_DATA);
    REQUIRE(surface->h264 == nullptr);
    REQUIRE(f.paints == 0);
  };
  auto invalid = command;
  invalid.surfaceId = UINT16_MAX + 1U;
  rejected(invalid);
  invalid = command;
  invalid.length = Gfx::command_limit + 1;
  rejected(invalid);
  invalid = command;
  invalid.extra = nullptr;
  rejected(invalid);
  invalid = command;
  invalid.right = 65;
  rejected(invalid);
  stream.meta.numRegionRects = Gfx::avc_region_limit + 1;
  rejected(command);
  stream.meta.numRegionRects = 1;
  stream.meta.regionRects = nullptr;
  rejected(command);
  stream.meta.regionRects = &region;
  region.bottom = 33;
  rejected(command);
  region.bottom = 32;
  stream.length = 9;
  rejected(command);
  stream.length = 1;
  stream.data = data.data() + data.size();
  rejected(command);
  stream.data = data.data();
  stream.meta.quantQualityVals = nullptr;
  rejected(command);
  command.codecId = RDPGFX_CODECID_AVC444;
  REQUIRE(f.channel.SurfaceCommand(&f.channel, &command) == ERROR_NOT_SUPPORTED);
  REQUIRE(surface->h264 == nullptr);
}
