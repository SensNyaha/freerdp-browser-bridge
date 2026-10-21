#pragma once
#include "../compat/span.hpp"
#include "clipboard.hpp"
#include "protocol.hpp"
#include <optional>

namespace bridge::ipc {
enum class EnqueueStatus { accepted, full, invalid };
enum class OutputAudioCodec { pcm, opus };
struct OutputStats {
  std::size_t records = 0, bytes = 0, high_water_bytes = 0;
  std::uint64_t replaced_audio = 0, replaced_cursor = 0, discarded_audio = 0;
};
// Pure scheduling/storage foundation. Callers must serialize push/take/stats.
// No pipe writes, waits or worker activation. One consumer preserves take order.
class OutputQueue {
public:
  static constexpr std::size_t control_capacity = 64;
  static constexpr std::size_t max_records = control_capacity + 7;
  OutputQueue() = default;
  explicit OutputQueue(OutputAudioCodec codec);
  // One startup choice, before the first accepted audio record. Never resets storage.
  bool select_audio_codec(OutputAudioCodec codec) noexcept;
  EnqueueStatus push(Kind, std::uint64_t request_id, ::bridge::compat::span<const std::uint8_t>);
  std::optional<Packet> take();
  void discard_audio() noexcept;
  void discard_all() noexcept;
  OutputStats stats() const noexcept;

private:
  OutputAudioCodec audio_codec_ = OutputAudioCodec::pcm;
  bool audio_locked_ = false;
  std::array<std::optional<Packet>, control_capacity> control_{};
  std::size_t head_ = 0, count_ = 0;
  std::optional<Packet> audio_config_, audio_pcm_, cursor_shape_, cursor_meta_, video_;
  std::optional<Packet> clipboard_state_, clipboard_result_;
  std::optional<clipboard::State> clipboard_observed_;
  std::uint64_t audio_epoch_ = 0, audio_pts_ = 0, cursor_revision_ = 0, cursor_id_ = 0;
  std::uint16_t cursor_width_ = 0, cursor_height_ = 0, cursor_hot_x_ = 0, cursor_hot_y_ = 0;
  bool audio_observed_ = false, first_audio_ = true;
  OutputStats stats_;
  void refresh() noexcept;
};
} // namespace bridge::ipc
