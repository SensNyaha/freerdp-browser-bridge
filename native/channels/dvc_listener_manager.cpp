#include "dvc_listener_manager.hpp"
#include <cstring>
#include <exception>
#include <stdexcept>
#include <type_traits>
#include <winpr/error.h>

namespace bridge::channels {
DvcListenerManager::DvcListenerManager(IWTSVirtualChannelManager &original,
                                       DvcChannelRegistry &registry, DvcCompletionHook::Clock clock,
                                       void *clock_context, std::size_t slots)
    : box_{{}, this}, pinned_(original), registry_(registry), clock_(clock),
      clock_context_(clock_context), slots_(slots) {
  static_assert(std::is_standard_layout_v<Box>);
  if (!clock || !slots || slots > capacity)
    throw std::invalid_argument("Invalid DVC listener manager");
  box_.api = *pinned_.interface();
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
DvcListenerManager::~DvcListenerManager() {
  // Host-held pointers must never outlive proxy storage, including failed destroy.
  if (stats().live_listeners || stats().busy)
    std::terminate();
}
DvcListenerManager &DvcListenerManager::owner(IWTSVirtualChannelManager *p) noexcept {
  return *reinterpret_cast<Box *>(p)->owner;
}
void DvcListenerManager::close() noexcept {
  closed_ = true;
  for (auto &entry : entries_)
    if (entry.proxy)
      entry.proxy->close();
}
DvcListenerManagerStats DvcListenerManager::stats() const noexcept {
  DvcListenerManagerStats result{0, closed_, busy_, failed_, retired_};
  for (const auto &entry : entries_) {
    if (entry.listener)
      ++result.live_listeners;
    if (entry.proxy) {
      const auto proxy = entry.proxy->stats();
      result.busy = result.busy || proxy.busy;
      result.failed = result.failed || proxy.failed;
    }
  }
  return result;
}
UINT DvcListenerManager::retire() noexcept {
  close();
  const auto state = stats();
  if (state.busy)
    return ERROR_IO_PENDING;
  if (state.live_listeners)
    return ERROR_INVALID_STATE;
  failed_ = state.failed;
  pinned_.retire();
  box_.api.GetChannelId = nullptr;
  box_.api.GetChannelName = nullptr;
  retired_ = true;
  return failed_ ? ERROR_INTERNAL_ERROR : CHANNEL_RC_OK;
}
UINT DvcListenerManager::host_unpublished() noexcept {
  close();
  if (stats().busy)
    return ERROR_IO_PENDING;
  failed_ = stats().failed;
  for (auto &entry : entries_) {
    entry.listener = nullptr;
    entry.proxy.reset();
  }
  return retire();
}
UINT DvcListenerManager::create(IWTSVirtualChannelManager *p, const char *name, ULONG flags,
                                IWTSListenerCallback *callback, IWTSListener **out) noexcept {
  auto &self = owner(p);
  if (!out)
    return ERROR_INVALID_PARAMETER;
  *out = &self.fallback_;
  if (self.closed_)
    return ERROR_INVALID_STATE;
  if (self.busy_) {
    self.failed_ = true;
    self.close();
    return ERROR_INVALID_STATE;
  }
  if (!name || !callback || !callback->OnNewChannelConnection)
    return ERROR_INVALID_PARAMETER;
  std::size_t length = 0;
  while (length < 128 && name[length])
    ++length;
  if (!length || length == 128)
    return ERROR_INVALID_PARAMETER;
  for (const auto &entry : self.entries_)
    if (entry.proxy && std::strcmp(entry.name.data(), name) == 0)
      return ERROR_ALREADY_EXISTS; // Pinned hash insertion otherwise replaces a live listener.
  Entry *slot = nullptr;
  for (std::size_t index = 0; index < self.slots_; ++index)
    if (!self.entries_[index].proxy) {
      slot = &self.entries_[index];
      break;
    }
  if (!slot)
    return ERROR_NOT_ENOUGH_MEMORY; // Refuse before proxy/native allocation.
  self.busy_ = true;
  UINT status = ERROR_NOT_ENOUGH_MEMORY;
  try {
    std::memcpy(slot->name.data(), name, length + 1);
    slot->proxy = std::make_unique<DvcListenerProxy>(self.registry_, *self.pinned_.interface(),
                                                     *callback, self.clock_, self.clock_context_);
    IWTSListener *created = nullptr;
    auto *manager = self.pinned_.interface();
    status = manager->CreateListener(manager, name, flags, slot->proxy->interface(), &created);
    if (status == CHANNEL_RC_OK) {
      slot->listener = created; // Success is a native ownership token, even after close.
      *out = created;
      if (self.closed_)
        slot->proxy->close();
    } else {
      slot->proxy.reset(); // Failed pinned output is never inspected or destroyed.
    }
  } catch (...) {
    slot->proxy.reset();
    self.failed_ = true;
    self.close();
  }
  self.busy_ = false;
  return status;
}
UINT DvcListenerManager::destroy(IWTSVirtualChannelManager *p, IWTSListener *listener) noexcept {
  auto &self = owner(p);
  if (listener == &self.fallback_)
    return CHANNEL_RC_OK;
  for (auto &entry : self.entries_) {
    if (!listener || entry.listener != listener)
      continue;
    if (self.busy_ || entry.proxy->stats().busy)
      return ERROR_IO_PENDING; // SDK still reads its listener after OnNew returns.
    if (entry.destroy_attempted)
      return entry.destroy_status;
    self.busy_ = true;
    entry.proxy->close();
    entry.destroy_attempted = true;
    auto *manager = self.pinned_.interface();
    entry.destroy_status = manager->DestroyListener(manager, listener);
    const auto status = entry.destroy_status;
    self.failed_ = self.failed_ || entry.proxy->stats().failed || status != CHANNEL_RC_OK;
    if (status == CHANNEL_RC_OK) {
      entry.listener = nullptr;
      entry.proxy.reset(); // Delegate returned: host has unpublished the listener.
      entry.destroy_attempted = false;
    }
    self.busy_ = false;
    return status;
  }
  return ERROR_INVALID_PARAMETER;
}
IWTSVirtualChannel *DvcListenerManager::find(IWTSVirtualChannelManager *p, UINT32 id) noexcept {
  auto &self = owner(p);
  auto *manager = self.pinned_.interface();
  return self.retired_ ? nullptr : manager->FindChannelById(manager, id);
}
} // namespace bridge::channels
