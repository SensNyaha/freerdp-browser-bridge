#include "dvc_gate.hpp"
#include <algorithm>
#include <freerdp/channels/rdpei.h>
#include <freerdp/settings.h>
#include <limits>
#include <span>
#include <type_traits>
#include <winpr/error.h>
#include <winpr/stream.h>

namespace bridge::touch {
namespace {
constexpr UINT16 sc_ready = 1, cs_ready = 2, touch_event = 3, suspend = 4, resume = 5,
                 pen_event = 7;
std::uint32_t little(std::span<const BYTE> bytes) noexcept {
  std::uint32_t result = 0;
  for (std::size_t i = 0; i < bytes.size(); ++i)
    result |= std::uint32_t{bytes[i]} << (i * 8);
  return result;
}
bool framed(std::span<const BYTE> bytes) noexcept {
  return bytes.size() >= RDPINPUT_HEADER_LENGTH && little(bytes.subspan(2, 4)) == bytes.size();
}
bool supported(std::uint32_t version) noexcept {
  return version == RDPINPUT_PROTOCOL_V10 || version == RDPINPUT_PROTOCOL_V101 ||
         version == RDPINPUT_PROTOCOL_V200 || version >= RDPINPUT_PROTOCOL_V300;
}
} // namespace
DvcGate::DvcGate() noexcept
    : endpoint_{{write_callback, transport_close_callback}, this},
      callbacks_{{receive_callback, open_callback, close_callback, nullptr}, this} {}
DvcGate::~DvcGate() { (void)close(); }
bool DvcGate::on_thread() const noexcept {
  return thread_ == std::thread::id{} || thread_ == std::this_thread::get_id();
}
void DvcGate::phase(Phase value) noexcept {
  const bool changed = phase_ != value;
  phase_ = value;
  if (changed && observer_.phase) {
    observing_ = true;
    observer_.phase(observer_.user, value);
    observing_ = false;
  }
}
UINT DvcGate::inspect(std::span<const BYTE> bytes, FrameDisposition disposition) noexcept {
  if (!observer_.frame)
    return CHANNEL_RC_OK;
  observing_ = true;
  const auto result = observer_.frame(observer_.user, bytes, disposition);
  observing_ = false;
  return result;
}
UINT DvcGate::observe(GateObserver observer) noexcept {
  if (!quiescent() || phase_ != Phase::closed || delegate_)
    return ERROR_INVALID_STATE;
  observer_ = observer;
  return CHANNEL_RC_OK;
}
UINT DvcGate::hold(bool value) noexcept {
  if (!on_thread())
    return ERROR_INVALID_STATE;
  held_ = value;
  return CHANNEL_RC_OK;
}
UINT DvcGate::submit_cleanup(std::span<const BYTE> bytes) noexcept {
  if (!quiescent() || !ready() || !held_ || !observer_.frame || bytes.size() > max_outbound_bytes ||
      bytes.size() < 2 || bytes[0] != touch_event || bytes[1] != 0)
    return ERROR_INVALID_STATE;
  cleanup_ = true;
  const auto result = write(static_cast<ULONG>(bytes.size()), bytes.data(), nullptr);
  cleanup_ = false;
  return result;
}
UINT DvcGate::fail(UINT error) noexcept {
  negotiated_.reset();
  ready_flags_ = 0;
  phase(Phase::failed);
  return error;
}
UINT DvcGate::open(rdpContext &base, IWTSListenerCallback *listener, IWTSVirtualChannel *transport,
                   BYTE *data, BOOL *accepted, IWTSVirtualChannelCallback **callback) noexcept {
  if (!on_thread())
    return ERROR_INVALID_STATE;
  if (!accepted || !callback)
    return ERROR_INVALID_PARAMETER;
  *accepted = FALSE;
  *callback = nullptr;
  if (delegate_ || transport_ || receiving_ || writing_ || opening_ || closing_ || observing_)
    return CHANNEL_RC_ALREADY_INITIALIZED;
  if (!base.settings || !listener || !listener->OnNewChannelConnection || !transport ||
      !transport->Write ||
      !freerdp_settings_get_bool(base.settings, FreeRDP_SynchronousDynamicChannels) ||
      freerdp_settings_get_bool(base.settings, FreeRDP_AsyncChannels) ||
      freerdp_settings_get_bool(base.settings, FreeRDP_AsyncUpdate))
    return ERROR_INVALID_PARAMETER;
  thread_ = std::this_thread::get_id();
  transport_ = transport;
  phase(Phase::handshake);
  negotiated_.reset();
  candidate_.reset();
  expected_version_ = 0;
  candidate_flags_ = ready_flags_ = 0;
  suppressed_ = 0;
  receiving_ = writing_ = ready_reply_ = false;
  BOOL allowed = TRUE;
  UINT result = ERROR_INTERNAL_ERROR;
  opening_ = true;
  try {
    result = listener->OnNewChannelConnection(listener, &endpoint_.api, data, &allowed, &delegate_);
  } catch (...) {
    result = ERROR_INTERNAL_ERROR;
  }
  opening_ = false;
  if (phase_ == Phase::closed) {
    (void)close();
    return ERROR_INVALID_STATE;
  }
  if (result != CHANNEL_RC_OK || phase_ == Phase::failed || !allowed || !delegate_ ||
      !delegate_->OnDataReceived || !delegate_->OnClose) {
    if (delegate_ && !delegate_->OnClose)
      delegate_ = nullptr;
    const auto status = close();
    if (result == CHANNEL_RC_OK && status != CHANNEL_RC_OK)
      result = status;
    return result != CHANNEL_RC_OK ? result : ERROR_INVALID_DATA;
  }
  *accepted = TRUE;
  *callback = &callbacks_.api;
  return CHANNEL_RC_OK;
}
UINT DvcGate::receive(wStream *stream) noexcept {
  if (!on_thread())
    return ERROR_INVALID_STATE;
  if (observing_)
    return ERROR_INVALID_STATE;
  if (!delegate_ || phase_ == Phase::closed || phase_ == Phase::failed)
    return ERROR_INVALID_STATE;
  if (receiving_ || writing_ || !stream || !Stream_Pointer(stream))
    return fail(ERROR_INVALID_DATA);
  const auto length = Stream_GetRemainingLength(stream);
  if (length < RDPINPUT_HEADER_LENGTH || length > 14)
    return fail(ERROR_INVALID_DATA);
  const std::span<const BYTE> bytes{static_cast<const BYTE *>(Stream_Pointer(stream)), length};
  if (!framed(bytes))
    return fail(ERROR_INVALID_DATA);
  const auto type = little(bytes.first(2));
  if (type == sc_ready) {
    if (phase_ != Phase::handshake || length < 10)
      return fail(ERROR_INVALID_DATA);
    const auto version = little(bytes.subspan(6, 4));
    if (!supported(version) || length != (version >= RDPINPUT_PROTOCOL_V300 ? 14U : 10U))
      return fail(ERROR_INVALID_DATA);
    expected_version_ = (std::min)(version, std::uint32_t{RDPINPUT_PROTOCOL_V300});
    candidate_.reset();
    ready_reply_ = false;
  } else if (type == suspend || type == resume) {
    if (length != 6 || (phase_ != Phase::running && phase_ != Phase::suspended))
      return fail(ERROR_INVALID_DATA);
    if (type == suspend)
      phase(Phase::suspended); // Includes writes made by the delegated SuspendTouch callback.
  } else {
    return fail(ERROR_INVALID_DATA);
  }
  receiving_ = true;
  UINT result = ERROR_INTERNAL_ERROR;
  try {
    result = delegate_->OnDataReceived(delegate_, stream);
  } catch (...) {
    result = ERROR_INTERNAL_ERROR;
  }
  receiving_ = false;
  if (!delegate_ || phase_ == Phase::closed) {
    (void)close();
    return ERROR_INVALID_STATE;
  }
  if (result != CHANNEL_RC_OK)
    return fail(result);
  if (phase_ == Phase::failed || (type == sc_ready && (!ready_reply_ || !candidate_)))
    return fail(ERROR_INVALID_DATA);
  if (type == sc_ready) {
    negotiated_ = candidate_;
    ready_flags_ = candidate_flags_;
    phase(Phase::running);
  } else if (type == resume) {
    phase(
        Phase::running); // Does not establish lease/contact cleanup or permission to replay input.
  }
  return CHANNEL_RC_OK;
}
UINT DvcGate::write(ULONG size, const BYTE *data, void *reserved) noexcept {
  if (!on_thread())
    return ERROR_INVALID_STATE;
  if (!transport_ || phase_ == Phase::closed || phase_ == Phase::failed || writing_ || observing_)
    return ERROR_INVALID_STATE;
  if (!data || size < RDPINPUT_HEADER_LENGTH || size > max_outbound_bytes)
    return fail(ERROR_INVALID_DATA);
  const std::span<const BYTE> bytes{data, size};
  if (!framed(bytes))
    return fail(ERROR_INVALID_DATA);
  const auto type = little(bytes.first(2));
  if (type == cs_ready) {
    if (!receiving_ || phase_ != Phase::handshake || !expected_version_ || ready_reply_ ||
        size != 16)
      return fail(ERROR_INVALID_DATA);
    const auto flags = little(bytes.subspan(6, 4));
    const auto version = little(bytes.subspan(10, 4));
    const auto contacts = little(bytes.subspan(14, 2));
    if ((flags & ~std::uint32_t{7}) || version != expected_version_ || !contacts || contacts > 64)
      return fail(ERROR_INVALID_DATA);
    candidate_ = Negotiated{version, static_cast<std::uint16_t>(contacts)};
    candidate_flags_ = flags;
  } else if (type == touch_event || type == pen_event) {
    if (phase_ != Phase::running && phase_ != Phase::suspended)
      return fail(ERROR_INVALID_STATE);
    const auto checked =
        inspect(bytes, cleanup_ ? FrameDisposition::cleanup_prepare : FrameDisposition::prepare);
    if (checked != CHANNEL_RC_OK)
      return fail(checked);
    if (phase_ == Phase::suspended || (held_ && !cleanup_)) {
      const auto suppressed = inspect(bytes, FrameDisposition::suppressed);
      if (suppressed != CHANNEL_RC_OK)
        return fail(suppressed);
      if (suppressed_ != (std::numeric_limits<std::uint64_t>::max)())
        ++suppressed_;
      return CHANNEL_RC_OK; // Discard upstream periodic state; no deferred packet queue.
    }
  } else {
    return fail(ERROR_INVALID_DATA);
  }
  UINT result = ERROR_INTERNAL_ERROR;
  writing_ = true;
  try {
    result = transport_->Write(transport_, size, data, reserved);
  } catch (...) {
    result = ERROR_INTERNAL_ERROR;
  }
  writing_ = false;
  if (!transport_ || phase_ == Phase::closed) {
    (void)close();
    return result == CHANNEL_RC_OK ? ERROR_INVALID_STATE : result;
  }
  if (phase_ == Phase::failed)
    return ERROR_INVALID_STATE;
  if (result != CHANNEL_RC_OK)
    return fail(result);
  if (type == cs_ready)
    ready_reply_ = true; // Publish only after the delegated receive itself also succeeds.
  else {
    const auto delivered = inspect(bytes, FrameDisposition::delivered);
    if (delivered != CHANNEL_RC_OK)
      return fail(delivered);
  }
  return CHANNEL_RC_OK;
}
UINT DvcGate::close() noexcept {
  if (!on_thread())
    return ERROR_INVALID_STATE;
  if (observing_)
    return ERROR_INVALID_STATE;
  UINT result = CHANNEL_RC_OK;
  // Invalidate before delegation so a reentrant callback cannot restore readiness/write input.
  transport_ = nullptr;
  phase(Phase::closed);
  negotiated_.reset();
  candidate_.reset();
  candidate_flags_ = ready_flags_ = 0;
  expected_version_ = 0;
  ready_reply_ = false;
  // The upstream callback may own itself. Never destroy it inside its active method.
  if (receiving_ || writing_ || opening_ || closing_)
    return result;
  auto *callback = delegate_;
  delegate_ = nullptr;
  if (callback) {
    closing_ = true;
    try {
      result = callback->OnClose(callback);
    } catch (...) {
      result = ERROR_INTERNAL_ERROR;
    }
    closing_ = false;
  }
  return result;
}
UINT DvcGate::receive_callback(IWTSVirtualChannelCallback *api, wStream *stream) noexcept {
  static_assert(std::is_standard_layout_v<Callbacks>);
  return reinterpret_cast<Callbacks *>(api)->owner->receive(stream);
}
UINT DvcGate::close_callback(IWTSVirtualChannelCallback *api) noexcept {
  return reinterpret_cast<Callbacks *>(api)->owner->close();
}
UINT DvcGate::open_callback(IWTSVirtualChannelCallback *api) noexcept {
  auto &self = *reinterpret_cast<Callbacks *>(api)->owner;
  if (!self.on_thread() || self.observing_ || !self.delegate_ || self.phase_ != Phase::handshake)
    return ERROR_INVALID_STATE;
  if (!self.delegate_->OnOpen)
    return CHANNEL_RC_OK;
  self.opening_ = true;
  UINT result = ERROR_INTERNAL_ERROR;
  try {
    result = self.delegate_->OnOpen(self.delegate_);
  } catch (...) {
    result = ERROR_INTERNAL_ERROR;
  }
  self.opening_ = false;
  if (self.phase_ == Phase::closed) {
    (void)self.close();
    return ERROR_INVALID_STATE;
  }
  return result == CHANNEL_RC_OK ? result : self.fail(result);
}
UINT DvcGate::write_callback(IWTSVirtualChannel *api, ULONG size, const BYTE *data,
                             void *reserved) noexcept {
  static_assert(std::is_standard_layout_v<Endpoint>);
  return reinterpret_cast<Endpoint *>(api)->owner->write(size, data, reserved);
}
UINT DvcGate::transport_close_callback(IWTSVirtualChannel *api) noexcept {
  auto &self = *reinterpret_cast<Endpoint *>(api)->owner;
  if (!self.on_thread() || self.observing_ || !self.transport_ || !self.transport_->Close)
    return ERROR_INVALID_STATE;
  auto *transport = self.transport_;
  self.transport_ = nullptr;
  self.phase(Phase::closed);
  self.negotiated_.reset();
  self.ready_flags_ = 0;
  self.candidate_.reset();
  self.ready_reply_ = false;
  try {
    const auto result = transport->Close(transport);
    return result == CHANNEL_RC_OK ? result : self.fail(result);
  } catch (...) {
    return self.fail(ERROR_INTERNAL_ERROR);
  }
}
} // namespace bridge::touch
