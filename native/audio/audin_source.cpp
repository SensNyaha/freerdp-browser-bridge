#include "audin_source.hpp"
#include <limits>
#include <winpr/error.h>

namespace bridge::audio {
namespace {
std::optional<PcmFormat> capture_format(const AUDIO_FORMAT *format) noexcept {
  if (!format || format->wFormatTag != WAVE_FORMAT_PCM || format->cbSize || format->data ||
      format->nSamplesPerSec != 48000 || format->wBitsPerSample != 16 ||
      (format->nChannels != 1 && format->nChannels != 2) ||
      format->nBlockAlign != format->nChannels * 2 ||
      format->nAvgBytesPerSec != format->nSamplesPerSec * format->nBlockAlign)
    return {};
  return PcmFormat{format->nSamplesPerSec, format->nChannels, format->wBitsPerSample};
}
void add(std::uint64_t &counter, std::uint64_t amount) noexcept {
  const auto limit = (std::numeric_limits<std::uint64_t>::max)();
  counter = amount > limit - counter ? limit : counter + amount;
}
} // namespace
AudinSource::AudinSource()
    : capture_(std::make_unique<PcmCaptureSource>()), thread_(std::this_thread::get_id()) {
  device_.FormatSupported = supported;
  device_.SetFormat = set_format;
  device_.Open = open;
  device_.Close = close;
  device_.Free = free;
}
AudinSource::~AudinSource() {
  if (capture_)
    capture_->stop();
}
bool AudinSource::usable() const noexcept {
  return thread_ == std::this_thread::get_id() && !retired() && capture_;
}
AudinSource *AudinSource::owner(IAudinDevice *device) noexcept {
  return device ? static_cast<Device *>(device)->owner : nullptr;
}
BOOL AudinSource::supported(IAudinDevice *device, const AUDIO_FORMAT *format) noexcept {
  const auto *source = owner(device);
  return source && source->usable() && capture_format(format) ? TRUE : FALSE;
}
UINT AudinSource::set_format(IAudinDevice *device, const AUDIO_FORMAT *format,
                             UINT32 frames) noexcept {
  auto *source = owner(device);
  const auto pcm = capture_format(format);
  if (!source || !source->usable() || source->busy_ || source->stats_.opened)
    return CHANNEL_RC_BAD_CHANNEL_HANDLE;
  if (!pcm || !source->capture_->configure(*pcm, frames))
    return ERROR_INVALID_PARAMETER;
  source->format_ = *format; // PCM has no borrowed extra-format data.
  return CHANNEL_RC_OK;
}
UINT AudinSource::open(IAudinDevice *device, AudinReceive receive, void *user) noexcept {
  auto *source = owner(device);
  if (!source || !source->usable() || source->busy_ || source->stats_.opened)
    return CHANNEL_RC_BAD_CHANNEL_HANDLE;
  if (!receive || !user || !source->capture_->format() ||
      source->stats_.epoch == (std::numeric_limits<std::uint64_t>::max)())
    return ERROR_INVALID_PARAMETER;
  const auto epoch = source->stats_.epoch + 1;
  if (!source->capture_->start(epoch))
    return ERROR_INVALID_PARAMETER;
  source->receive_ = receive;
  source->user_ = user;
  source->stats_.epoch = epoch;
  source->stats_.opened = true;
  source->stats_.last_error = CHANNEL_RC_OK;
  return CHANNEL_RC_OK;
}
void AudinSource::stop() noexcept {
  receive_ = nullptr;
  user_ = nullptr;
  stats_.opened = false;
  capture_->stop();
}
UINT AudinSource::close(IAudinDevice *device) noexcept {
  auto *source = owner(device);
  if (!source)
    return ERROR_INVALID_PARAMETER;
  if (source->retired())
    return CHANNEL_RC_OK;
  if (!source->usable() || source->busy_)
    return CHANNEL_RC_BAD_CHANNEL_HANDLE;
  source->stop();
  return CHANNEL_RC_OK;
}
UINT AudinSource::free(IAudinDevice *device) noexcept {
  auto *source = owner(device);
  if (!source)
    return ERROR_INVALID_PARAMETER;
  return source->retire() ? CHANNEL_RC_OK : CHANNEL_RC_BAD_CHANNEL_HANDLE;
}
CaptureStatus AudinSource::submit(const CapturePacket &packet) noexcept {
  if (!usable() || !stats_.opened || busy_)
    return CaptureStatus::inactive;
  return capture_->submit(packet);
}
CaptureStatus AudinSource::skip(std::uint64_t frames) noexcept {
  if (!usable() || !stats_.opened || busy_)
    return CaptureStatus::inactive;
  return capture_->skip(frames);
}
AudinCaptureReset AudinSource::reset_capture(std::uint64_t expected) noexcept {
  if (!usable() || !stats_.opened)
    return {AudinCaptureResetStatus::inactive};
  if (busy_)
    return {AudinCaptureResetStatus::busy};
  if (!expected)
    return {AudinCaptureResetStatus::invalid};
  if (expected != stats_.epoch)
    return {AudinCaptureResetStatus::stale};
  if (stats_.epoch == (std::numeric_limits<std::uint64_t>::max)()) {
    stop();
    return {AudinCaptureResetStatus::exhausted};
  }
  const auto next = stats_.epoch + 1;
  if (!capture_->start(next)) {
    stop();
    return {AudinCaptureResetStatus::failed};
  }
  stats_.epoch = next;
  add(stats_.capture_resets, 1);
  return {AudinCaptureResetStatus::reset, next};
}
AudinPumpStatus AudinSource::pump() noexcept {
  if (!usable() || !stats_.opened || !receive_)
    return AudinPumpStatus::inactive;
  if (busy_)
    return AudinPumpStatus::invalid;
  busy_ = true;
  UINT result = ERROR_INTERNAL_ERROR;
  const auto block = capture_->read();
  if (block.status == CaptureStatus::accepted) {
    try {
      result = receive_(&format_, block.bytes.data(), block.bytes.size(), user_);
    } catch (...) {
      result = ERROR_INTERNAL_ERROR;
    }
  }
  busy_ = false;
  stats_.last_error = result;
  if (result != CHANNEL_RC_OK) {
    add(stats_.callback_failures, 1);
    stop(); // Callback has returned; borrowed bytes can now be wiped.
    return AudinPumpStatus::failed;
  }
  add(stats_.callbacks, 1);
  add(stats_.emitted_frames, block.frames + block.silence_frames);
  return AudinPumpStatus::delivered;
}
std::optional<AudinSourceStats> AudinSource::stats() const noexcept {
  if (thread_ != std::this_thread::get_id())
    return {};
  auto value = stats_;
  if (capture_)
    value.capture = capture_->stats();
  return value;
}
bool AudinSource::retire() noexcept {
  if (retired())
    return true;
  if (!usable() || busy_)
    return false;
  stop();
  stats_.capture = capture_->stats();
  capture_.reset();
  retired_.store(true, std::memory_order_release);
  return true;
}
} // namespace bridge::audio
