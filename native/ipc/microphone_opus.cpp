#include "../compat/span.hpp"
#include "microphone_opus.hpp"
#include <algorithm>
#include <limits>

namespace bridge::ipc::microphone::opus {
namespace {
void validate(const Packet &packet) {
  if (!packet.epoch ||
      packet.timestamp_us > std::numeric_limits<std::uint64_t>::max() - audio::interval_us ||
      packet.lookahead_frames > audio::packet_frames)
    throw ProtocolError();
  audio::opus::validate_payload(packet.encoded);
}
void put(::bridge::compat::span<std::uint8_t> bytes, std::size_t at, std::uint64_t value, std::size_t count) {
  for (std::size_t i = 0; i < count; ++i)
    bytes[at + i] = static_cast<std::uint8_t>(value >> ((count - i - 1) * 8));
}
} // namespace
Packet decode_packet(::bridge::compat::span<const std::uint8_t> bytes) {
  if (bytes.size() < min_packet_bytes || bytes.size() > max_packet_bytes || bytes[0] != 1 ||
      (bytes[1] != 0 && bytes[1] != 2) || read_be(bytes.subspan(2, 2)) != audio::packet_frames ||
      read_be(bytes.subspan(4, 2)) != 0)
    throw ProtocolError();
  const Packet packet{read_be(bytes.subspan(8, 8)), read_be(bytes.subspan(16, 8)),
                      static_cast<std::uint16_t>(read_be(bytes.subspan(6, 2))), bytes[1] == 2,
                      bytes.subspan(audio::metadata_bytes)};
  validate(packet);
  return packet;
}
EncodedPacket encode_packet(const Packet &packet) {
  validate(packet);
  EncodedPacket output{{}, audio::metadata_bytes + packet.encoded.size()};
  auto &bytes = output.storage;
  bytes[0] = 1;
  bytes[1] = packet.discontinuity ? 2 : 0;
  put(bytes, 2, audio::packet_frames, 2);
  put(bytes, 6, packet.lookahead_frames, 2);
  put(bytes, 8, packet.epoch, 8);
  put(bytes, 16, packet.timestamp_us, 8);
  std::copy(packet.encoded.begin(), packet.encoded.end(), bytes.begin() + audio::metadata_bytes);
  return output;
}
} // namespace bridge::ipc::microphone::opus
