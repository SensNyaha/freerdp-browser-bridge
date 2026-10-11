#include "audin_dvc.hpp"
#include <algorithm>
#include <exception>
#include <freerdp/freerdp.h>
#include <type_traits>
#include <winpr/error.h>
#include <winpr/stream.h>

namespace bridge::audio {
namespace {
std::uint32_t little(std::span<const BYTE> bytes, std::size_t at) noexcept {
  std::uint32_t value = 0;
  for (unsigned i = 0; i < 4; ++i)
    value |= std::uint32_t{bytes[at + i]} << (8 * i);
  return value;
}
template <class Call> UINT checked(Call call) noexcept {
  try {
    return call();
  } catch (...) {
    return ERROR_INTERNAL_ERROR;
  }
}
} // namespace
template <class Api> AudinDvcGate &AudinDvcGate::get(Api *api) noexcept {
  static_assert(std::is_standard_layout_v<Box<Api>>);
  return *reinterpret_cast<Box<Api> *>(api)->owner;
}
AudinDvcGate::AudinDvcGate(AudinSource &source) noexcept
    : source_(source), thread_(std::this_thread::get_id()) {
  endpoint_.api.Write = [](IWTSVirtualChannel *api, ULONG size, const BYTE *data, void *user) {
    return get(api).write(size, data, user);
  };
  endpoint_.api.Close = [](IWTSVirtualChannel *) -> UINT { return ERROR_NOT_SUPPORTED; };
  callback_.api.OnDataReceived = [](IWTSVirtualChannelCallback *api, wStream *stream) {
    return get(api).receive(stream);
  };
  callback_.api.OnOpen = [](IWTSVirtualChannelCallback *api) { return get(api).opened(); };
  callback_.api.OnClose = [](IWTSVirtualChannelCallback *api) { return get(api).close(); };
}
AudinDvcGate::~AudinDvcGate() {
  (void)retire();
  if (!retired())
    std::terminate();
}
bool AudinDvcGate::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
bool AudinDvcGate::quiescent() const noexcept {
  return on_thread() && !receiving_ && !writing_ && !opening_ && !closing_ && !pumping_;
}
bool AudinDvcGate::ready() const noexcept {
  return on_thread() && !retired() && phase_ == AudinChannelPhase::recording && delegate_ &&
         transport_ && !source_.retired() && source_.stats() && source_.stats()->opened;
}
AudinChannelPhase AudinDvcGate::phase() const noexcept {
  return on_thread() ? phase_ : AudinChannelPhase::closed;
}
UINT AudinDvcGate::last_error() const noexcept {
  return on_thread() ? last_error_ : ERROR_INVALID_STATE;
}
UINT AudinDvcGate::fail(UINT error) noexcept {
  phase_ = AudinChannelPhase::failed;
  last_error_ = error;
  incoming_ = false;
  // A pump owns borrowed bytes until its receiver returns. Its checked failure
  // stops the source after unwinding; never close it inside that callback.
  if (!pumping_) {
    auto &device = source_.device();
    const auto closed = device.Close(&device);
    if (closed != CHANNEL_RC_OK)
      last_error_ = closed;
  }
  return error;
}
UINT AudinDvcGate::open(rdpContext &context, IWTSListenerCallback *listener,
                        IWTSVirtualChannel *transport, BYTE *data, BOOL *accepted,
                        IWTSVirtualChannelCallback **out) noexcept {
  if (!accepted || !out)
    return ERROR_INVALID_PARAMETER;
  *accepted = FALSE;
  *out = nullptr;
  if (!quiescent() || used_ || retired() || source_.retired())
    return ERROR_INVALID_STATE;
  if (!context.settings || !source_.stats() || !listener || !listener->OnNewChannelConnection ||
      !transport || !transport->Write ||
      !freerdp_settings_get_bool(context.settings, FreeRDP_SynchronousDynamicChannels) ||
      freerdp_settings_get_bool(context.settings, FreeRDP_AsyncChannels) ||
      freerdp_settings_get_bool(context.settings, FreeRDP_AsyncUpdate))
    return ERROR_INVALID_PARAMETER;
  used_ = true;
  transport_ = transport;
  phase_ = AudinChannelPhase::handshake;
  opening_ = true;
  BOOL allowed = TRUE;
  const auto result = checked([&] {
    return listener->OnNewChannelConnection(listener, &endpoint_.api, data, &allowed, &delegate_);
  });
  opening_ = false;
  if (result != CHANNEL_RC_OK || !allowed || !delegate_ || !delegate_->OnDataReceived ||
      !delegate_->OnClose || phase_ == AudinChannelPhase::failed) {
    // No retry after an uncertain handoff. The pinned callback owns its OnClose.
    const auto closed = close();
    return result ? result : closed ? closed : ERROR_INVALID_DATA;
  }
  *accepted = TRUE;
  *out = &callback_.api;
  return CHANNEL_RC_OK;
}
UINT AudinDvcGate::opened() noexcept {
  if (!quiescent() || retired() || !delegate_ || phase_ != AudinChannelPhase::handshake)
    return ERROR_INVALID_STATE;
  if (!delegate_->OnOpen)
    return CHANNEL_RC_OK;
  opening_ = true;
  const auto result = checked([&] { return delegate_->OnOpen(delegate_); });
  opening_ = false;
  return result ? fail(result) : CHANNEL_RC_OK;
}
UINT AudinDvcGate::receive(wStream *stream) noexcept {
  if (!quiescent() || retired() || !delegate_ || !transport_ ||
      phase_ == AudinChannelPhase::failed || phase_ == AudinChannelPhase::closed)
    return ERROR_INVALID_STATE;
  if (!stream || !Stream_Pointer(stream) ||
      Stream_GetRemainingLength(stream) > AudinIngress::max_bytes)
    return fail(ERROR_INVALID_DATA);
  const auto before = source_.stats();
  if (!before)
    return fail(ERROR_INVALID_STATE);
  const auto pdu = ingress_.inspect(
      {static_cast<const BYTE *>(Stream_Pointer(stream)), Stream_GetRemainingLength(stream)});
  if (!pdu)
    return fail(ERROR_INVALID_DATA);
  pending_ = pdu;
  reply_ = 0;
  receiving_ = true;
  phase_ = AudinChannelPhase::handshake;
  if (pdu->kind == AudinPduKind::formats) {
    channels_.fill(0);
    for (std::size_t i = 0; i < pdu->format_count; ++i)
      channels_[i] = pdu->bytes[9 + i * 18 + 2]; // Filtered consistent PCM1/2.
  }
  UINT result = CHANNEL_RC_OK;
  if (!pdu->forward) {
    const BYTE incoming = 5;
    result = write(1, &incoming, nullptr);
    if (result == CHANNEL_RC_OK)
      result = write(static_cast<ULONG>(pdu->bytes.size()), pdu->bytes.data(), nullptr);
  } else {
    wStream filtered{};
    if (!Stream_StaticConstInit(&filtered, pdu->bytes.data(), pdu->bytes.size()))
      result = ERROR_INTERNAL_ERROR;
    else
      result = checked([&] { return delegate_->OnDataReceived(delegate_, &filtered); });
  }
  receiving_ = false;
  const unsigned expected =
      pdu->kind == AudinPduKind::formats || pdu->kind == AudinPduKind::open ? 2 : 1;
  const bool completed = reply_ == expected;
  pending_.reset(); // All borrowed packet/table spans stop here.
  if (result != CHANNEL_RC_OK)
    return fail(result);
  if (!completed || phase_ == AudinChannelPhase::failed)
    return fail(ERROR_INVALID_DATA);
  if (!pdu->forward) {
    phase_ = AudinChannelPhase::unsupported;
    return CHANNEL_RC_OK;
  }
  if (pdu->kind == AudinPduKind::open || pdu->kind == AudinPduKind::change) {
    const auto after = source_.stats();
    if (!after || !after->opened || after->epoch <= before->epoch)
      return fail(ERROR_INVALID_STATE);
    index_ = pdu->format_index;
    frames_ = pdu->frames_per_packet;
    data_bytes_ = 1 + static_cast<std::size_t>(frames_) * channels_[index_] * 2;
    phase_ = AudinChannelPhase::recording;
  }
  return CHANNEL_RC_OK;
}
UINT AudinDvcGate::write(ULONG size, const BYTE *data, void *reserved) noexcept {
  if (!on_thread() || retired() || writing_ || closing_ || opening_ || !transport_ ||
      phase_ == AudinChannelPhase::failed || phase_ == AudinChannelPhase::closed)
    return ERROR_INVALID_STATE;
  if (!data || !size || size > 19201 || reserved)
    return fail(ERROR_INVALID_DATA);
  const std::span<const BYTE> bytes{data, size};
  bool valid = false;
  if (receiving_ && pending_) {
    switch (pending_->kind) {
    case AudinPduKind::version:
      valid = reply_ == 0 && size == 5 && bytes[0] == 1 && little(bytes, 1) == 2;
      break;
    case AudinPduKind::formats:
      valid = reply_ == 0 ? size == 1 && bytes[0] == 5
                          : reply_ == 1 && bytes.size() == pending_->bytes.size() &&
                                std::equal(bytes.begin(), bytes.end(), pending_->bytes.begin());
      break;
    case AudinPduKind::open:
    case AudinPduKind::change:
      valid = reply_ == 0 ? size == 5 && bytes[0] == 7 && little(bytes, 1) == pending_->format_index
                          : pending_->kind == AudinPduKind::open && reply_ == 1 && size == 5 &&
                                bytes[0] == 4 && little(bytes, 1) == 0;
      break;
    }
  } else if (pumping_ && phase_ == AudinChannelPhase::recording && !emitted_) {
    valid = incoming_ ? size == data_bytes_ && bytes[0] == 6 : size == 1 && bytes[0] == 5;
  }
  if (!valid)
    return fail(ERROR_INVALID_DATA);
  writing_ = true;
  const auto result = checked([&] { return transport_->Write(transport_, size, data, nullptr); });
  writing_ = false;
  if (result != CHANNEL_RC_OK)
    return fail(result);
  if (receiving_)
    ++reply_;
  else if (incoming_) {
    incoming_ = false;
    emitted_ = true;
  } else
    incoming_ = true;
  return CHANNEL_RC_OK;
}
AudinPumpStatus AudinDvcGate::pump() noexcept {
  if (!quiescent() || !ready())
    return AudinPumpStatus::inactive;
  incoming_ = emitted_ = false;
  pumping_ = true;
  const auto result = source_.pump();
  pumping_ = false;
  if (result != AudinPumpStatus::delivered || !emitted_ || incoming_ ||
      phase_ != AudinChannelPhase::recording) {
    const auto stats = source_.stats();
    (void)fail(stats && stats->last_error != CHANNEL_RC_OK ? stats->last_error
                                                           : ERROR_INVALID_DATA);
    return AudinPumpStatus::failed;
  }
  return AudinPumpStatus::delivered;
}
AudinScheduledStatus AudinDvcGate::tick(std::uint64_t now) noexcept {
  if (!quiescent())
    return AudinScheduledStatus::inactive;
  if (!ready()) {
    cadence_.stop();
    return AudinScheduledStatus::inactive;
  }
  const auto epoch = source_.stats()->epoch;
  if (epoch != scheduled_epoch_) {
    cadence_.stop();
    if (!cadence_.start(epoch, frames_, now)) {
      (void)fail(ERROR_INVALID_STATE);
      return AudinScheduledStatus::failed;
    }
    scheduled_epoch_ = epoch;
  }
  const auto due = cadence_.poll(now);
  if (due.status == CaptureTickStatus::waiting)
    return AudinScheduledStatus::waiting;
  if (due.status != CaptureTickStatus::due ||
      source_.skip(due.skipped_frames) != CaptureStatus::accepted) {
    cadence_.stop();
    (void)fail(ERROR_INVALID_DATA);
    return AudinScheduledStatus::failed;
  }
  if (pump() != AudinPumpStatus::delivered) {
    cadence_.stop();
    return AudinScheduledStatus::failed;
  }
  return AudinScheduledStatus::delivered;
}
std::optional<std::uint64_t> AudinDvcGate::capture_deadline() const noexcept {
  return on_thread() && ready() ? cadence_.deadline() : std::nullopt;
}
std::optional<CaptureCadenceStats> AudinDvcGate::cadence_stats() const noexcept {
  return on_thread() ? std::optional{cadence_.stats()} : std::nullopt;
}
UINT AudinDvcGate::close() noexcept {
  if (retired())
    return close_result_;
  if (!quiescent())
    return ERROR_INVALID_STATE;
  phase_ = AudinChannelPhase::closed;
  cadence_.stop();
  pending_.reset();
  transport_ = nullptr;
  incoming_ = emitted_ = false;
  auto *owned = delegate_;
  delegate_ = nullptr;
  closing_ = true;
  if (owned)
    close_result_ =
        owned->OnClose ? checked([&] { return owned->OnClose(owned); }) : ERROR_INVALID_DATA;
  auto &device = source_.device();
  const auto stopped = device.Close(&device);
  if (close_result_ == CHANNEL_RC_OK)
    close_result_ = stopped;
  closing_ = false;
  ingress_.reset();
  channels_.fill(0);
  data_bytes_ = frames_ = index_ = 0;
  return close_result_;
}
UINT AudinDvcGate::retire() noexcept {
  if (retired())
    return close_result_;
  if (!quiescent())
    return ERROR_INVALID_STATE;
  const auto result = close();
  retired_.store(true, std::memory_order_release);
  return result;
}
} // namespace bridge::audio
