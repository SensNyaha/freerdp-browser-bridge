#include "../compat/bit.hpp"
#include "addin_provider.hpp"
#include <cstring>
#include <exception>
#include <winpr/error.h>

namespace bridge::touch {
std::atomic<AddinProvider *> AddinProvider::active_{nullptr};
bool AddinProvider::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
AddinProvider::~AddinProvider() {
  if (bound_) {
    (void)close();
    if (bound_)
      std::terminate(); // Never leave a global callback pointing at a destroyed owner.
  }
}
UINT AddinProvider::bind(rdpContext &context, PluginRegistration &registration) noexcept {
  if (bound_ || registration.retired())
    return ERROR_INVALID_STATE;
  if (!context.settings ||
      !freerdp_settings_get_bool(context.settings, FreeRDP_SynchronousDynamicChannels) ||
      freerdp_settings_get_bool(context.settings, FreeRDP_AsyncChannels) ||
      freerdp_settings_get_bool(context.settings, FreeRDP_AsyncUpdate))
    return ERROR_INVALID_PARAMETER;
  AddinProvider *empty = nullptr;
  if (!active_.compare_exchange_strong(empty, this))
    return ERROR_INVALID_STATE;
  const auto scoped = scope_.bind(context, load);
  if (scoped != CHANNEL_RC_OK) {
    active_.store(nullptr);
    return scoped;
  }
  context_ = &context;
  registration_ = &registration;
  thread_ = std::this_thread::get_id();
  bound_ = true;
  return CHANNEL_RC_OK;
}
PVIRTUALCHANNELENTRY AddinProvider::load(LPCSTR name, LPCSTR subsystem, LPCSTR type,
                                         DWORD flags) noexcept {
  auto *scope = active_.load();
  // Only the public DVC entry ABI is intercepted. Other addin classes keep the
  // previous provider's behavior; this is not a general dynamic-library policy.
  if (name && std::strcmp(name, RDPEI_CHANNEL_NAME) == 0 &&
      flags == FREERDP_ADDIN_CHANNEL_DYNAMIC) {
    const auto allowed = scope && scope->bound_ && scope->on_thread() && !scope->loading_ &&
                         !scope->entering_ && !subsystem && !type &&
                         !scope->registration_->retired() && scope->scope_.active();
    return ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(
        static_cast<PDVC_PLUGIN_ENTRY>(allowed ? entry : denied));
  }
  if (!scope || !scope->bound_ || !scope->on_thread() || scope->loading_ || scope->entering_ ||
      !scope->scope_.active() || !scope->scope_.previous())
    return nullptr;
  scope->loading_ = true;
  PVIRTUALCHANNELENTRY result = nullptr;
  try {
    result = scope->scope_.previous()(name, subsystem, type, flags);
  } catch (...) {
    // No exception may cross the public C API boundary.
  }
  scope->loading_ = false;
  return result;
}
UINT VCAPITYPE AddinProvider::denied(IDRDYNVC_ENTRY_POINTS *) noexcept {
  // Non-null refusal prevents FreeRDP's null-result dynamic-library fallback for
  // the intercepted DVC request, including wrong selectors or foreign threads.
  return ERROR_INVALID_STATE;
}
UINT VCAPITYPE AddinProvider::entry(IDRDYNVC_ENTRY_POINTS *points) noexcept {
  auto *scope = active_.load();
  if (!scope || !scope->bound_ || !scope->on_thread() || scope->entering_ || scope->loading_ ||
      !scope->scope_.active() || scope->registration_->retired())
    return ERROR_INVALID_STATE;
  if (!points || !points->GetRdpContext)
    return ERROR_INVALID_PARAMETER;
  scope->entering_ = true;
  UINT result = ERROR_INTERNAL_ERROR;
  try {
    result = points->GetRdpContext(points) == scope->context_
                 ? scope->registration_->install(points)
                 : ERROR_INVALID_PARAMETER;
  } catch (...) {
  }
  scope->entering_ = false;
  return result;
}
UINT AddinProvider::close() noexcept {
  if (!bound_)
    return CHANNEL_RC_OK;
  if (!on_thread() || loading_ || entering_ || active_.load() != this || !scope_.top())
    return ERROR_INVALID_STATE;
  const auto retired = registration_->retire();
  if (!registration_->retired())
    return retired;
  const auto detached = scope_.close();
  if (scope_.bound())
    return detached;
  // A foreign replacement must not be overwritten. Report the broken scope
  // contract, but detach safely after delegated resources have been retired.
  bound_ = false;
  context_ = nullptr;
  registration_ = nullptr;
  active_.store(nullptr);
  return detached != CHANNEL_RC_OK ? detached : retired;
}
} // namespace bridge::touch
