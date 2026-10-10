#include "rdpsnd_provider.hpp"
#include "static_gate.hpp"
#include <bit>
#include <cstring>
#include <exception>
#include <freerdp/freerdp.h>
#include <winpr/error.h>

namespace bridge::audio {
std::atomic<RdpsndProvider *> RdpsndProvider::active_{nullptr};
bool RdpsndProvider::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
RdpsndProvider::~RdpsndProvider() {
  if (bound_) {
    (void)close();
    if (bound_)
      std::terminate();
  }
}
UINT RdpsndProvider::bind(rdpContext &context, RdpsndSink &sink, AudioStaticGate *gate) noexcept {
  if (bound_ || used_ || sink.retired())
    return ERROR_INVALID_STATE;
  if (!sink.stats() || (gate && !gate->ready_for(context, sink)) || !context.settings ||
      !freerdp_settings_get_bool(context.settings, FreeRDP_SynchronousStaticChannels) ||
      !freerdp_settings_get_bool(context.settings, FreeRDP_SynchronousDynamicChannels) ||
      freerdp_settings_get_bool(context.settings, FreeRDP_AsyncChannels) ||
      freerdp_settings_get_bool(context.settings, FreeRDP_AsyncUpdate))
    return ERROR_INVALID_PARAMETER;
  RdpsndProvider *empty = nullptr;
  if (!active_.compare_exchange_strong(empty, this))
    return ERROR_INVALID_STATE;
  previous_ = freerdp_get_current_addin_provider();
  if (previous_ == load) {
    previous_ = nullptr;
    active_.store(nullptr);
    return ERROR_INVALID_STATE;
  }
  thread_ = std::this_thread::get_id();
  context_ = &context;
  sink_ = &sink;
  gate_ = gate;
  if (freerdp_register_addin_provider(load, 0) != 0) {
    context_ = nullptr;
    sink_ = nullptr;
    gate_ = nullptr;
    previous_ = nullptr;
    active_.store(nullptr);
    return ERROR_INTERNAL_ERROR;
  }
  bound_ = true;
  used_ = true;
  return CHANNEL_RC_OK;
}
PVIRTUALCHANNELENTRY RdpsndProvider::load(LPCSTR name, LPCSTR subsystem, LPCSTR type,
                                          DWORD flags) noexcept {
  auto *scope = active_.load();
  if (scope && scope->gate_ && name && !subsystem && std::strcmp(name, RDPSND_CHANNEL_NAME) == 0) {
    if (flags & FREERDP_ADDIN_CHANNEL_DYNAMIC)
      return std::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PDVC_PLUGIN_ENTRY>(dynamic_denied));
    if (!(flags & FREERDP_ADDIN_CHANNEL_ENTRYEX))
      return legacy_denied;
    const bool allowed = scope->bound_ && scope->on_thread() && !scope->loading_ &&
                         !scope->entering_ && !scope->channel_attempted_ &&
                         !scope->sink_->retired() && !type &&
                         flags == (FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX);
    if (!allowed || !scope->previous_)
      return std::bit_cast<PVIRTUALCHANNELENTRY>(
          static_cast<PVIRTUALCHANNELENTRYEX>(channel_denied));
    scope->loading_ = true;
    PVIRTUALCHANNELENTRY delegated = nullptr;
    try {
      delegated = scope->previous_(name, nullptr, nullptr, flags);
    } catch (...) {
    }
    scope->loading_ = false;
    if (!delegated)
      return std::bit_cast<PVIRTUALCHANNELENTRY>(
          static_cast<PVIRTUALCHANNELENTRYEX>(channel_denied));
    scope->channel_delegate_ = std::bit_cast<PVIRTUALCHANNELENTRYEX>(delegated);
    return std::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PVIRTUALCHANNELENTRYEX>(channel_entry));
  }
  if (name && subsystem && std::strcmp(name, RDPSND_CHANNEL_NAME) == 0 &&
      std::strcmp(subsystem, "browser") == 0) {
    const bool abi = flags == (FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX) ||
                     (scope && !scope->gate_ && flags == FREERDP_ADDIN_CHANNEL_DYNAMIC);
    const bool allowed = scope && scope->bound_ && scope->on_thread() && !scope->loading_ &&
                         !scope->entering_ && !scope->attempted_ && !type && abi &&
                         !scope->sink_->retired();
    return std::bit_cast<PVIRTUALCHANNELENTRY>(
        static_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(allowed ? entry : denied));
  }
  if (!scope || !scope->bound_ || !scope->on_thread() || scope->loading_ || scope->entering_ ||
      !scope->previous_)
    return nullptr;
  scope->loading_ = true;
  PVIRTUALCHANNELENTRY result = nullptr;
  try {
    result = scope->previous_(name, subsystem, type, flags);
  } catch (...) {
  }
  scope->loading_ = false;
  return result;
}
UINT VCAPITYPE RdpsndProvider::denied(PFREERDP_RDPSND_DEVICE_ENTRY_POINTS) noexcept {
  return ERROR_INVALID_STATE;
}
BOOL VCAPITYPE RdpsndProvider::channel_denied(PCHANNEL_ENTRY_POINTS_EX, LPVOID) noexcept {
  return FALSE;
}
BOOL VCAPITYPE RdpsndProvider::legacy_denied(PCHANNEL_ENTRY_POINTS) noexcept { return FALSE; }
UINT VCAPITYPE RdpsndProvider::dynamic_denied(IDRDYNVC_ENTRY_POINTS *) noexcept {
  return ERROR_NOT_SUPPORTED;
}
BOOL VCAPITYPE RdpsndProvider::channel_entry(PCHANNEL_ENTRY_POINTS_EX points,
                                             LPVOID handle) noexcept {
  auto *scope = active_.load();
  if (!scope || !scope->bound_ || !scope->on_thread() || scope->loading_ || scope->entering_ ||
      scope->channel_attempted_ || !scope->gate_ || !scope->channel_delegate_ ||
      scope->sink_->retired() || freerdp_get_current_addin_provider() != load || !points ||
      points->cbSize != sizeof(CHANNEL_ENTRY_POINTS_FREERDP_EX))
    return FALSE;
  scope->channel_attempted_ = true;
  scope->entering_ = true;
  const auto result =
      scope->gate_->install(reinterpret_cast<CHANNEL_ENTRY_POINTS_FREERDP_EX *>(points), handle,
                            scope->channel_delegate_);
  scope->entering_ = false;
  return result;
}
UINT VCAPITYPE RdpsndProvider::entry(PFREERDP_RDPSND_DEVICE_ENTRY_POINTS points) noexcept {
  auto *scope = active_.load();
  if (!scope || !scope->bound_ || !scope->on_thread() || scope->loading_ || scope->entering_ ||
      scope->attempted_ || scope->sink_->retired() || freerdp_get_current_addin_provider() != load)
    return ERROR_INVALID_STATE;
  if (!points || !points->rdpsnd || !points->pRegisterRdpsndDevice)
    return ERROR_INVALID_PARAMETER;
  scope->entering_ = true;
  UINT result = ERROR_INTERNAL_ERROR;
  try {
    if (freerdp_rdpsnd_get_context(points->rdpsnd) != scope->context_)
      result = ERROR_INVALID_PARAMETER;
    else {
      scope->attempted_ = true; // Registration is void: never retry an uncertain handoff.
      auto &device = scope->sink_->device();
      points->pRegisterRdpsndDevice(points->rdpsnd, &device);
      result = device.rdpsnd == points->rdpsnd ? CHANNEL_RC_OK : ERROR_INVALID_STATE;
    }
  } catch (...) {
  }
  scope->entering_ = false;
  return result;
}
UINT RdpsndProvider::close() noexcept {
  if (!bound_)
    return CHANNEL_RC_OK;
  if (!on_thread() || loading_ || entering_ || active_.load() != this)
    return ERROR_INVALID_STATE;
  if (gate_) {
    const auto result = gate_->retire();
    if (result != CHANNEL_RC_OK)
      return result;
  }
  if (!sink_->retire())
    return ERROR_INVALID_STATE;
  const bool owned = freerdp_get_current_addin_provider() == load;
  if (owned && freerdp_register_addin_provider(previous_, 0) != 0)
    return ERROR_INTERNAL_ERROR;
  bound_ = false;
  context_ = nullptr;
  sink_ = nullptr;
  gate_ = nullptr;
  channel_delegate_ = nullptr;
  previous_ = nullptr;
  active_.store(nullptr);
  return owned ? CHANNEL_RC_OK : ERROR_INVALID_STATE;
}
} // namespace bridge::audio
