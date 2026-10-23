#pragma once
#include <array>
#include <freerdp/client.h>
#include <freerdp/client/rdpgfx.h>
#include <freerdp/gdi/gfx.h>
#include <thread>

namespace bridge::media {
class Gfx;
// FreeRDP allocates this C-compatible prefix; the C++ owner lives outside it.
struct GfxClientContext {
  rdpClientContext base;
  Gfx *gfx;
};
class Gfx {
  struct Surface {
    UINT16 id = 0;
    std::size_t bytes = 0;
  };
  GfxClientContext *client_ = nullptr;
  RdpgfxClientContext *context_ = nullptr;
  std::thread::id thread_;
  std::array<Surface, 16> surfaces_{};
  std::array<std::size_t, 4096> cache_{};
  std::size_t surface_bytes_ = 0, cache_bytes_ = 0;
  std::size_t surface_budget_, cache_budget_;
  pcRdpgfxCreateSurface create_ = nullptr;
  pcRdpgfxDeleteSurface delete_ = nullptr;
  pcRdpgfxResetGraphics reset_ = nullptr;
  pcRdpgfxSurfaceToCache store_ = nullptr;
  pcRdpgfxEvictCacheEntry evict_ = nullptr;
  pcRdpgfxCacheImportReply import_reply_ = nullptr;
  pcRdpgfxMapSurfaceToOutput map_ = nullptr;
  pcRdpgfxMapSurfaceToScaledOutput map_scaled_ = nullptr;
  pcRdpgfxSurfaceCommand command_ = nullptr;
  static Gfx *owner(RdpgfxClientContext *context) noexcept;
  static UINT create(RdpgfxClientContext *, const RDPGFX_CREATE_SURFACE_PDU *);
  static UINT remove(RdpgfxClientContext *, const RDPGFX_DELETE_SURFACE_PDU *);
  static UINT reset(RdpgfxClientContext *, const RDPGFX_RESET_GRAPHICS_PDU *);
  static UINT command(RdpgfxClientContext *, const RDPGFX_SURFACE_COMMAND *);
  static UINT store(RdpgfxClientContext *, const RDPGFX_SURFACE_TO_CACHE_PDU *);
  static UINT evict(RdpgfxClientContext *, const RDPGFX_EVICT_CACHE_ENTRY_PDU *);
  static UINT import_reply(RdpgfxClientContext *, const RDPGFX_CACHE_IMPORT_REPLY_PDU *);
  static UINT import_entry(RdpgfxClientContext *, UINT16, const PERSISTENT_CACHE_ENTRY *);
  static UINT map(RdpgfxClientContext *, const RDPGFX_MAP_SURFACE_TO_OUTPUT_PDU *);
  static UINT map_scaled(RdpgfxClientContext *, const RDPGFX_MAP_SURFACE_TO_SCALED_OUTPUT_PDU *);
  static UINT map_window(RdpgfxClientContext *, const RDPGFX_MAP_SURFACE_TO_WINDOW_PDU *);
  static UINT map_scaled_window(RdpgfxClientContext *,
                                const RDPGFX_MAP_SURFACE_TO_SCALED_WINDOW_PDU *);

public:
  static constexpr std::size_t surface_limit = 256U * 1024U * 1024U;
  static constexpr std::size_t cache_limit = 128U * 1024U * 1024U;
  static constexpr UINT32 command_limit = 8U * 1024U * 1024U;
  static constexpr UINT32 avc_region_limit = 1024;
  explicit Gfx(std::size_t surface_budget = surface_limit, std::size_t cache_budget = cache_limit);
  Gfx(const Gfx &) = delete;
  Gfx &operator=(const Gfx &) = delete;
  ~Gfx();
  bool bind(GfxClientContext &client, RdpgfxClientContext *context) noexcept;
  bool unbind() noexcept;
  bool bound() const noexcept { return context_ != nullptr; }
  std::size_t surface_bytes() const noexcept { return surface_bytes_; }
  std::size_t cache_bytes() const noexcept { return cache_bytes_; }
};
} // namespace bridge::media
