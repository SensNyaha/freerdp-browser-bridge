#include "addin_provider.hpp"
#include <bit>
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
  previous_ = freerdp_get_current_addin_provider();
  if (previous_ == load) {
    active_.store(nullptr);
    return ERROR_INVALID_STATE;
  }
  context_ = &context;
  registration_ = &registration;
  thread_ = std::this_thread::get_id();
  // The pinned API only assigns the provider; it does not invoke callbacks here.
  if (freerdp_register_addin_provider(load, 0) != 0) {
    context_ = nullptr;
    registration_ = nullptr;
    active_.store(nullptr);
    return ERROR_INTERNAL_ERROR;
  }
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
                         !scope->registration_->retired();
    return std::bit_cast<PVIRTUALCHANNELENTRY>(
        static_cast<PDVC_PLUGIN_ENTRY>(allowed ? entry : denied));
  }
  if (!scope || !scope->bound_ || !scope->on_thread() || scope->loading_ || scope->entering_ ||
      !scope->previous_)
    return nullptr;
  scope->loading_ = true;
  PVIRTUALCHANNELENTRY result = nullptr;
  try {
    result = scope->previous_(name, subsystem, type, flags);
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
      freerdp_get_current_addin_provider() != load || scope->registration_->retired())
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
  if (!on_thread() || loading_ || entering_ || active_.load() != this)
    return ERROR_INVALID_STATE;
  const auto retired = registration_->retire();
  if (!registration_->retired())
    return retired;
  const bool owned = freerdp_get_current_addin_provider() == load;
  if (owned && freerdp_register_addin_provider(previous_, 0) != 0)
    return ERROR_INTERNAL_ERROR;
  // A foreign replacement must not be overwritten. Report the broken scope
  // contract, but detach safely after delegated resources have been retired.
  bound_ = false;
  context_ = nullptr;
  registration_ = nullptr;
  previous_ = nullptr;
  active_.store(nullptr);
  return !owned ? ERROR_INVALID_STATE : retired;
}
} // namespace bridge::touch
