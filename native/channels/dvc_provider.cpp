#include "dvc_provider.hpp"
#include <bit>
#include <cstring>
#include <exception>
#include <winpr/error.h>

namespace bridge::channels {
std::atomic<DvcProvider *> DvcProvider::active_{nullptr};
bool DvcProvider::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
DvcProvider::~DvcProvider() {
  if (scope_.bound()) {
    (void)close();
    if (scope_.bound())
      std::terminate();
  }
}
UINT DvcProvider::bind(rdpContext &context) noexcept {
  if (used_ || scope_.bound() || registry_.stats().closed)
    return ERROR_INVALID_STATE;
  if (!context.settings ||
      !freerdp_settings_get_bool(context.settings, FreeRDP_SynchronousDynamicChannels) ||
      freerdp_settings_get_bool(context.settings, FreeRDP_AsyncChannels) ||
      freerdp_settings_get_bool(context.settings, FreeRDP_AsyncUpdate))
    return ERROR_INVALID_PARAMETER;
  DvcProvider *empty = nullptr;
  if (!active_.compare_exchange_strong(empty, this))
    return ERROR_INVALID_STATE;
  const auto status = scope_.bind(context, load);
  if (status != CHANNEL_RC_OK) {
    active_.store(nullptr);
    return status;
  }
  used_ = true;
  context_ = &context;
  thread_ = std::this_thread::get_id();
  return CHANNEL_RC_OK;
}
PVIRTUALCHANNELENTRY DvcProvider::load(LPCSTR name, LPCSTR subsystem, LPCSTR type,
                                       DWORD flags) noexcept {
  auto *self = active_.load();
  const auto refused = std::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PDVC_PLUGIN_ENTRY>(denied));
  const bool dynamic = (flags & FREERDP_ADDIN_CHANNEL_DYNAMIC) != 0;
  if (!self || !self->on_thread() || !self->scope_.active() || self->loading_ ||
      !self->scope_.previous())
    return dynamic ? refused : nullptr;
  if (dynamic) {
    if (self->entering_ || self->registry_.stats().closed || !name || subsystem || type ||
        flags != FREERDP_ADDIN_CHANNEL_DYNAMIC)
      return refused;
    std::size_t length = 0;
    while (length < 128 && name[length])
      ++length;
    if (!length || length == 128)
      return refused;
    for (const auto &candidate : self->entries_)
      if (candidate.delegate && std::strcmp(candidate.name.data(), name) == 0)
        return std::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PDVC_PLUGIN_ENTRY>(entry));
    Entry *slot = nullptr;
    for (auto &candidate : self->entries_)
      if (!candidate.delegate) {
        slot = &candidate;
        break;
      }
    if (!slot)
      return refused;
    self->loading_ = true;
    PVIRTUALCHANNELENTRY original = nullptr;
    try {
      original = self->scope_.previous()(name, subsystem, type, flags);
    } catch (...) {
    }
    self->loading_ = false;
    if (!original || self->registry_.stats().closed)
      return refused; // Non-null refusal blocks dynamic-library fallback.
    std::memcpy(slot->name.data(), name, length + 1);
    slot->delegate = std::bit_cast<PDVC_PLUGIN_ENTRY>(original);
    return std::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PDVC_PLUGIN_ENTRY>(entry));
  }
  self->loading_ = true;
  PVIRTUALCHANNELENTRY original = nullptr;
  try {
    original = self->scope_.previous()(name, subsystem, type, flags);
  } catch (...) {
  }
  self->loading_ = false;
  return original; // Nested synchronous device loading is allowed during DVC entry.
}
UINT VCAPITYPE DvcProvider::denied(IDRDYNVC_ENTRY_POINTS *) noexcept { return ERROR_NOT_SUPPORTED; }
UINT VCAPITYPE DvcProvider::entry(IDRDYNVC_ENTRY_POINTS *points) noexcept {
  auto *self = active_.load();
  if (!self || !self->on_thread() || !self->scope_.active() || self->loading_ || self->entering_ ||
      self->registry_.stats().closed)
    return ERROR_INVALID_STATE;
  if (!points || !points->GetPluginData || !points->GetRdpContext || !points->GetRdpSettings)
    return ERROR_INVALID_PARAMETER;
  self->entering_ = true;
  UINT status = ERROR_INTERNAL_ERROR;
  try {
    if (points->GetRdpContext(points) != self->context_ ||
        points->GetRdpSettings(points) != self->context_->settings) {
      status = ERROR_INVALID_PARAMETER;
    } else {
      const auto *args = points->GetPluginData(points);
      status = ERROR_INVALID_PARAMETER;
      if (args && args->argc > 0 && args->argc <= 64 && args->argv && args->argv[0]) {
        std::size_t length = 0;
        while (length < 128 && args->argv[0][length])
          ++length;
        if (length && length < 128) {
          status = ERROR_NOT_SUPPORTED;
          for (const auto &candidate : self->entries_)
            if (candidate.delegate && std::strcmp(candidate.name.data(), args->argv[0]) == 0) {
              status = self->registry_.install(*points, candidate.delegate);
              break;
            }
        }
      }
    }
  } catch (...) {
  }
  self->entering_ = false;
  return status;
}
UINT DvcProvider::close() noexcept {
  if (!scope_.bound())
    return CHANNEL_RC_OK;
  if (!on_thread() || loading_ || entering_ || !scope_.top() || active_.load() != this)
    return ERROR_INVALID_STATE;
  const auto retired = registry_.retire();
  if (retired == ERROR_IO_PENDING)
    return retired;
  const auto status = scope_.close();
  if (scope_.bound())
    return status;
  active_.store(nullptr);
  context_ = nullptr;
  return status != CHANNEL_RC_OK ? status : retired;
}
} // namespace bridge::channels
