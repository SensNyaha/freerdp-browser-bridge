#pragma once
#include "audio.hpp"

namespace bridge::ipc::microphone {
constexpr auto packet_bytes = audio::packet_bytes;
constexpr std::size_t result_bytes = 4;
constexpr auto state_bytes = audio::state_bytes;
using State = audio::State; // Input readiness; normalized browser profile is fixed.
struct PcmPacket {
  std::uint64_t epoch, timestamp_us;
  bool discontinuity;
  std::span<const std::uint8_t> pcm;
};
enum class Result : std::uint8_t { accepted, stale, unavailable, busy, invalid };
// Preparatory private input: exact 960 captured S16LE 48 kHz stereo frames.
// Reuses schema-1 PCM layout but forbids output silence-accounting metadata.
PcmPacket decode_pcm(std::span<const std::uint8_t>);
std::array<std::uint8_t, packet_bytes> encode_pcm(const PcmPacket &);
Result decode_result(std::span<const std::uint8_t>);
std::array<std::uint8_t, result_bytes> encode_result(Result);
State decode_state(std::span<const std::uint8_t>);
std::array<std::uint8_t, state_bytes> encode_state(const State &);
} // namespace bridge::ipc::microphone
