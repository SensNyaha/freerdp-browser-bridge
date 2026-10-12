#include "pinned_dvc_manager.hpp"
#include <stdexcept>
#include <type_traits>
#include <winpr/error.h>

namespace bridge::channels {
PinnedDvcManager::PinnedDvcManager(IWTSVirtualChannelManager &original)
    : box_{{}, this}, original_(&original) {
  static_assert(std::is_standard_layout_v<Box>);
  if (!original.CreateListener || !original.DestroyListener)
    throw std::invalid_argument("Invalid pinned DVC manager");
  box_.api = original;
  box_.api.CreateListener = create;
  box_.api.DestroyListener = destroy;
  box_.api.FindChannelById = find;
  fallback_.GetConfiguration = [](IWTSListener *, void **properties) -> UINT {
    if (!properties)
      return ERROR_INVALID_PARAMETER;
    *properties = nullptr;
    return ERROR_INVALID_STATE;
  };
}
PinnedDvcManager &PinnedDvcManager::owner(IWTSVirtualChannelManager *manager) noexcept {
  return *reinterpret_cast<Box *>(manager)->owner;
}
void PinnedDvcManager::retire() noexcept {
  original_ = nullptr;
  box_.api.GetChannelId = nullptr;
  box_.api.GetChannelName = nullptr;
}
UINT PinnedDvcManager::create(IWTSVirtualChannelManager *manager, const char *name, ULONG flags,
                              IWTSListenerCallback *callback, IWTSListener **out) noexcept {
  auto &self = owner(manager);
  if (!out)
    return ERROR_INVALID_PARAMETER;
  // Pinned generic Initialize writes pInterface even when CreateListener fails.
  *out = &self.fallback_;
  auto *original = self.original_;
  if (!original)
    return ERROR_INVALID_STATE;
  if (!name || !callback || !callback->OnNewChannelConnection)
    return ERROR_INVALID_PARAMETER;
  IWTSListener *created = nullptr;
  UINT status = ERROR_INTERNAL_ERROR;
  try {
    status = original->CreateListener(original, name, flags, callback, &created);
  } catch (...) {
    return ERROR_INTERNAL_ERROR;
  }
  // The pinned host sets output before HashTable_Insert and frees on failure.
  // Failure output is not an ownership token; neither inspect nor destroy it.
  if (status != CHANNEL_RC_OK)
    return status;
  if (!created)
    return ERROR_INVALID_DATA;
  *out = created;
  return status;
}
UINT PinnedDvcManager::destroy(IWTSVirtualChannelManager *manager,
                               IWTSListener *listener) noexcept {
  auto &self = owner(manager);
  if (listener == &self.fallback_)
    return CHANNEL_RC_OK;
  auto *original = self.original_;
  if (!original)
    return ERROR_INVALID_STATE;
  try {
    return original->DestroyListener(original, listener);
  } catch (...) {
    return ERROR_INTERNAL_ERROR;
  }
}
IWTSVirtualChannel *PinnedDvcManager::find(IWTSVirtualChannelManager *manager, UINT32 id) noexcept {
  auto *original = owner(manager).original_;
  if (!original || !original->FindChannelById)
    return nullptr;
  try {
    return original->FindChannelById(original, id);
  } catch (...) {
    return nullptr;
  }
}
} // namespace bridge::channels
