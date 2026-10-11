#include "audin_provider.hpp"
#include <bit>
#include <cstring>
#include <exception>
#include <winpr/error.h>

namespace bridge::audio {
namespace {
bool arguments(const ADDIN_ARGV *args) noexcept {
  return args && args->argc == 2 && args->argv && args->argv[0] && args->argv[1] &&
         std::strcmp(args->argv[0], AUDIN_CHANNEL_NAME) == 0 &&
         std::strcmp(args->argv[1], "sys:browser") == 0;
}
} // namespace
std::atomic<AudinProvider *> AudinProvider::active_{nullptr};
bool AudinProvider::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
AudinProvider::~AudinProvider() {
  if (bound_) {
    (void)close();
    if (bound_)
      std::terminate();
  }
}
UINT AudinProvider::bind(rdpContext &context, AudinSource &source) noexcept {
  if (bound_ || used_ || source.retired())
    return ERROR_INVALID_STATE;
  if (!source.stats() || !context.settings ||
      !freerdp_settings_get_bool(context.settings, FreeRDP_SynchronousDynamicChannels) ||
      freerdp_settings_get_bool(context.settings, FreeRDP_AsyncChannels) ||
      freerdp_settings_get_bool(context.settings, FreeRDP_AsyncUpdate))
    return ERROR_INVALID_PARAMETER;
  AudinProvider *empty = nullptr;
  if (!active_.compare_exchange_strong(empty, this))
    return ERROR_INVALID_STATE;
  const auto result = scope_.bind(context, load);
  if (result != CHANNEL_RC_OK) {
    active_.store(nullptr);
    return result;
  }
  context_ = &context;
  source_ = &source;
  thread_ = std::this_thread::get_id();
  bound_ = used_ = true;
  return CHANNEL_RC_OK;
}
PVIRTUALCHANNELENTRY AudinProvider::load(LPCSTR name, LPCSTR subsystem, LPCSTR type,
                                         DWORD flags) noexcept {
  auto *provider = active_.load();
  if (name && std::strcmp(name, AUDIN_CHANNEL_NAME) == 0) {
    if (subsystem) {
      const bool allowed = provider && provider->bound_ && provider->on_thread() &&
                           !provider->loading_ && !provider->entering_ && !provider->attempted_ &&
                           !provider->source_->retired() && provider->scope_.active() && !type &&
                           flags == 0 && std::strcmp(subsystem, "browser") == 0;
      return std::bit_cast<PVIRTUALCHANNELENTRY>(
          static_cast<PFREERDP_AUDIN_DEVICE_ENTRY>(allowed ? entry : denied));
    }
    // Non-null refusal prevents FreeRDP's dynamic-library fallback. The actual
    // linked channel is exercised directly in fixtures, not activated here.
    if (flags & FREERDP_ADDIN_CHANNEL_DYNAMIC)
      return std::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PDVC_PLUGIN_ENTRY>(dynamic_denied));
    if (flags & FREERDP_ADDIN_CHANNEL_ENTRYEX)
      return std::bit_cast<PVIRTUALCHANNELENTRY>(
          static_cast<PVIRTUALCHANNELENTRYEX>(static_ex_denied));
    return static_denied;
  }
  if (!provider || !provider->bound_ || !provider->on_thread() || provider->loading_ ||
      provider->entering_ || !provider->scope_.active() || !provider->scope_.previous())
    return nullptr;
  provider->loading_ = true;
  PVIRTUALCHANNELENTRY result = nullptr;
  try {
    result = provider->scope_.previous()(name, subsystem, type, flags);
  } catch (...) {
  }
  provider->loading_ = false;
  return result;
}
UINT VCAPITYPE AudinProvider::denied(PFREERDP_AUDIN_DEVICE_ENTRY_POINTS) noexcept {
  return ERROR_INVALID_STATE;
}
UINT VCAPITYPE AudinProvider::dynamic_denied(IDRDYNVC_ENTRY_POINTS *) noexcept {
  return ERROR_NOT_SUPPORTED;
}
BOOL VCAPITYPE AudinProvider::static_denied(PCHANNEL_ENTRY_POINTS) noexcept { return FALSE; }
BOOL VCAPITYPE AudinProvider::static_ex_denied(PCHANNEL_ENTRY_POINTS_EX, LPVOID) noexcept {
  return FALSE;
}
UINT VCAPITYPE AudinProvider::entry(PFREERDP_AUDIN_DEVICE_ENTRY_POINTS points) noexcept {
  auto *provider = active_.load();
  if (!provider || !provider->bound_ || !provider->on_thread() || provider->loading_ ||
      provider->entering_ || provider->attempted_ || provider->source_->retired() ||
      !provider->scope_.active())
    return ERROR_INVALID_STATE;
  if (!points || !points->plugin || !points->pRegisterAudinDevice ||
      points->rdpcontext != provider->context_ || !arguments(points->args))
    return ERROR_INVALID_PARAMETER;
  provider->entering_ = provider->attempted_ = true;
  UINT result = ERROR_INTERNAL_ERROR;
  try {
    // Even a failure/exception can follow host ownership transfer. Never retry.
    result = points->pRegisterAudinDevice(points->plugin, &provider->source_->device());
  } catch (...) {
  }
  provider->entering_ = false;
  return result;
}
UINT AudinProvider::close() noexcept {
  if (!bound_)
    return CHANNEL_RC_OK;
  if (!on_thread() || loading_ || entering_ || active_.load() != this || !scope_.top())
    return ERROR_INVALID_STATE;
  if (!source_->retire())
    return ERROR_INVALID_STATE;
  const auto result = scope_.close();
  if (scope_.bound())
    return result;
  bound_ = false;
  context_ = nullptr;
  source_ = nullptr;
  active_.store(nullptr);
  return result;
}
} // namespace bridge::audio
