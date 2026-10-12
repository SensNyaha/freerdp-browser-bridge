#include "dvc_plugin_registry.hpp"
#include <cstring>
#include <exception>
#include <stdexcept>
#include <type_traits>
#include <winpr/error.h>

namespace bridge::channels {
DvcPluginRegistry::DvcPluginRegistry(DvcChannelRegistry &channels, DvcCompletionHook::Clock clock,
                                     void *context, std::size_t slots)
    : box_{{}, this}, channels_(channels), clock_(clock), clock_context_(context), slots_(slots) {
  static_assert(std::is_standard_layout_v<Box>);
  if (!clock || !slots || slots > capacity)
    throw std::invalid_argument("Invalid DVC plugin registry");
  box_.api.RegisterPlugin = register_plugin;
  box_.api.GetPlugin = get_plugin;
  box_.api.GetPluginData = get_data;
  box_.api.GetRdpSettings = get_settings;
  box_.api.GetRdpContext = get_context;
}
DvcPluginRegistry::~DvcPluginRegistry() {
  const auto state = stats();
  if (state.busy || (state.retained_plugins && !unpublished_))
    std::terminate();
}
DvcPluginRegistry &DvcPluginRegistry::owner(IDRDYNVC_ENTRY_POINTS *p) noexcept {
  return *reinterpret_cast<Box *>(p)->owner;
}
DvcPluginRegistryStats DvcPluginRegistry::stats() const noexcept {
  DvcPluginRegistryStats result{0, closed_, busy_ || resolving_, failed_, unpublished_};
  for (const auto &entry : entries_)
    if (entry.proxy) {
      ++result.retained_plugins;
      const auto proxy = entry.proxy->stats();
      result.busy = result.busy || proxy.busy;
      result.failed = result.failed || proxy.failed;
    }
  if (manager_) {
    const auto manager = manager_->stats();
    result.busy = result.busy || manager.busy;
    result.failed = result.failed || manager.failed;
  }
  result.failed = result.failed || channels_.stats().failed;
  return result;
}
void DvcPluginRegistry::close() noexcept {
  closed_ = true;
  for (auto &entry : entries_)
    if (entry.proxy)
      entry.proxy->close();
  if (manager_)
    manager_->close();
}
UINT DvcPluginRegistry::retire() noexcept {
  close();
  if (stats().busy)
    return ERROR_IO_PENDING;
  const auto status = channels_.retire(); // Original plugin state must still be live if not closed.
  return status != CHANNEL_RC_OK ? status : (stats().failed ? ERROR_INTERNAL_ERROR : CHANNEL_RC_OK);
}
UINT DvcPluginRegistry::host_unpublished() noexcept {
  close();
  if (stats().busy)
    return ERROR_IO_PENDING;
  for (const auto &entry : entries_)
    if (entry.proxy && !entry.proxy->stats().ended)
      return ERROR_INVALID_STATE;
  if (!channels_.stats().resources_retired)
    return ERROR_INVALID_STATE; // Never call a possibly freed channel target after plugin cleanup.
  if (manager_) {
    const auto status = manager_->host_unpublished();
    if (!manager_->stats().retired)
      return status;
    failed_ = failed_ || status != CHANNEL_RC_OK;
  }
  unpublished_ = true;
  return stats().failed ? ERROR_INTERNAL_ERROR : CHANNEL_RC_OK;
}
UINT DvcPluginRegistry::register_plugin(IDRDYNVC_ENTRY_POINTS *p, const char *name,
                                        IWTSPlugin *plugin) noexcept {
  auto &self = owner(p);
  if (!self.host_ || !self.capture_ || self.closed_)
    return ERROR_INVALID_STATE;
  if (!name || !plugin)
    return ERROR_INVALID_PARAMETER;
  if (self.capture_->original)
    return CHANNEL_RC_ALREADY_INITIALIZED; // Pinned channel entries register one plugin.
  std::size_t length = 0;
  while (length < 128 && name[length])
    ++length;
  if (!length || length == 128)
    return ERROR_INVALID_PARAMETER;
  for (const auto &entry : self.entries_)
    if (entry.proxy && (entry.original == plugin || std::strcmp(entry.name.data(), name) == 0))
      return CHANNEL_RC_ALREADY_INITIALIZED;
  std::memcpy(self.capture_->name.data(), name, length + 1);
  self.capture_->original = plugin;
  return CHANNEL_RC_OK; // Do not publish into the host until the pinned entry succeeds.
}
IWTSPlugin *DvcPluginRegistry::get_plugin(IDRDYNVC_ENTRY_POINTS *p, const char *name) noexcept {
  auto &self = owner(p);
  if (!self.host_ || !name || self.closed_)
    return nullptr;
  if (self.capture_ && self.capture_->original &&
      std::strcmp(self.capture_->name.data(), name) == 0)
    return self.capture_->original;
  for (const auto &entry : self.entries_)
    if (entry.proxy && std::strcmp(entry.name.data(), name) == 0)
      return entry.proxy->stats().ended ? nullptr : entry.original;
  try {
    return self.host_->GetPlugin(self.host_,
                                 name); // Original instance, never a bridge private cast.
  } catch (...) {
    self.failed_ = true;
    self.close();
    return nullptr;
  }
}
const ADDIN_ARGV *DvcPluginRegistry::get_data(IDRDYNVC_ENTRY_POINTS *p) noexcept {
  auto &self = owner(p);
  if (!self.host_ || self.closed_ || !self.host_->GetPluginData)
    return nullptr;
  try {
    return self.host_->GetPluginData(self.host_);
  } catch (...) {
    self.failed_ = true;
    self.close();
    return nullptr;
  }
}
rdpSettings *DvcPluginRegistry::get_settings(IDRDYNVC_ENTRY_POINTS *p) noexcept {
  auto &self = owner(p);
  if (!self.host_ || self.closed_ || !self.host_->GetRdpSettings)
    return nullptr;
  try {
    return self.host_->GetRdpSettings(self.host_);
  } catch (...) {
    self.failed_ = true;
    self.close();
    return nullptr;
  }
}
rdpContext *DvcPluginRegistry::get_context(IDRDYNVC_ENTRY_POINTS *p) noexcept {
  auto &self = owner(p);
  if (!self.host_ || self.closed_ || !self.host_->GetRdpContext)
    return nullptr;
  try {
    return self.host_->GetRdpContext(self.host_);
  } catch (...) {
    self.failed_ = true;
    self.close();
    return nullptr;
  }
}
IWTSVirtualChannelManager *DvcPluginRegistry::resolve(void *p, IWTSVirtualChannelManager &native) {
  auto &self = *static_cast<DvcPluginRegistry *>(p);
  if (self.closed_ || self.busy_ || self.resolving_)
    return nullptr;
  if (self.manager_)
    return self.native_manager_ == &native ? self.manager_->interface() : nullptr;
  self.resolving_ = true;
  try {
    self.manager_ = std::make_unique<DvcListenerManager>(native, self.channels_, self.clock_,
                                                         self.clock_context_);
    self.native_manager_ = &native;
  } catch (...) {
    self.resolving_ = false;
    throw;
  }
  self.resolving_ = false;
  return self.closed_ ? nullptr : self.manager_->interface();
}
UINT DvcPluginRegistry::install(IDRDYNVC_ENTRY_POINTS &host, PDVC_PLUGIN_ENTRY entry) noexcept {
  if (!entry || !host.RegisterPlugin || !host.GetPlugin)
    return ERROR_INVALID_PARAMETER;
  if (closed_ || busy_ || unpublished_)
    return ERROR_INVALID_STATE;
  Entry *slot = nullptr;
  for (std::size_t index = 0; index < slots_; ++index)
    if (!entries_[index].proxy) {
      slot = &entries_[index];
      break;
    }
  if (!slot)
    return ERROR_NOT_ENOUGH_MEMORY;
  slot->original = nullptr;
  host_ = &host;
  capture_ = slot;
  busy_ = true;
  UINT status = ERROR_INTERNAL_ERROR;
  try {
    status = entry(&box_.api);
  } catch (...) {
    failed_ = true;
  }
  capture_ = nullptr;
  host_ = nullptr; // The pinned host's stack entry object cannot escape install.
  if (status == CHANNEL_RC_OK && slot->original) {
    try {
      slot->proxy = std::make_unique<DvcPluginProxy>(*slot->original, resolve, this);
      if (closed_)
        status = ERROR_INVALID_STATE;
      else {
        try {
          status = host.RegisterPlugin(&host, slot->name.data(), slot->proxy->interface());
        } catch (...) {
          status = ERROR_INTERNAL_ERROR;
        }
      }
      if (status != CHANNEL_RC_OK) {
        // Entry already succeeded: bridge owns failed publication cleanup. The host
        // may retain a proxy after uncertain failure; keep its inert storage alive.
        auto *api = slot->proxy->interface();
        const auto cleanup = api->Terminated(api);
        failed_ = failed_ || cleanup != CHANNEL_RC_OK;
      }
    } catch (...) {
      status = ERROR_NOT_ENOUGH_MEMORY;
      DvcPluginProxy cleanup(*slot->original, resolve, this);
      auto *api = cleanup.interface();
      (void)api->Terminated(api);
    }
  } else if (status == CHANNEL_RC_OK) {
    status = ERROR_INVALID_DATA;
  }
  // Entry failure owns its own cleanup; its captured pointer may already be freed.
  if (!slot->proxy)
    slot->original = nullptr;
  busy_ = false;
  if (status != CHANNEL_RC_OK) {
    failed_ = true;
    close();
  }
  return status;
}
} // namespace bridge::channels
