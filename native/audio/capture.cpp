#include "capture.hpp"
#include <algorithm>
#include <bit>
#include <limits>

namespace bridge::audio {
namespace {
void add(std::uint64_t &counter, std::size_t amount) noexcept {
  const auto value = static_cast<std::uint64_t>(amount);
  const auto limit = (std::numeric_limits<std::uint64_t>::max)();
  counter = value > limit - counter ? limit : counter + value;
}
std::int16_t sample(const std::uint8_t *bytes) noexcept {
  const auto value = static_cast<std::uint16_t>(static_cast<std::uint16_t>(bytes[0]) |
                                                (static_cast<std::uint16_t>(bytes[1]) << 8));
  return std::bit_cast<std::int16_t>(value);
}
} // namespace
PcmCaptureSource::PcmCaptureSource()
    : scratch_(std::make_unique<std::array<std::uint8_t, PcmNormalizer::max_output_bytes>>()) {}
bool PcmCaptureSource::configure(PcmFormat format, std::size_t frames) noexcept {
  if (stats_.active || format.rate != 48000 || format.bits != 16 ||
      (format.channels != 1 && format.channels != 2) || frames == 0 ||
      frames > PcmNormalizer::max_output_frames) {
    add(stats_.invalid_calls, 1);
    return false;
  }
  format_ = format;
  frames_per_packet_ = frames;
  queue_.reset();
  scratch_->fill(0);
  stats_.buffering = true;
  return true;
}
bool PcmCaptureSource::start(std::uint64_t epoch) noexcept {
  if (!format_ || epoch == 0 || epoch <= epoch_) {
    add(stats_.invalid_calls, 1);
    return false;
  }
  queue_.reset();
  scratch_->fill(0);
  timestamp_.reset();
  epoch_ = epoch;
  stats_.active = stats_.buffering = true;
  return true;
}
void PcmCaptureSource::stop() noexcept {
  queue_.reset();
  scratch_->fill(0);
  timestamp_.reset();
  stats_.active = false;
  stats_.buffering = true;
}
CaptureStatus PcmCaptureSource::submit(const CapturePacket &packet) noexcept {
  if (!stats_.active)
    return CaptureStatus::inactive;
  if (packet.epoch != epoch_) {
    add(stats_.stale_packets, 1);
    return CaptureStatus::stale;
  }
  constexpr auto max_time = (std::numeric_limits<std::uint64_t>::max)() - 20000;
  if (packet.stereo.size() != packet_bytes || packet.timestamp_us > max_time ||
      (!timestamp_ && !packet.discontinuity) ||
      (timestamp_ && (packet.timestamp_us <= *timestamp_ ||
                      (!packet.discontinuity && packet.timestamp_us != *timestamp_ + 20000)))) {
    add(stats_.invalid_calls, 1);
    return CaptureStatus::invalid;
  }
  if (packet.discontinuity) {
    queue_.reset();
    stats_.buffering = true;
    add(stats_.discontinuities, 1);
  }
  const auto queued = queue_.stats().queued_frames;
  if (queued + packet_frames > PcmQueue::capacity_frames)
    queue_.discard(queued + packet_frames - PcmQueue::capacity_frames);
  if (queue_.push(packet.stereo) != QueueStatus::accepted) {
    add(stats_.invalid_calls, 1);
    return CaptureStatus::invalid;
  }
  timestamp_ = packet.timestamp_us;
  return CaptureStatus::accepted;
}
CaptureRead PcmCaptureSource::read() noexcept {
  if (!stats_.active || !format_)
    return {CaptureStatus::inactive, {}};
  const auto stereo_bytes = frames_per_packet_ * 4;
  std::span<std::uint8_t> output(scratch_->data(), stereo_bytes);
  const auto threshold = (std::max)(prebuffer_frames, frames_per_packet_);
  if (stats_.buffering && queue_.stats().queued_frames < threshold) {
    std::fill(output.begin(), output.end(), 0);
    add(stats_.buffering_silence_frames, frames_per_packet_);
    return {CaptureStatus::accepted, output.first(frames_per_packet_ * format_->channels * 2), 0,
            frames_per_packet_, false};
  }
  stats_.buffering = false;
  const auto result = queue_.read(output);
  if (result.status != QueueStatus::accepted) {
    add(stats_.invalid_calls, 1);
    return {CaptureStatus::invalid, {}};
  }
  if (result.silence_frames) {
    stats_.buffering = true;
    queue_.reset(); // Empty after padding; mark the next real capture boundary.
  }
  if (format_->channels == 1) {
    for (std::size_t i = 0; i < frames_per_packet_; ++i) {
      const auto left = static_cast<std::int32_t>(sample(output.data() + i * 4));
      const auto right = static_cast<std::int32_t>(sample(output.data() + i * 4 + 2));
      const auto mono = static_cast<std::uint16_t>((left + right) / 2);
      output[i * 2] = static_cast<std::uint8_t>(mono);
      output[i * 2 + 1] = static_cast<std::uint8_t>(mono >> 8);
    }
    std::fill(output.begin() + static_cast<std::ptrdiff_t>(frames_per_packet_ * 2), output.end(),
              0);
  }
  return {CaptureStatus::accepted, output.first(frames_per_packet_ * format_->channels * 2),
          result.frames, result.silence_frames, result.discontinuity};
}
CaptureStats PcmCaptureSource::stats() const noexcept {
  auto value = stats_;
  value.queue = queue_.stats();
  return value;
}
} // namespace bridge::audio
