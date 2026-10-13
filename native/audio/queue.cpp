#include "queue.hpp"
#include <algorithm>
#include <limits>

namespace bridge::audio {
namespace {
void add(std::uint64_t &counter, std::size_t amount) noexcept {
  const auto value = static_cast<std::uint64_t>(amount);
  const auto limit = (std::numeric_limits<std::uint64_t>::max)();
  counter = value > limit - counter ? limit : counter + value;
}
bool valid(std::size_t bytes) noexcept {
  return bytes != 0 && bytes <= PcmNormalizer::max_output_bytes && bytes % 4 == 0;
}
} // namespace
PcmQueue::PcmQueue() : bytes_(std::make_unique<std::array<std::uint8_t, capacity_bytes>>()) {}
QueueStatus PcmQueue::push(std::span<const std::uint8_t> input) noexcept {
  if (!valid(input.size())) {
    add(stats_.invalid_calls, 1);
    return QueueStatus::invalid;
  }
  const auto frames = input.size() / 4;
  if (frames > capacity_frames - stats_.queued_frames) {
    add(stats_.dropped_packets, 1);
    add(stats_.dropped_frames, frames);
    return QueueStatus::full;
  }
  const auto tail = (head_ + stats_.queued_frames * 4) % capacity_bytes;
  const auto first = (std::min)(input.size(), capacity_bytes - tail);
  std::copy_n(input.data(), first, bytes_->data() + tail);
  std::copy_n(input.data() + first, input.size() - first, bytes_->data());
  stats_.queued_frames += frames;
  stats_.high_water_frames = (std::max)(stats_.high_water_frames, stats_.queued_frames);
  add(stats_.accepted_frames, frames);
  return QueueStatus::accepted;
}
QueueRead PcmQueue::read(std::span<std::uint8_t> output) noexcept {
  if (!valid(output.size())) {
    add(stats_.invalid_calls, 1);
    return {QueueStatus::invalid};
  }
  const auto requested = output.size() / 4;
  const auto frames = (std::min)(requested, stats_.queued_frames);
  const auto size = frames * 4;
  const auto first = (std::min)(size, capacity_bytes - head_);
  std::copy_n(bytes_->data() + head_, first, output.data());
  std::copy_n(bytes_->data(), size - first, output.data() + first);
  std::fill(output.begin() + static_cast<std::ptrdiff_t>(size), output.end(), 0);
  head_ = (head_ + size) % capacity_bytes;
  stats_.queued_frames -= frames;
  add(stats_.consumed_frames, frames);
  const auto silence = requested - frames;
  add(stats_.silence_frames, silence);
  if (silence)
    add(stats_.underflows, 1);
  const bool discontinuity = frames != 0 && discontinuity_;
  if (frames)
    discontinuity_ = false;
  return {QueueStatus::accepted, frames, silence, discontinuity};
}
std::size_t PcmQueue::discard(std::size_t frames) noexcept {
  if (frames > capacity_frames) {
    add(stats_.invalid_calls, 1);
    return 0;
  }
  const auto skipped = (std::min)(frames, stats_.queued_frames);
  head_ = (head_ + skipped * 4) % capacity_bytes;
  stats_.queued_frames -= skipped;
  add(stats_.playback_skipped_frames, skipped);
  if (skipped)
    discontinuity_ = true;
  return skipped;
}
void PcmQueue::reset() noexcept {
  add(stats_.reset_discarded_frames, stats_.queued_frames);
  stats_.queued_frames = 0;
  head_ = 0;
  bytes_->fill(0);
  discontinuity_ = true;
}
std::size_t PcmQueue::discard_unstamped(std::size_t frames) noexcept {
  const bool boundary = discontinuity_;
  const auto skipped = discard(frames);
  discontinuity_ = boundary;
  return skipped;
}
} // namespace bridge::audio
