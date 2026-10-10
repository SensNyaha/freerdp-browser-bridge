#pragma once
#include "audio.hpp"

namespace bridge::ipc::audio::opus {
constexpr std::size_t min_payload_bytes = 2, max_payload_bytes = 1275;
constexpr std::size_t min_packet_bytes = metadata_bytes + min_payload_bytes;
constexpr std::size_t max_packet_bytes = metadata_bytes + max_payload_bytes;
struct Config {
  std::uint64_t epoch;
  std::uint16_t lookahead_frames;
};
struct Packet {
  std::uint64_t epoch, timestamp_us;
  std::uint16_t frames, silence_frames;
  bool discontinuity;
  std::span<const std::uint8_t> encoded;
};
struct EncodedPacket {
  std::array<std::uint8_t, max_packet_bytes> storage{};
  std::size_t size = 0;
  std::span<const std::uint8_t> bytes() const {
    if (size > storage.size())
      throw ProtocolError();
    return {storage.data(), size};
  }
};
// Restricted bridge profile: exactly one stereo 20 ms Opus frame, no empty DTX.
// Validates framing/duration; entropy decoding remains the SDK's responsibility.
void validate_payload(std::span<const std::uint8_t>);
Config decode_config(std::span<const std::uint8_t>);
std::array<std::uint8_t, config_bytes> encode_config(Config);
Packet decode_packet(std::span<const std::uint8_t>);
EncodedPacket encode_packet(const Packet &);
} // namespace bridge::ipc::audio::opus
