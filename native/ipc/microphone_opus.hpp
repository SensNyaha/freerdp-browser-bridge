#pragma once
#include "../compat/span.hpp"
#include "opus_audio.hpp"

namespace bridge::ipc::microphone::opus {
constexpr std::size_t min_packet_bytes = audio::opus::min_packet_bytes;
constexpr std::size_t max_packet_bytes = audio::opus::max_packet_bytes;
struct Packet {
  std::uint64_t epoch, timestamp_us;
  std::uint16_t lookahead_frames;
  bool discontinuity;
  ::bridge::compat::span<const std::uint8_t> encoded;
};
using EncodedPacket = audio::opus::EncodedPacket;
// Standalone prepared payload, not an assigned RWI1 kind or active worker path.
Packet decode_packet(::bridge::compat::span<const std::uint8_t>);
EncodedPacket encode_packet(const Packet &);
} // namespace bridge::ipc::microphone::opus
