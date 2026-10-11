#pragma once
#include "audio.hpp"
#include "audio_reset.hpp"

namespace bridge::ipc::microphone {
constexpr auto packet_bytes = audio::packet_bytes;
constexpr std::size_t result_bytes = 4;
constexpr auto state_bytes = audio::state_bytes;
using State = audio::State; // Input readiness; normalized browser profile is fixed.
using ResetResult = audio::ResetResult;
constexpr auto reset_request_bytes = audio::reset_request_bytes;
constexpr auto reset_result_bytes = audio::reset_result_bytes;
inline auto decode_reset(std::span<const std::uint8_t> bytes) { return audio::decode_reset(bytes); }
inline auto encode_reset(std::uint64_t epoch) { return audio::encode_reset(epoch); }
inline auto decode_reset_result(std::span<const std::uint8_t> bytes) {
  return audio::decode_reset_result(bytes);
}
inline auto encode_reset_result(ResetResult result) { return audio::encode_reset_result(result); }
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
