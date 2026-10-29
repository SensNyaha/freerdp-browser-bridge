#include "../compat/span.hpp"
#include "output_queue.hpp"
#include "audio.hpp"
#include "audio_reset.hpp"
#include "cursor.hpp"
#include "files.hpp"
#include "microphone.hpp"
#include "opus_audio.hpp"
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
  case Kind::audio_state:
  case Kind::audio_reset_result:
  case Kind::microphone_result:
  case Kind::microphone_state:
  case Kind::microphone_reset_result:
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
CursorInfo cursor_info(::bridge::compat::span<const std::uint8_t> bytes) {
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
OutputQueue::OutputQueue(OutputAudioCodec codec) : audio_codec_(codec), audio_locked_(true) {
  if (codec != OutputAudioCodec::pcm && codec != OutputAudioCodec::opus)
    throw ProtocolError();
}
bool OutputQueue::select_audio_codec(OutputAudioCodec codec) noexcept {
  if (audio_locked_ || (codec != OutputAudioCodec::pcm && codec != OutputAudioCodec::opus))
    return false;
  audio_codec_ = codec;
  audio_locked_ = true;
  return true;
}
EnqueueStatus OutputQueue::push(Kind kind, std::uint64_t request_id,
                                ::bridge::compat::span<const std::uint8_t> bytes) {
  // Validate the envelope and typed media before constructing owned storage.
  if (bytes.size() > (std::numeric_limits<std::uint32_t>::max)())
    return EnqueueStatus::invalid;
  try {
    validate_header({kind, request_id, static_cast<std::uint32_t>(bytes.size())});
    if (kind == Kind::audio_reset_result)
      (void)audio::decode_reset_result(bytes);
    if (kind == Kind::microphone_result)
      (void)microphone::decode_result(bytes);
    if (kind == Kind::microphone_state)
      (void)microphone::decode_state(bytes);
    if (kind == Kind::microphone_reset_result)
      (void)microphone::decode_reset_result(bytes);
    if (kind == Kind::audio_state) {
      if (audio_codec_ == OutputAudioCodec::opus)
        (void)audio::opus::decode_state(bytes);
      else
        (void)audio::decode_state(bytes);
      if (request_id)
        return EnqueueStatus::invalid;
    }
    if (is_control(kind)) {
      if (count_ == control_capacity)
        return EnqueueStatus::full;
      Packet packet{kind, request_id, {bytes.begin(), bytes.end()}};
      control_[(head_ + count_) % control_capacity] = std::move(packet);
      ++count_;
    } else if (kind == Kind::file_result) {
      (void)files::decode(bytes, true);
      if (file_result_) return EnqueueStatus::full;
      file_result_ = Packet{kind, request_id, {bytes.begin(), bytes.end()}};
    } else if (kind == Kind::clipboard_state) {
      const auto state = clipboard::decode_state(bytes);
      if (clipboard_observed_ && (state.generation != clipboard_observed_->generation ||
                                  state.revision < clipboard_observed_->revision ||
                                  state.maximum != clipboard_observed_->maximum ||
                                  state.to_server != clipboard_observed_->to_server ||
                                  state.from_server != clipboard_observed_->from_server))
        return EnqueueStatus::invalid;
      clipboard_state_ = Packet{kind, 0, {bytes.begin(), bytes.end()}};
      clipboard_observed_ = state;
    } else if (kind == Kind::clipboard_result) {
      (void)clipboard::decode_result(bytes);
      if (clipboard_result_)
        return EnqueueStatus::full;
      clipboard_result_ = Packet{kind, request_id, {bytes.begin(), bytes.end()}};
    } else if (kind == Kind::frame || kind == Kind::frame_avc) {
      if (video_)
        return EnqueueStatus::full; // Correlated captures must not be silently replaced.
      video_ = Packet{kind, request_id, {bytes.begin(), bytes.end()}};
    } else if (kind == Kind::audio_config) {
      const auto epoch = audio_codec_ == OutputAudioCodec::opus
                             ? audio::opus::decode_config(bytes).epoch
                             : audio::decode_config(bytes).epoch;
      if (request_id || epoch <= audio_epoch_)
        return EnqueueStatus::invalid;
      Packet packet{kind, 0, {bytes.begin(), bytes.end()}};
      if (audio_pcm_)
        increment(stats_.discarded_audio);
      audio_pcm_.reset();
      audio_config_ = std::move(packet);
      audio_epoch_ = epoch;
      first_audio_ = true;
    } else if (kind == Kind::audio_pcm || kind == Kind::audio_opus) {
      const bool opus = audio_codec_ == OutputAudioCodec::opus;
      if (kind != (opus ? Kind::audio_opus : Kind::audio_pcm))
        return EnqueueStatus::invalid;
      std::uint64_t epoch, timestamp;
      bool discontinuity;
      if (opus) {
        const auto packet = audio::opus::decode_packet(bytes);
        epoch = packet.epoch;
        timestamp = packet.timestamp_us;
        discontinuity = packet.discontinuity;
      } else {
        const auto packet = audio::decode_packet(bytes);
        epoch = packet.epoch;
        timestamp = packet.timestamp_us;
        discontinuity = packet.discontinuity;
      }
      if (request_id || epoch != audio_epoch_ || (first_audio_ && !discontinuity) ||
          (audio_observed_ && (timestamp <= audio_pts_ ||
                               (!discontinuity && timestamp - audio_pts_ != audio::interval_us))))
        return EnqueueStatus::invalid;
      // Compressed prediction cannot be repaired by rewriting its metadata.
      // Preserve one accepted packet; publisher retains/replaces its retry and
      // resets prediction before a fresh discontinuous capture is encoded.
      if (opus && audio_pcm_)
        return EnqueueStatus::full;
      Packet packet{kind, 0, {bytes.begin(), bytes.end()}};
      if (audio_pcm_) {
        packet.payload[1] = 2;
        increment(stats_.replaced_audio);
      }
      audio_pcm_ = std::move(packet);
      audio_pts_ = timestamp;
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
  if (kind == Kind::audio_state || kind == Kind::audio_config || kind == Kind::audio_pcm ||
      kind == Kind::audio_opus)
    audio_locked_ = true;
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
    for (auto *slot : {&clipboard_state_, &audio_config_, &audio_pcm_, &clipboard_result_,
                       &file_result_, &cursor_shape_, &cursor_meta_, &video_}) {
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
  clipboard_state_.reset();
  clipboard_result_.reset();
  if (file_result_) {
    volatile std::uint8_t *data = file_result_->payload.data();
    for (std::size_t i = 0; i < file_result_->payload.size(); ++i) data[i] = 0;
  }
  file_result_.reset();
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
  for (const auto *slot : {&clipboard_state_, &audio_config_, &audio_pcm_, &clipboard_result_,
                           &file_result_, &cursor_shape_, &cursor_meta_, &video_})
    add(*slot);
  if (stats_.bytes > stats_.high_water_bytes)
    stats_.high_water_bytes = stats_.bytes;
}
OutputStats OutputQueue::stats() const noexcept { return stats_; }
} // namespace bridge::ipc
