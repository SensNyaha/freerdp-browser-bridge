#include "rdpsnd_sink.hpp"
#include <algorithm>
#include <bit>
#include <limits>

namespace bridge::audio {
namespace {
std::optional<PcmFormat> pcm_format(const AUDIO_FORMAT *format) noexcept {
  if (!format || format->wFormatTag != WAVE_FORMAT_PCM || format->cbSize || format->data ||
      format->nSamplesPerSec < 8000 || format->nSamplesPerSec > 48000 ||
      (format->nChannels != 1 && format->nChannels != 2) ||
      (format->wBitsPerSample != 8 && format->wBitsPerSample != 16))
    return {};
  const auto align = format->nChannels * (format->wBitsPerSample / 8U);
  if (format->nBlockAlign != align || format->nAvgBytesPerSec != format->nSamplesPerSec * align)
    return {};
  return PcmFormat{format->nSamplesPerSec, format->nChannels, format->wBitsPerSample};
}
void increment(std::uint64_t &counter) noexcept {
  if (counter != (std::numeric_limits<std::uint64_t>::max)())
    ++counter;
}
} // namespace
RdpsndSink::RdpsndSink(OutputBufferProfile profile)
    : pipeline_(std::make_unique<Pipeline>(profile)), thread_(std::this_thread::get_id()) {
  device_.FormatSupported = supported;
  device_.Open = open;
  device_.GetVolume = get_volume;
  device_.SetVolume = set_volume;
  device_.Play = play;
  device_.Close = close;
  device_.Free = free;
  device_.DefaultFormat = default_format;
  // PlayEx receives the original compressed format even after upstream decode.
  // Legacy Play consumes bytes in the PCM format passed to Open instead.
}
RdpsndSink *RdpsndSink::owner(rdpsndDevicePlugin *device) noexcept {
  return device ? static_cast<Device *>(device)->owner : nullptr;
}
bool RdpsndSink::usable() const noexcept {
  return thread_ == std::this_thread::get_id() && !retired() && pipeline_;
}
void RdpsndSink::discontinuity(SourceAvailability next) noexcept {
  increment(stats_.stream_revision);
  stats_.availability = next;
  pipeline_->pcm.reset();
  pipeline_->queue.reset();
  pipeline_->packets.reset();
}
BOOL RdpsndSink::supported(rdpsndDevicePlugin *device, const AUDIO_FORMAT *format) noexcept {
  auto *sink = owner(device);
  return sink && sink->usable() && pcm_format(format) ? TRUE : FALSE;
}
BOOL RdpsndSink::open(rdpsndDevicePlugin *device, const AUDIO_FORMAT *format, UINT32) noexcept {
  auto *sink = owner(device);
  const auto pcm = pcm_format(format);
  if (!sink || !sink->usable() || !pcm || !sink->pipeline_->pcm.configure(*pcm))
    return FALSE;
  sink->pipeline_->queue.reset();
  sink->pipeline_->packets.reset();
  increment(sink->stats_.stream_revision);
  sink->stats_.availability = SourceAvailability::waiting;
  sink->opened_ = true;
  return TRUE;
}
UINT32 RdpsndSink::get_volume(rdpsndDevicePlugin *device) noexcept {
  auto *sink = owner(device);
  return sink && sink->usable() ? sink->volume_.packed() : 0;
}
BOOL RdpsndSink::set_volume(rdpsndDevicePlugin *device, UINT32 value) noexcept {
  auto *sink = owner(device);
  if (!sink || !sink->usable())
    return FALSE;
  sink->volume_.set(value);
  return TRUE;
}
UINT RdpsndSink::play(rdpsndDevicePlugin *device, const BYTE *data, std::size_t size) noexcept {
  auto *sink = owner(device);
  if (!sink || !sink->usable() || !sink->opened_)
    return 0;
  auto &pipeline = *sink->pipeline_;
  if (!data || size == 0 || size > PcmNormalizer::max_input_bytes) {
    increment(sink->stats_.rejected_packets);
    sink->discontinuity(SourceAvailability::failed);
    return 0;
  }
  const auto format = pipeline.pcm.format();
  const auto align = format ? static_cast<std::size_t>(format->channels) * (format->bits / 8U) : 0;
  if (!format || !align || size % align) {
    increment(sink->stats_.rejected_packets);
    sink->discontinuity(SourceAvailability::failed);
    return 0;
  }
  const auto quantum = static_cast<std::size_t>(format->rate / 10U) * align;
  const bool chunked = size > quantum;
  if (chunked)
    increment(sink->stats_.chunked_packets);
  // A whole bounded PCM callback is validated above. Reuse the fixed 100 ms
  // normalizer arena; large callbacks retain only the newest 120 ms in the ring.
  // No consumer can borrow this serialized owner in the middle of the callback.
  for (std::size_t offset = 0; offset < size;) {
    const auto count = (std::min)(quantum, size - offset);
    const auto normalized = pipeline.pcm.process(std::span(data + offset, count));
    if (normalized.status != PcmStatus::accepted) {
      increment(sink->stats_.rejected_packets);
      sink->discontinuity(SourceAvailability::failed);
      return 0;
    }
    for (std::size_t at = 0; at < normalized.bytes.size(); at += 2) {
      const auto word =
          static_cast<std::uint16_t>(static_cast<unsigned>(normalized.bytes[at]) |
                                     (static_cast<unsigned>(normalized.bytes[at + 1]) << 8));
      const auto sample = std::bit_cast<std::int16_t>(word);
      const auto scaled = sink->volume_.apply(sample, at / 2 % 2 != 0);
      const auto bits = static_cast<std::uint16_t>(scaled);
      pipeline.volume[at] = static_cast<std::uint8_t>(bits);
      pipeline.volume[at + 1] = static_cast<std::uint8_t>(bits >> 8);
    }
    if (!normalized.bytes.empty()) {
      const auto free = pipeline.queue.capacity() - pipeline.queue.stats().queued_frames;
      if (chunked && normalized.frames > free)
        (void)pipeline.queue.discard_unstamped(normalized.frames - free);
      if (pipeline.queue.push(std::span(pipeline.volume).first(normalized.bytes.size())) !=
          QueueStatus::accepted) {
        increment(sink->stats_.overflow_resets);
        sink->discontinuity(SourceAvailability::waiting);
        return 0;
      }
      sink->stats_.availability = SourceAvailability::ready;
    }
    offset += count;
  }
  // The public Play return value is queued latency in milliseconds, not a Win32 status.
  const auto frames = pipeline.queue.stats().queued_frames;
  return static_cast<UINT>((frames * 1000 + PcmNormalizer::output_rate - 1) /
                           PcmNormalizer::output_rate);
}
void RdpsndSink::close(rdpsndDevicePlugin *device) noexcept {
  auto *sink = owner(device);
  if (sink && sink->usable()) {
    sink->opened_ = false;
    sink->discontinuity(SourceAvailability::closed);
  }
}
void RdpsndSink::free(rdpsndDevicePlugin *device) noexcept {
  if (auto *sink = owner(device))
    (void)sink->retire();
}
BOOL RdpsndSink::default_format(rdpsndDevicePlugin *device, const AUDIO_FORMAT *desired,
                                AUDIO_FORMAT *result) noexcept {
  auto *sink = owner(device);
  if (!sink || !sink->usable() || !desired || !result || desired->nSamplesPerSec < 8000 ||
      desired->nSamplesPerSec > 48000 || (desired->nChannels != 1 && desired->nChannels != 2))
    return FALSE;
  AUDIO_FORMAT pcm{};
  pcm.wFormatTag = WAVE_FORMAT_PCM;
  pcm.nChannels = desired->nChannels;
  pcm.nSamplesPerSec = desired->nSamplesPerSec;
  pcm.wBitsPerSample = 16;
  pcm.nBlockAlign = static_cast<UINT16>(pcm.nChannels * 2);
  pcm.nAvgBytesPerSec = pcm.nSamplesPerSec * pcm.nBlockAlign;
  *result = pcm;
  return TRUE;
}
QueueRead RdpsndSink::read(std::span<std::uint8_t> output) noexcept {
  if (!usable() || !opened_)
    return {QueueStatus::invalid};
  return pipeline_->queue.read(output);
}
std::optional<SinkStats> RdpsndSink::stats() const noexcept {
  if (thread_ != std::this_thread::get_id())
    return {};
  auto result = stats_;
  if (pipeline_) {
    result.queue = pipeline_->queue.stats();
    result.packets = pipeline_->packets.stats();
  }
  return result;
}
PcmPacket RdpsndSink::packet(std::uint64_t now) noexcept {
  if (!usable() || !opened_)
    return {PacketStatus::invalid, {}};
  return pipeline_->packets.read(pipeline_->queue, now);
}
std::optional<std::uint64_t> RdpsndSink::publication_deadline() const noexcept {
  return usable() && opened_ ? pipeline_->packets.deadline() : std::nullopt;
}
bool RdpsndSink::reset_stream(SourceAvailability next) noexcept {
  if (!usable())
    return false;
  switch (next) {
  case SourceAvailability::waiting:
  case SourceAvailability::suspended:
  case SourceAvailability::closed:
  case SourceAvailability::failed:
  case SourceAvailability::unavailable:
    break;
  default:
    return false;
  }
  discontinuity(next);
  return true;
}
bool RdpsndSink::ready() const noexcept {
  return usable() && opened_ &&
         stats_.stream_revision != (std::numeric_limits<std::uint64_t>::max)();
}
std::optional<std::uint64_t> RdpsndSink::stream_revision() const noexcept {
  return thread_ == std::this_thread::get_id() ? std::optional{stats_.stream_revision}
                                               : std::nullopt;
}
bool RdpsndSink::retire() noexcept {
  if (retired())
    return true;
  if (thread_ != std::this_thread::get_id())
    return false;
  opened_ = false;
  discontinuity(SourceAvailability::closed);
  stats_.queue = pipeline_->queue.stats();
  stats_.packets = pipeline_->packets.stats();
  pipeline_.reset();
  retired_.store(true, std::memory_order_release);
  return true;
}
} // namespace bridge::audio
