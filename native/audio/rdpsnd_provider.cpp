#include "../compat/bit.hpp"
#include "rdpsnd_provider.hpp"
#include "static_gate.hpp"
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
  const auto scoped = scope_.bind(context, load);
  if (scoped != CHANNEL_RC_OK) {
    active_.store(nullptr);
    return scoped;
  }
  thread_ = std::this_thread::get_id();
  context_ = &context;
  sink_ = &sink;
  gate_ = gate;
  bound_ = true;
  used_ = true;
  return CHANNEL_RC_OK;
}
PVIRTUALCHANNELENTRY RdpsndProvider::load(LPCSTR name, LPCSTR subsystem, LPCSTR type,
                                          DWORD flags) noexcept {
  auto *scope = active_.load();
  if (scope && scope->gate_ && name && !subsystem && std::strcmp(name, RDPSND_CHANNEL_NAME) == 0) {
    if (flags & FREERDP_ADDIN_CHANNEL_DYNAMIC)
      return ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PDVC_PLUGIN_ENTRY>(dynamic_denied));
    if (!(flags & FREERDP_ADDIN_CHANNEL_ENTRYEX))
      return legacy_denied;
    const bool allowed = scope->bound_ && scope->on_thread() && !scope->loading_ &&
                         !scope->entering_ && !scope->channel_attempted_ &&
                         !scope->sink_->retired() && !type &&
                         flags == (FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX) &&
                         scope->scope_.active();
    if (!allowed || !scope->scope_.previous())
      return ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(
          static_cast<PVIRTUALCHANNELENTRYEX>(channel_denied));
    scope->loading_ = true;
    PVIRTUALCHANNELENTRY delegated = nullptr;
    try {
      delegated = scope->scope_.previous()(name, nullptr, nullptr, flags);
    } catch (...) {
    }
    scope->loading_ = false;
    if (!delegated)
      return ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(
          static_cast<PVIRTUALCHANNELENTRYEX>(channel_denied));
    scope->channel_delegate_ = ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(delegated);
    return ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(static_cast<PVIRTUALCHANNELENTRYEX>(channel_entry));
  }
  if (name && subsystem && std::strcmp(name, RDPSND_CHANNEL_NAME) == 0 &&
      std::strcmp(subsystem, "browser") == 0) {
    const bool abi = flags == (FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX) ||
                     (scope && !scope->gate_ && flags == FREERDP_ADDIN_CHANNEL_DYNAMIC);
    const bool allowed = scope && scope->bound_ && scope->on_thread() && !scope->loading_ &&
                         !scope->entering_ && !scope->attempted_ && !type && abi &&
                         !scope->sink_->retired() && scope->scope_.active();
    return ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRY>(
        static_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(allowed ? entry : denied));
  }
  if (!scope || !scope->bound_ || !scope->on_thread() || scope->loading_ || scope->entering_ ||
      !scope->scope_.active() || !scope->scope_.previous())
    return nullptr;
  scope->loading_ = true;
  PVIRTUALCHANNELENTRY result = nullptr;
  try {
    result = scope->scope_.previous()(name, subsystem, type, flags);
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
      scope->sink_->retired() || !scope->scope_.active() || !points ||
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
      scope->attempted_ || scope->sink_->retired() || !scope->scope_.active())
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
  if (!on_thread() || loading_ || entering_ || active_.load() != this || !scope_.top())
    return ERROR_INVALID_STATE;
  if (gate_) {
    const auto result = gate_->retire();
    if (result != CHANNEL_RC_OK)
      return result;
  }
  if (!sink_->retire())
    return ERROR_INVALID_STATE;
  const auto detached = scope_.close();
  if (scope_.bound())
    return detached;
  bound_ = false;
  context_ = nullptr;
  sink_ = nullptr;
  gate_ = nullptr;
  channel_delegate_ = nullptr;
  active_.store(nullptr);
  return detached;
}
} // namespace bridge::audio
