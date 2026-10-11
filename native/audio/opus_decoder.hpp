#pragma once
#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>

namespace bridge::audio {
struct OpusDecodePacket {
  std::span<const std::uint8_t> encoded;
  std::uint64_t timestamp_us;
  bool discontinuity = false;
};
struct OpusPcmUnit {
  std::span<const std::uint8_t> pcm;
  std::uint64_t timestamp_us;
  bool discontinuity;
};
// Serialized, isolated microphone decoder. Not selected by worker/wire yet.
// Fixed heap scratch and two SDK states; invalid packets preserve prediction,
// clock, counters and borrowed output. No PLC/FEC, queue, sample trimming or
// automatic packet retry. The caller owns epoch/readiness/admission checks.
class SoftwareOpusDecoder final {
  struct State;
  std::unique_ptr<State> state_;

public:
  static constexpr std::size_t packet_frames = 960, pcm_bytes = packet_frames * 4;
  static constexpr std::size_t min_packet_bytes = 2, max_packet_bytes = 1275;
  static constexpr std::size_t max_sdk_state_bytes = 256 * 1024;
  SoftwareOpusDecoder();
  ~SoftwareOpusDecoder();
  SoftwareOpusDecoder(const SoftwareOpusDecoder &) = delete;
  SoftwareOpusDecoder &operator=(const SoftwareOpusDecoder &) = delete;
  OpusPcmUnit decode(const OpusDecodePacket &);
  void reset();
  std::uint64_t decoded_packets() const noexcept;
  std::size_t sdk_state_bytes() const noexcept;
};
} // namespace bridge::audio
