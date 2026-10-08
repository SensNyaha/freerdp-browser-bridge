#include "gfx.hpp"
#include <algorithm>
#include <freerdp/settings.h>
#include <winpr/error.h>

namespace bridge::media {
namespace {
bool extent(UINT32 width, UINT32 height) noexcept {
  return width > 0 && height > 0 && width <= 7680 && height <= 4320;
}
std::size_t align16(std::size_t value) noexcept { return (value + 15U) & ~std::size_t{15U}; }
bool origin(RdpgfxClientContext *context, UINT32 x, UINT32 y) noexcept {
  const auto *gdi = static_cast<rdpGdi *>(context->custom);
  return gdi->width > 0 && gdi->height > 0 && x < static_cast<UINT32>(gdi->width) &&
         y < static_cast<UINT32>(gdi->height);
}
} // namespace
Gfx::Gfx(std::size_t surface_budget, std::size_t cache_budget)
    : surface_budget_((std::min)(surface_budget, surface_limit)),
      cache_budget_((std::min)(cache_budget, cache_limit)) {}
Gfx *Gfx::owner(RdpgfxClientContext *context) noexcept {
  if (!context || !context->custom)
    return nullptr;
  const auto *gdi = static_cast<rdpGdi *>(context->custom);
  if (!gdi->context)
    return nullptr;
  auto *self = reinterpret_cast<GfxClientContext *>(gdi->context)->gfx;
  return self && self->context_ == context && self->thread_ == std::this_thread::get_id() ? self
                                                                                          : nullptr;
}
Gfx::~Gfx() { (void)unbind(); }
bool Gfx::bind(GfxClientContext &client, RdpgfxClientContext *context) noexcept {
  auto &base = client.base.context;
  if (context_ || client.gfx || !context || context->custom || !base.gdi || !base.settings ||
      !base.codecs || base.gdi->context != &base || base.gdi->gfx ||
      !freerdp_settings_get_bool(base.settings, FreeRDP_SynchronousDynamicChannels) ||
      freerdp_settings_get_bool(base.settings, FreeRDP_AsyncChannels) ||
      freerdp_settings_get_bool(base.settings, FreeRDP_AsyncUpdate) ||
      freerdp_settings_get_bool(base.settings, FreeRDP_RemoteApplicationMode) ||
      freerdp_settings_get_bool(base.settings, FreeRDP_BitmapCachePersistEnabled) ||
      freerdp_settings_get_bool(base.settings, FreeRDP_DeactivateClientDecoding) ||
      !freerdp_settings_get_bool(base.settings, FreeRDP_GfxSmallCache) || !context->GetSurfaceIds ||
      !context->GetSurfaceData || !context->SetSurfaceData || !context->GetCacheSlotData ||
      !context->SetCacheSlotData)
    return false;
  if (!gdi_graphics_pipeline_init(base.gdi, context)) {
    // Pinned init can fail before initializing mux; uninit is not safe in that case.
    freerdp_client_codecs_free(context->codecs);
    context->codecs = nullptr;
    context->custom = nullptr;
    base.gdi->gfx = nullptr;
    return false;
  }
  client_ = &client;
  client.gfx = this;
  context_ = context;
  thread_ = std::this_thread::get_id();
  create_ = context->CreateSurface;
  delete_ = context->DeleteSurface;
  reset_ = context->ResetGraphics;
  store_ = context->SurfaceToCache;
  evict_ = context->EvictCacheEntry;
  import_reply_ = context->CacheImportReply;
  map_ = context->MapSurfaceToOutput;
  map_scaled_ = context->MapSurfaceToScaledOutput;
  context->CreateSurface = create;
  context->DeleteSurface = remove;
  context->ResetGraphics = reset;
  context->SurfaceToCache = store;
  context->EvictCacheEntry = evict;
  context->CacheImportReply = import_reply;
  context->ImportCacheEntry = import_entry;
  context->MapSurfaceToOutput = map;
  context->MapSurfaceToScaledOutput = map_scaled;
  context->MapSurfaceToWindow = map_window;
  context->MapSurfaceToScaledWindow = map_scaled_window;
  return true;
}
bool Gfx::unbind() noexcept {
  if (!context_)
    return true;
  bool ok = true;
  // Usually channel OnClose has already freed these. Also handle early disconnect/failure.
  for (const auto &surface : surfaces_) {
    if (surface.bytes) {
      const RDPGFX_DELETE_SURFACE_PDU pdu{surface.id};
      if (delete_(context_, &pdu) != CHANNEL_RC_OK)
        ok = false;
    }
  }
  for (std::size_t i = 0; i < cache_.size(); ++i) {
    if (cache_[i]) {
      const RDPGFX_EVICT_CACHE_ENTRY_PDU pdu{static_cast<UINT16>(i + 1)};
      if (evict_(context_, &pdu) != CHANNEL_RC_OK)
        ok = false;
    }
  }
  gdi_graphics_pipeline_uninit(client_->base.context.gdi, context_);
  // Context termination can invoke these again; no callbacks may outlive custom/gdi.
  context_->CreateSurface = nullptr;
  context_->DeleteSurface = nullptr;
  context_->EvictCacheEntry = nullptr;
  context_->ResetGraphics = nullptr;
  context_->StartFrame = nullptr;
  context_->EndFrame = nullptr;
  context_->SurfaceCommand = nullptr;
  context_->DeleteEncodingContext = nullptr;
  context_->SolidFill = nullptr;
  context_->SurfaceToSurface = nullptr;
  context_->SurfaceToCache = nullptr;
  context_->CacheToSurface = nullptr;
  context_->CacheImportReply = nullptr;
  context_->ImportCacheEntry = nullptr;
  context_->ExportCacheEntry = nullptr;
  context_->MapSurfaceToOutput = nullptr;
  context_->MapSurfaceToScaledOutput = nullptr;
  context_->MapSurfaceToWindow = nullptr;
  context_->MapSurfaceToScaledWindow = nullptr;
  context_->UpdateSurfaces = nullptr;
  client_->gfx = nullptr;
  client_ = nullptr;
  context_ = nullptr;
  surfaces_ = {};
  cache_.fill(0);
  surface_bytes_ = cache_bytes_ = 0;
  return ok;
}
UINT Gfx::create(RdpgfxClientContext *context, const RDPGFX_CREATE_SURFACE_PDU *pdu) {
  auto *self = owner(context);
  if (!self || !pdu || !extent(pdu->width, pdu->height) ||
      (pdu->pixelFormat != GFX_PIXEL_FORMAT_ARGB_8888 &&
       pdu->pixelFormat != GFX_PIXEL_FORMAT_XRGB_8888) ||
      context->GetSurfaceData(context, pdu->surfaceId))
    return ERROR_INVALID_DATA;
  const auto available = std::find_if(self->surfaces_.begin(), self->surfaces_.end(),
                                      [](const auto &s) { return !s.bytes; });
  const auto bytes =
      (align16(pdu->width) * 4U + 16U) * align16(pdu->height) + sizeof(gdiGfxSurface);
  if (available == self->surfaces_.end() || bytes > self->surface_budget_ - self->surface_bytes_)
    return ERROR_NOT_ENOUGH_MEMORY;
  const auto rc = self->create_(context, pdu);
  if (rc == CHANNEL_RC_OK) {
    *available = {pdu->surfaceId, bytes};
    self->surface_bytes_ += bytes;
  }
  return rc;
}
UINT Gfx::remove(RdpgfxClientContext *context, const RDPGFX_DELETE_SURFACE_PDU *pdu) {
  auto *self = owner(context);
  if (!self || !pdu)
    return ERROR_INVALID_DATA;
  const auto rc = self->delete_(context, pdu);
  if (rc == CHANNEL_RC_OK) {
    for (auto &surface : self->surfaces_) {
      if (surface.bytes && surface.id == pdu->surfaceId) {
        self->surface_bytes_ -= surface.bytes;
        surface = {};
        break;
      }
    }
  }
  return rc;
}
UINT Gfx::reset(RdpgfxClientContext *context, const RDPGFX_RESET_GRAPHICS_PDU *pdu) {
  auto *self = owner(context);
  if (!self || !pdu || !extent(pdu->width, pdu->height) || pdu->monitorCount > 16 ||
      (pdu->monitorCount && !pdu->monitorDefArray))
    return ERROR_INVALID_DATA;
  return self->reset_(context, pdu);
}
UINT Gfx::store(RdpgfxClientContext *context, const RDPGFX_SURFACE_TO_CACHE_PDU *pdu) {
  auto *self = owner(context);
  if (!self || !pdu || !pdu->cacheSlot || pdu->cacheSlot > self->cache_.size())
    return ERROR_INVALID_DATA;
  const auto *surface =
      static_cast<gdiGfxSurface *>(context->GetSurfaceData(context, pdu->surfaceId));
  const auto &r = pdu->rectSrc;
  if (!surface || r.right <= r.left || r.bottom <= r.top || r.right > surface->width ||
      r.bottom > surface->height)
    return ERROR_INVALID_DATA;
  const auto bytes = align16(static_cast<std::size_t>(r.right - r.left) * 4U) *
                         static_cast<std::size_t>(r.bottom - r.top) +
                     sizeof(gdiGfxCacheEntry);
  // Upstream allocates the replacement before evicting the old entry.
  if (bytes > self->cache_budget_ - self->cache_bytes_)
    return ERROR_NOT_ENOUGH_MEMORY;
  const auto rc = self->store_(context, pdu);
  if (rc == CHANNEL_RC_OK) {
    self->cache_[pdu->cacheSlot - 1] = bytes;
    self->cache_bytes_ += bytes;
  }
  return rc;
}
UINT Gfx::evict(RdpgfxClientContext *context, const RDPGFX_EVICT_CACHE_ENTRY_PDU *pdu) {
  auto *self = owner(context);
  if (!self || !pdu || !pdu->cacheSlot || pdu->cacheSlot > self->cache_.size())
    return ERROR_INVALID_DATA;
  const auto rc = self->evict_(context, pdu);
  if (rc == CHANNEL_RC_OK) {
    self->cache_bytes_ -= self->cache_[pdu->cacheSlot - 1];
    self->cache_[pdu->cacheSlot - 1] = 0;
  }
  return rc;
}
UINT Gfx::import_reply(RdpgfxClientContext *context, const RDPGFX_CACHE_IMPORT_REPLY_PDU *pdu) {
  auto *self = owner(context);
  if (!self || !pdu || pdu->importedEntriesCount > self->cache_.size())
    return ERROR_INVALID_DATA;
  for (UINT16 i = 0; i < pdu->importedEntriesCount; ++i)
    if (pdu->cacheSlots[i] > self->cache_.size())
      return ERROR_INVALID_DATA;
  if (sizeof(gdiGfxCacheEntry) * pdu->importedEntriesCount >
      self->cache_budget_ - self->cache_bytes_)
    return ERROR_NOT_ENOUGH_MEMORY;
  const auto rc = self->import_reply_(context, pdu);
  // Reconcile even a partial upstream failure without allocating metadata.
  self->cache_bytes_ = 0;
  for (std::size_t i = 0; i < self->cache_.size(); ++i) {
    const auto *entry = static_cast<gdiGfxCacheEntry *>(
        context->GetCacheSlotData(context, static_cast<UINT16>(i + 1)));
    self->cache_[i] =
        entry ? static_cast<std::size_t>(entry->scanline) * entry->height + sizeof(*entry) : 0;
    self->cache_bytes_ += self->cache_[i];
  }
  return rc;
}
UINT Gfx::import_entry(RdpgfxClientContext *, UINT16, const PERSISTENT_CACHE_ENTRY *) {
  return ERROR_NOT_SUPPORTED; // Session cache only; persistence is disabled in worker settings.
}
UINT Gfx::map(RdpgfxClientContext *context, const RDPGFX_MAP_SURFACE_TO_OUTPUT_PDU *pdu) {
  auto *self = owner(context);
  if (!self || !pdu || !origin(context, pdu->outputOriginX, pdu->outputOriginY))
    return ERROR_INVALID_DATA;
  return self->map_(context, pdu);
}
UINT Gfx::map_scaled(RdpgfxClientContext *context,
                     const RDPGFX_MAP_SURFACE_TO_SCALED_OUTPUT_PDU *pdu) {
  auto *self = owner(context);
  if (!self || !pdu || !extent(pdu->targetWidth, pdu->targetHeight) ||
      !origin(context, pdu->outputOriginX, pdu->outputOriginY))
    return ERROR_INVALID_DATA;
  const auto *surface =
      static_cast<gdiGfxSurface *>(context->GetSurfaceData(context, pdu->surfaceId));
  if (!surface)
    return ERROR_INVALID_DATA;
  // The pinned private build has no Cairo scaler. Reject before setting outputMapped.
  if (pdu->targetWidth != surface->mappedWidth || pdu->targetHeight != surface->mappedHeight)
    return ERROR_NOT_SUPPORTED;
  return self->map_scaled_(context, pdu);
}
UINT Gfx::map_window(RdpgfxClientContext *, const RDPGFX_MAP_SURFACE_TO_WINDOW_PDU *) {
  return ERROR_NOT_SUPPORTED;
}
UINT Gfx::map_scaled_window(RdpgfxClientContext *,
                            const RDPGFX_MAP_SURFACE_TO_SCALED_WINDOW_PDU *) {
  return ERROR_NOT_SUPPORTED;
}
} // namespace bridge::media
