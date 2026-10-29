#include "../compat/span.hpp"
#include "static_gate.hpp"
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <exception>
#include <freerdp/channels/rdpsnd.h>
#include <freerdp/freerdp.h>
#include <limits>
#include <winpr/error.h>
#include <winpr/sysinfo.h>

namespace bridge::audio {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
std::uint16_t u16(::bridge::compat::span<const BYTE> bytes, std::size_t at) noexcept {
  return static_cast<std::uint16_t>(bytes[at] | static_cast<unsigned>(bytes[at + 1]) << 8);
}
std::uint32_t u32(::bridge::compat::span<const BYTE> bytes, std::size_t at) noexcept {
  return static_cast<std::uint32_t>(u16(bytes, at)) | static_cast<std::uint32_t>(u16(bytes, at + 2))
                                                          << 16;
}
} // namespace
AudioStaticGate::AudioStaticGate(rdpContext &context, RdpsndSink &sink)
    : context_(&context), sink_(sink), thread_(std::this_thread::get_id()) {}
AudioStaticGate::~AudioStaticGate() {
  // Host callback addresses still refer to this wrapper until final Terminated.
  if (registered_ && !host_terminated_.load(std::memory_order_acquire))
    std::terminate();
}
bool AudioStaticGate::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
std::optional<AudioGateStats> AudioStaticGate::stats() const noexcept {
  if (!on_thread())
    return {};
  auto result = stats_;
  result.clock = clock_.stats();
  return result;
}
bool AudioStaticGate::ready_for(const rdpContext &context, const RdpsndSink &sink) const noexcept {
  return on_thread() && context_ == &context && &sink_ == &sink && !attempted_ && !retired();
}
void AudioStaticGate::fail(unsigned reason) noexcept {
  // Fixed fault classification only: no audio, format data, session or credentials.
  if (!failed_)
    (void)std::fprintf(stderr, "bridge.audio.guard fault=%u\n", reason);
  failed_ = true;
  (void)sink_.reset_stream(SourceAvailability::failed);
  if (context_)
    setChannelError(context_, ERROR_INVALID_DATA, "Invalid audio channel record or lifecycle");
}
BOOL AudioStaticGate::install(CHANNEL_ENTRY_POINTS_FREERDP_EX *host, LPVOID handle,
                              PVIRTUALCHANNELENTRYEX entry) noexcept {
  if (!on_thread() || attempted_ || retired() || !host || !handle || !entry ||
      host->cbSize != sizeof(*host) || host->MagicNumber != FREERDP_CHANNEL_MAGIC_NUMBER ||
      host->context != context_ || !host->pVirtualChannelInitEx || !host->pVirtualChannelOpenEx ||
      !host->pVirtualChannelCloseEx || !host->pVirtualChannelWriteEx || !sink_.stats() ||
      sink_.retired() || !context_->settings ||
      !freerdp_settings_get_bool(context_->settings, FreeRDP_SynchronousStaticChannels) ||
      freerdp_settings_get_bool(context_->settings, FreeRDP_AsyncChannels) ||
      freerdp_settings_get_bool(context_->settings, FreeRDP_AsyncUpdate))
    return FALSE;
  attempted_ = true;
  handle_ = handle;
  host_ = wrapped_ = *host;
  // Internal, fixed baseline policy; never accept arbitrary caller backend/device argv.
  wrapped_.pExtendedData = &args_;
  wrapped_.pVirtualChannelInitEx = init;
  wrapped_.pVirtualChannelOpenEx = open;
  wrapped_.pVirtualChannelCloseEx = close;
  wrapped_.pVirtualChannelWriteEx = write;
  busy_ = true;
  BOOL accepted = FALSE;
  try {
    accepted = entry(reinterpret_cast<PCHANNEL_ENTRY_POINTS_EX>(&wrapped_), this);
  } catch (...) {
    fail();
  }
  busy_ = false;
  return accepted && registered_ && !failed_ ? TRUE : FALSE;
}
UINT VCAPITYPE AudioStaticGate::init(LPVOID user, LPVOID client, LPVOID opaque,
                                     PCHANNEL_DEF channels, INT count, ULONG version,
                                     PCHANNEL_INIT_EVENT_EX_FN callback) noexcept {
  auto *gate = static_cast<AudioStaticGate *>(opaque);
  if (!gate || !gate->on_thread() || gate->registered_ || !user || !callback || count != 1 ||
      !channels || std::strncmp(channels->name, RDPSND_CHANNEL_NAME, sizeof(channels->name)) != 0 ||
      gate->retired())
    return ERROR_INVALID_PARAMETER;
  gate->delegate_user_ = user;
  gate->delegate_init_ = callback;
  UINT status = ERROR_INTERNAL_ERROR;
  try {
    status = gate->host_.pVirtualChannelInitEx(gate, client, gate->handle_, channels, count,
                                               version, init_event);
  } catch (...) {
  }
  if (status == CHANNEL_RC_OK)
    gate->registered_ = true;
  else {
    gate->delegate_user_ = nullptr;
    gate->delegate_init_ = nullptr;
  }
  return status;
}
UINT VCAPITYPE AudioStaticGate::open(LPVOID opaque, LPDWORD result, PCHAR name,
                                     PCHANNEL_OPEN_EVENT_EX_FN callback) noexcept {
  auto *gate = static_cast<AudioStaticGate *>(opaque);
  if (!gate || !gate->on_thread() || gate->retired() || gate->failed_ || gate->open_handle_ ||
      !result || !name || std::strcmp(name, RDPSND_CHANNEL_NAME) != 0 || !callback)
    return ERROR_INVALID_PARAMETER;
  gate->delegate_open_ = callback;
  UINT status = ERROR_INTERNAL_ERROR;
  try {
    status = gate->host_.pVirtualChannelOpenEx(gate->handle_, result, name, open_event);
  } catch (...) {
  }
  if (status == CHANNEL_RC_OK && *result) {
    gate->open_handle_ = *result;
    gate->completion_handle_ = *result;
  } else {
    gate->delegate_open_ = nullptr;
    if (status == CHANNEL_RC_OK)
      status = ERROR_INVALID_HANDLE;
  }
  return status;
}
UINT VCAPITYPE AudioStaticGate::close(LPVOID opaque, DWORD handle) noexcept {
  auto *gate = static_cast<AudioStaticGate *>(opaque);
  if (!gate || !gate->on_thread() || !handle || handle != gate->open_handle_)
    return ERROR_INVALID_HANDLE;
  UINT status = ERROR_INTERNAL_ERROR;
  try {
    status = gate->host_.pVirtualChannelCloseEx(gate->handle_, handle);
  } catch (...) {
  }
  gate->close_status_ = status;
  if (status == CHANNEL_RC_OK)
    gate->open_handle_ = 0;
  return status;
}
UINT VCAPITYPE AudioStaticGate::write(LPVOID opaque, DWORD handle, LPVOID data, ULONG size,
                                      LPVOID completion) noexcept {
  auto *gate = static_cast<AudioStaticGate *>(opaque);
  if (!gate || !gate->on_thread() || gate->retired() || gate->failed_ || gate->writing_ ||
      !handle || handle != gate->open_handle_ || !data || !completion || !size ||
      size > AudioAssembler::max_bytes ||
      std::find(gate->writes_.begin(), gate->writes_.end(), completion) != gate->writes_.end())
    return ERROR_INVALID_PARAMETER;
  const auto slot = std::find(gate->writes_.begin(), gate->writes_.end(), nullptr);
  if (slot == gate->writes_.end())
    return ERROR_NOT_ENOUGH_MEMORY;
  *slot = completion;
  increment(gate->stats_.writes);
  const auto record = ::bridge::compat::span<const BYTE>(static_cast<const BYTE *>(data), size);
  if (size >= 20 && record[0] == SNDC_FORMATS) // Scalar client count, not payload logging.
    gate->stats_.client_formats = u16(record, 18);
  UINT status = ERROR_INTERNAL_ERROR;
  gate->writing_ = true;
  try {
    status = gate->host_.pVirtualChannelWriteEx(gate->handle_, handle, data, size, completion);
  } catch (...) {
  }
  gate->writing_ = false;
  if (status != CHANNEL_RC_OK) {
    increment(gate->stats_.write_failures);
    if (!*slot) {
      // Completion already freed the upstream stream. Never return a second-free status.
      gate->fail();
      return CHANNEL_RC_OK;
    }
    *slot = nullptr;
  }
  return status;
}
void VCAPITYPE AudioStaticGate::init_event(LPVOID opaque, LPVOID handle, UINT event, LPVOID data,
                                           UINT size) noexcept {
  auto *gate = static_cast<AudioStaticGate *>(opaque);
  if (!gate || handle != gate->handle_)
    return;
  if (event == CHANNEL_EVENT_TERMINATED) {
    // Final host callback is allowed after owner retirement/join and is a no-op then.
    if (!gate->retired() && (!gate->on_thread() || gate->retire() != CHANNEL_RC_OK))
      return;
    gate->host_terminated_.store(true, std::memory_order_release);
    return;
  }
  if (!gate->on_thread() || gate->retired() || !gate->delegate_init_)
    return;
  if (gate->busy_ || gate->writing_) {
    gate->fail();
    return;
  }
  if (event == CHANNEL_EVENT_CONNECTED)
    gate->connected_ = true;
  if (event == CHANNEL_EVENT_DISCONNECTED) {
    if (gate->disconnected_)
      return; // Only owner retirement may finish a failed close/cleanup.
    gate->disconnected_ = true;
    (void)gate->sink_.reset_stream(SourceAvailability::closed);
  }
  gate->busy_ = true;
  try {
    gate->delegate_init_(gate->delegate_user_, gate, event, data, size);
  } catch (...) {
    gate->fail();
  }
  gate->busy_ = false;
}
void VCAPITYPE AudioStaticGate::open_event(LPVOID opaque, DWORD handle, UINT event, LPVOID data,
                                           UINT size, UINT total, UINT flags) noexcept {
  auto *gate = static_cast<AudioStaticGate *>(opaque);
  if (!gate || !gate->on_thread() || gate->retired() || !gate->delegate_open_)
    return;
  if (event == CHANNEL_EVENT_WRITE_COMPLETE || event == CHANNEL_EVENT_WRITE_CANCELLED) {
    const auto slot = std::find(gate->writes_.begin(), gate->writes_.end(), data);
    if (!data || slot == gate->writes_.end() || handle != gate->completion_handle_) {
      gate->fail();
      return;
    }
    *slot = nullptr;
    increment(event == CHANNEL_EVENT_WRITE_COMPLETE ? gate->stats_.completions
                                                    : gate->stats_.cancellations);
    try {
      gate->delegate_open_(gate->delegate_user_, handle, event, data, size, total, flags);
    } catch (...) {
      gate->fail();
    }
    return;
  }
  if (gate->busy_ || gate->writing_) {
    gate->fail();
    return;
  }
  if (event == CHANNEL_EVENT_DATA_RECEIVED) {
    if (gate->failed_ || gate->disconnected_ || !handle || handle != gate->open_handle_)
      return;
    const auto transition = flags & (CHANNEL_FLAG_SUSPEND | CHANNEL_FLAG_RESUME);
    if (transition) {
      if ((transition != CHANNEL_FLAG_SUSPEND && transition != CHANNEL_FLAG_RESUME) ||
          flags != transition || size != 0 || total != 0 || gate->assembler_.assembling() ||
          gate->validator_.awaiting_wave()) {
        gate->fail();
        return;
      }
      gate->assembler_.reset();
      gate->validator_.reset();
      gate->clock_.reset();
      (void)gate->sink_.reset_stream(transition == CHANNEL_FLAG_SUSPEND
                                         ? SourceAvailability::suspended
                                         : SourceAvailability::waiting);
      return;
    }
    if ((flags & ~(CHANNEL_FLAG_FIRST | CHANNEL_FLAG_LAST | CHANNEL_FLAG_SHOW_PROTOCOL)) ||
        (!data && size)) {
      gate->fail();
      return;
    }
    const auto joined =
        gate->assembler_.push(::bridge::compat::span(static_cast<const BYTE *>(data), size), total,
                              (flags & CHANNEL_FLAG_FIRST) != 0, (flags & CHANNEL_FLAG_LAST) != 0);
    if (joined.status == FragmentStatus::invalid) {
      gate->fail(1);
      return;
    }
    if (joined.status == FragmentStatus::collecting)
      return;
    const auto pdu = gate->validator_.validate(joined.bytes);
    if (!pdu) {
      gate->fail(2);
      return;
    }
    if ((pdu->kind == AudioPduKind::wave_info || pdu->kind == AudioPduKind::wave ||
         pdu->kind == AudioPduKind::wave2) &&
        pdu->format_index >= gate->selected_count_) {
      gate->fail(3);
      return;
    }
    if (pdu->kind == AudioPduKind::close) {
      increment(gate->stats_.closes);
      gate->clock_.reset();
      (void)gate->sink_.reset_stream(SourceAvailability::closed);
    }
    if (pdu->kind == AudioPduKind::wave_info || pdu->kind == AudioPduKind::wave2) {
      const auto &format = gate->selected_formats_[pdu->format_index];
      const auto align = format.channels * (format.bits / 8U);
      if (!align || pdu->sample_bytes % align) {
        gate->fail(4);
        return;
      }
      const auto reset = gate->clock_.observe(
          {pdu->timestamp, format.rate, static_cast<std::uint32_t>(pdu->sample_bytes / align),
           pdu->format_index, pdu->timestamp_bits, pdu->block, GetTickCount64()});
      if (!reset) {
        (void)std::fprintf(stderr, "bridge.audio.clock rate=%u frames=%zu align=%u\n",
                           static_cast<unsigned>(format.rate), pdu->sample_bytes / align,
                           static_cast<unsigned>(align));
        gate->fail(5);
        return;
      }
      if (*reset)
        (void)gate->sink_.reset_stream();
    }
    data = const_cast<BYTE *>(joined.bytes.data());
    size = total = static_cast<UINT>(joined.bytes.size());
    if (pdu->kind == AudioPduKind::training)
      increment(gate->stats_.training);
    if (pdu->kind == AudioPduKind::wave || pdu->kind == AudioPduKind::wave2)
      increment(gate->stats_.waves);
    if (pdu->kind == AudioPduKind::formats) {
      std::array<BYTE, max_pcm_offer_bytes> candidate{};
      const auto selected = select_pcm_offers(joined.bytes, candidate, gate->sink_.capture_enabled());
      if (!selected) {
        gate->fail(6);
        return;
      }
      if (gate->negotiated_ && (selected->count != gate->selected_count_ ||
                                u16(selected->bytes, 21) != u16(gate->offers_, 21) ||
                                !std::equal(selected->bytes.begin() + 24, selected->bytes.end(),
                                            gate->offers_.begin() + 24))) {
        // Same-index reopen is safe only for the identical supported PCM table.
        // Do not mutate upstream/device format ownership for a replacement.
        gate->failed_ = true;
        (void)std::fprintf(stderr, "bridge.audio.guard fault=7\n");
        (void)gate->sink_.reset_stream(SourceAvailability::failed);
        setChannelError(gate->context_, ERROR_NOT_SUPPORTED,
                        "Audio format table renegotiation is unsupported");
        return;
      }
      std::copy(selected->bytes.begin(), selected->bytes.end(), gate->offers_.begin());
      increment(gate->stats_.formats);
      const bool repeated = gate->negotiated_;
      gate->negotiated_ = true;
      gate->selected_count_ = selected->count;
      gate->stats_.server_formats = selected->count;
      // Identical negotiation metadata does not change an already-owned PCM stream.
      // Resetting here causes gaps when XRDP periodically reannounces its table.
      if (!repeated) {
        gate->clock_.reset();
        (void)gate->sink_.reset_stream(selected->count ? SourceAvailability::waiting
                                                       : SourceAvailability::unavailable);
      }
      for (std::size_t at = 0; at < selected->count; ++at) {
        const auto offset = 24 + 18 * at;
        gate->selected_formats_[at] = {u32(selected->bytes, offset + 4),
                                       u16(selected->bytes, offset + 2),
                                       u16(selected->bytes, offset + 14)};
      }
      data = gate->offers_.data();
      size = total = static_cast<UINT>(selected->bytes.size());
      if (selected->count == 0) {
        // Pinned rdpsnd requires 30 bytes for the 20-byte fixed Formats body.
        // Pad only internal dispatch; no synthetic format reaches negotiation.
        std::fill_n(gate->offers_.begin() + 24, 10, BYTE{0});
        size = total = 34;
      }
    }
    flags = CHANNEL_FLAG_FIRST | CHANNEL_FLAG_LAST;
  }
  gate->busy_ = true;
  try {
    gate->delegate_open_(gate->delegate_user_, handle, event, data, size, total, flags);
  } catch (...) {
    gate->fail();
  }
  gate->busy_ = false;
}
UINT AudioStaticGate::retire() noexcept {
  if (retired())
    return CHANNEL_RC_OK;
  if (!on_thread() || busy_ || writing_)
    return ERROR_INVALID_STATE;
  bool requested_disconnect = false;
  if (delegate_init_ && connected_ && !disconnected_) {
    requested_disconnect = true;
    disconnected_ = true;
    (void)sink_.reset_stream(SourceAvailability::closed);
    busy_ = true;
    try {
      delegate_init_(delegate_user_, this, CHANNEL_EVENT_DISCONNECTED, nullptr, 0);
    } catch (...) {
      busy_ = false;
      fail();
      return ERROR_INTERNAL_ERROR;
    }
    busy_ = false;
  }
  if (std::any_of(writes_.begin(), writes_.end(), [](auto value) { return value != nullptr; }))
    return ERROR_IO_PENDING;
  if (open_handle_) {
    const auto callback = delegate_init_;
    if (!callback || !delegate_user_)
      return ERROR_INVALID_STATE;
    // Pinned rdpsnd clears its own OpenHandle before calling CloseEx and skips
    // cleanup on failure. Retain ours, retry once per later owner call, then
    // re-enter its public Disconnected callback to finish cleanup with handle 0.
    if (requested_disconnect)
      return close_status_ != CHANNEL_RC_OK ? close_status_ : ERROR_INVALID_HANDLE;
    busy_ = true;
    const auto status = close(this, open_handle_);
    busy_ = false;
    if (status != CHANNEL_RC_OK)
      return status;
    busy_ = true;
    try {
      callback(delegate_user_, this, CHANNEL_EVENT_DISCONNECTED, nullptr, 0);
    } catch (...) {
      busy_ = false;
      fail();
      return ERROR_INTERNAL_ERROR;
    }
    busy_ = false;
    if (std::any_of(writes_.begin(), writes_.end(), [](auto value) { return value != nullptr; }))
      return ERROR_IO_PENDING;
  }
  if (delegate_init_) {
    busy_ = true;
    try {
      delegate_init_(delegate_user_, this, CHANNEL_EVENT_TERMINATED, nullptr, 0);
    } catch (...) {
      busy_ = false;
      fail();
      return ERROR_INTERNAL_ERROR;
    }
    busy_ = false;
  }
  delegate_init_ = nullptr;
  delegate_open_ = nullptr;
  delegate_user_ = nullptr;
  if (!sink_.retire())
    return ERROR_INVALID_STATE;
  assembler_.reset();
  validator_.reset();
  clock_.reset();
  retired_.store(true, std::memory_order_release);
  return CHANNEL_RC_OK;
}
} // namespace bridge::audio
