#pragma once
#include "audio.hpp"

namespace bridge::ipc::microphone {
constexpr auto packet_bytes = audio::packet_bytes;
constexpr std::size_t result_bytes = 4;
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
} // namespace bridge::ipc::microphone
