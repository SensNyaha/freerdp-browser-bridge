#pragma once
#include "../compat/span.hpp"
#include <cstddef>
#include <cstdint>
#include <memory>

namespace bridge::audio {
struct OpusOptions {
  int bitrate = 64000;
};
struct OpusFrame {
  ::bridge::compat::span<const std::uint8_t> pcm; // Interleaved S16LE, 48 kHz stereo, 960 frames.
  std::uint64_t timestamp_us;
  bool discontinuity = false;
};
struct OpusUnit {
  ::bridge::compat::span<const std::uint8_t> bytes;
  std::uint64_t timestamp_us;
  bool discontinuity;
};
// One serialized owner. Fixed heap-backed sample/output scratch; no packet queue.
// Output borrows storage until successful encode/reset/destruction. Invalid input
// preserves prediction and previously borrowed bytes. SDK failure retires state.
// Private publisher provider; public browser media selection remains gated.
class SoftwareOpusEncoder final {
  struct State;
  std::unique_ptr<State> state_;

public:
  static constexpr std::size_t packet_frames = 960;
  static constexpr std::size_t pcm_bytes = packet_frames * 4;
  static constexpr std::size_t max_packet_bytes = 1275;
  explicit SoftwareOpusEncoder(OpusOptions options = {});
  ~SoftwareOpusEncoder();
  SoftwareOpusEncoder(const SoftwareOpusEncoder &) = delete;
  SoftwareOpusEncoder &operator=(const SoftwareOpusEncoder &) = delete;
  OpusUnit encode(const OpusFrame &frame);
  void reset();
  std::uint16_t lookahead_frames() const noexcept;
  std::uint64_t encoded_packets() const noexcept;
};
} // namespace bridge::audio
