#include "dvc_plugin_proxy.hpp"
#include <exception>
#include <stdexcept>
#include <type_traits>
#include <winpr/error.h>

namespace bridge::channels {
DvcPluginProxy::DvcPluginProxy(IWTSPlugin &original, ManagerResolver resolver, void *context)
    : box_{{}, this}, original_(&original), resolver_(resolver), resolver_context_(context) {
  static_assert(std::is_standard_layout_v<Box>);
  if (!resolver)
    throw std::invalid_argument("Invalid DVC plugin manager resolver");
  box_.api = original;
  box_.api.Initialize = initialize;
  box_.api.Connected = connected;
  box_.api.Disconnected = disconnected;
  box_.api.Attached = attached;
  box_.api.Detached = detached;
  box_.api.Terminated = terminated;
}
DvcPluginProxy::~DvcPluginProxy() {
  if (state_.busy)
    std::terminate();
}
DvcPluginProxy &DvcPluginProxy::owner(IWTSPlugin *p) noexcept {
  return *reinterpret_cast<Box *>(p)->owner;
}
UINT DvcPluginProxy::initialize(IWTSPlugin *p, IWTSVirtualChannelManager *manager) noexcept {
  auto &self = owner(p);
  if (!manager)
    return ERROR_INVALID_PARAMETER;
  if (self.state_.busy)
    return ERROR_IO_PENDING;
  if (self.state_.closed || self.state_.ended || self.state_.initialize_attempted)
    return ERROR_INVALID_STATE;
  self.state_.initialize_attempted = self.state_.busy = true;
  UINT status = ERROR_INTERNAL_ERROR;
  bool cancelled = false;
  try {
    auto *facade = self.resolver_(self.resolver_context_, *manager);
    if (!facade)
      status = ERROR_INVALID_DATA;
    else if (self.state_.closed) {
      status = ERROR_INVALID_STATE;
      cancelled = true;
    } else
      status = self.original_->Initialize ? self.original_->Initialize(self.original_, facade)
                                          : CHANNEL_RC_OK;
  } catch (...) {
  }
  self.state_.busy = false;
  if (status != CHANNEL_RC_OK) {
    self.state_.failed = self.state_.failed || !cancelled;
    self.close();
  }
  return status;
}
UINT DvcPluginProxy::notify(unsigned kind, DWORD code) noexcept {
  if (state_.busy)
    return ERROR_IO_PENDING;
  if (state_.ended || (state_.closed && (kind == 0 || kind == 2)))
    return ERROR_INVALID_STATE;
  state_.busy = true;
  UINT status = CHANNEL_RC_OK;
  try {
    switch (kind) {
    case 0:
      if (original_->Connected)
        status = original_->Connected(original_);
      break;
    case 1:
      if (original_->Disconnected)
        status = original_->Disconnected(original_, code);
      break;
    case 2:
      if (original_->Attached)
        status = original_->Attached(original_);
      break;
    case 3:
      if (original_->Detached)
        status = original_->Detached(original_);
      break;
    }
  } catch (...) {
    status = ERROR_INTERNAL_ERROR;
  }
  state_.busy = false;
  if (status != CHANNEL_RC_OK) {
    state_.failed = true;
    close();
  }
  return status;
}
UINT DvcPluginProxy::connected(IWTSPlugin *p) noexcept { return owner(p).notify(0); }
UINT DvcPluginProxy::disconnected(IWTSPlugin *p, DWORD code) noexcept {
  return owner(p).notify(1, code);
}
UINT DvcPluginProxy::attached(IWTSPlugin *p) noexcept { return owner(p).notify(2); }
UINT DvcPluginProxy::detached(IWTSPlugin *p) noexcept { return owner(p).notify(3); }
UINT DvcPluginProxy::terminated(IWTSPlugin *p) noexcept {
  auto &self = owner(p);
  if (self.state_.busy)
    return ERROR_IO_PENDING; // Caller must not destroy a currently borrowed plugin.
  if (self.state_.ended)
    return self.state_.termination_status;
  self.close();
  self.state_.ended = self.state_.busy = true;
  auto *original = self.original_;
  const auto callback = original->Terminated;
  self.original_ = nullptr; // The callback can delete its own plugin.
  UINT status = CHANNEL_RC_OK;
  try {
    if (callback)
      status = callback(original);
  } catch (...) {
    status = ERROR_INTERNAL_ERROR;
  }
  self.state_.busy = false;
  self.state_.termination_status = status;
  self.state_.failed = self.state_.failed || status != CHANNEL_RC_OK;
  return status; // Never inspect the original after Terminated, even on failure.
}
} // namespace bridge::channels
