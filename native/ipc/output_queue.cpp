#include "output_queue.hpp"
#include "audio.hpp"
#include "cursor.hpp"
#include <limits>

namespace bridge::ipc {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
bool is_control(Kind kind) noexcept {
  switch (kind) {
  case Kind::hello_ack:
  case Kind::heartbeat_ack:
  case Kind::shutdown_ack:
  case Kind::error:
  case Kind::configure_ack:
  case Kind::secret_ack:
  case Kind::connect_ack:
  case Kind::state:
  case Kind::certificate:
  case Kind::certificate_decision_ack:
  case Kind::input_ack:
  case Kind::pipeline_stats_ack:
  case Kind::display_update:
  case Kind::display_resize_result:
  case Kind::touch_update:
    return true;
  default:
    return false;
  }
}
struct CursorInfo {
  std::uint64_t revision, id;
  std::uint16_t width, height, hot_x, hot_y;
  bool shape;
};
CursorInfo cursor_info(std::span<const std::uint8_t> bytes) {
  const auto flags = read_be(bytes.subspan(2, 2));
  CursorInfo info{read_be(bytes.subspan(4, 8)),
                  read_be(bytes.subspan(12, 8)),
                  static_cast<std::uint16_t>(read_be(bytes.subspan(32, 2))),
                  static_cast<std::uint16_t>(read_be(bytes.subspan(34, 2))),
                  static_cast<std::uint16_t>(read_be(bytes.subspan(36, 2))),
                  static_cast<std::uint16_t>(read_be(bytes.subspan(38, 2))),
                  (flags & 8) != 0};
  if (read_be(bytes.first(2)) != 1 || flags > 15 || !info.revision ||
      ((flags & 2) != 0) != (info.id == 0))
    throw ProtocolError();
  if (info.id == 0) {
    if (info.shape || info.width || info.height || info.hot_x || info.hot_y)
      throw ProtocolError();
  } else if (!info.width || !info.height || info.width > cursor::max_dimension ||
             info.height > cursor::max_dimension || info.hot_x >= info.width ||
             info.hot_y >= info.height) {
    throw ProtocolError();
  }
  const auto expected = cursor::metadata_bytes +
                        (info.shape ? static_cast<std::size_t>(info.width) * info.height * 4 : 0);
  if (bytes.size() != expected)
    throw ProtocolError();
  return info;
}
} // namespace
EnqueueStatus OutputQueue::push(Kind kind, std::uint64_t request_id,
                                std::span<const std::uint8_t> bytes) {
  // Validate the envelope and typed media before constructing owned storage.
  if (bytes.size() > (std::numeric_limits<std::uint32_t>::max)())
    return EnqueueStatus::invalid;
  try {
    validate_header({kind, request_id, static_cast<std::uint32_t>(bytes.size())});
    if (is_control(kind)) {
      if (count_ == control_capacity)
        return EnqueueStatus::full;
      Packet packet{kind, request_id, {bytes.begin(), bytes.end()}};
      control_[(head_ + count_) % control_capacity] = std::move(packet);
      ++count_;
    } else if (kind == Kind::frame || kind == Kind::frame_avc) {
      if (video_)
        return EnqueueStatus::full; // Correlated captures must not be silently replaced.
      video_ = Packet{kind, request_id, {bytes.begin(), bytes.end()}};
    } else if (kind == Kind::audio_config) {
      const auto config = audio::decode_config(bytes);
      if (request_id || config.epoch <= audio_epoch_)
        return EnqueueStatus::invalid;
      Packet packet{kind, 0, {bytes.begin(), bytes.end()}};
      if (audio_pcm_)
        increment(stats_.discarded_audio);
      audio_pcm_.reset();
      audio_config_ = std::move(packet);
      audio_epoch_ = config.epoch;
      first_audio_ = true;
    } else if (kind == Kind::audio_pcm) {
      const auto pcm = audio::decode_packet(bytes);
      if (request_id || pcm.epoch != audio_epoch_ || (first_audio_ && !pcm.discontinuity) ||
          (audio_observed_ &&
           (pcm.timestamp_us <= audio_pts_ ||
            (!pcm.discontinuity && pcm.timestamp_us - audio_pts_ != audio::interval_us))))
        return EnqueueStatus::invalid;
      Packet packet{kind, 0, {bytes.begin(), bytes.end()}};
      if (audio_pcm_) {
        packet.payload[1] = 2;
        increment(stats_.replaced_audio);
      }
      audio_pcm_ = std::move(packet);
      audio_pts_ = pcm.timestamp_us;
      audio_observed_ = true;
      first_audio_ = false;
    } else if (kind == Kind::cursor_update) {
      const auto info = cursor_info(bytes);
      if (request_id || info.revision <= cursor_revision_ ||
          (!info.shape && info.id != 0 &&
           (info.id != cursor_id_ || info.width != cursor_width_ || info.height != cursor_height_ ||
            info.hot_x != cursor_hot_x_ || info.hot_y != cursor_hot_y_)))
        return EnqueueStatus::invalid;
      Packet packet{kind, 0, {bytes.begin(), bytes.end()}};
      if (info.shape || info.id == 0) {
        if (cursor_shape_ || cursor_meta_)
          increment(stats_.replaced_cursor);
        cursor_shape_.reset();
        cursor_meta_.reset();
        if (info.shape)
          cursor_shape_ = std::move(packet);
        else
          cursor_meta_ = std::move(packet);
      } else {
        if (cursor_meta_)
          increment(stats_.replaced_cursor);
        cursor_meta_ = std::move(packet);
      }
      cursor_revision_ = info.revision;
      cursor_id_ = info.id;
      cursor_width_ = info.width;
      cursor_height_ = info.height;
      cursor_hot_x_ = info.hot_x;
      cursor_hot_y_ = info.hot_y;
    } else {
      return EnqueueStatus::invalid; // Never retain requests or secret/config payloads.
    }
  } catch (const ProtocolError &) {
    return EnqueueStatus::invalid;
  }
  refresh();
  return EnqueueStatus::accepted;
}
std::optional<Packet> OutputQueue::take() {
  std::optional<Packet> result;
  if (count_) {
    result = std::move(control_[head_]);
    control_[head_].reset();
    head_ = (head_ + 1) % control_capacity;
    --count_;
  } else {
    for (auto *slot : {&audio_config_, &audio_pcm_, &cursor_shape_, &cursor_meta_, &video_}) {
      if (*slot) {
        result = std::move(*slot);
        slot->reset();
        break;
      }
    }
  }
  refresh();
  return result;
}
void OutputQueue::discard_audio() noexcept {
  if (audio_pcm_)
    increment(stats_.discarded_audio);
  audio_pcm_.reset();
  audio_config_.reset();
  first_audio_ = true;
  refresh();
}
void OutputQueue::discard_all() noexcept {
  discard_audio();
  for (auto &slot : control_)
    slot.reset();
  head_ = count_ = 0;
  cursor_shape_.reset();
  cursor_meta_.reset();
  video_.reset();
  refresh();
}
void OutputQueue::refresh() noexcept {
  stats_.records = 0;
  stats_.bytes = 0;
  const auto add = [this](const std::optional<Packet> &slot) {
    if (slot) {
      ++stats_.records;
      stats_.bytes += header_bytes + slot->payload.size();
    }
  };
  for (const auto &slot : control_)
    add(slot);
  for (const auto *slot : {&audio_config_, &audio_pcm_, &cursor_shape_, &cursor_meta_, &video_})
    add(*slot);
  if (stats_.bytes > stats_.high_water_bytes)
    stats_.high_water_bytes = stats_.bytes;
}
OutputStats OutputQueue::stats() const noexcept { return stats_; }
} // namespace bridge::ipc
