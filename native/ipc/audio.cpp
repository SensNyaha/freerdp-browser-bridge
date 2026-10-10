#include "audio.hpp"
#include <algorithm>
#include <limits>

namespace bridge::ipc::audio {
namespace {
void put(std::span<std::uint8_t> bytes, std::size_t at, std::uint64_t value, std::size_t count) {
  for (std::size_t i = 0; i < count; ++i)
    bytes[at + i] = static_cast<std::uint8_t>(value >> ((count - i - 1) * 8));
}
void validate(const PcmPacket &packet) {
  if (packet.epoch == 0 ||
      packet.timestamp_us > (std::numeric_limits<std::uint64_t>::max)() - interval_us ||
      packet.frames > packet_frames || packet.silence_frames > packet_frames ||
      static_cast<unsigned>(packet.frames) + packet.silence_frames != packet_frames ||
      packet.pcm.size() != pcm_bytes)
    throw ProtocolError();
  const auto tail = packet.pcm.subspan(static_cast<std::size_t>(packet.frames) * 4);
  if (!std::all_of(tail.begin(), tail.end(), [](auto byte) { return byte == 0; }))
    throw ProtocolError();
}
} // namespace
Config decode_config(std::span<const std::uint8_t> bytes) {
  if (bytes.size() != config_bytes || bytes[0] != 1 || bytes[1] != 2 || bytes[2] != 2 ||
      bytes[3] != 1 || read_be(bytes.subspan(4, 4)) != 48000 ||
      read_be(bytes.subspan(8, 2)) != packet_frames || read_be(bytes.subspan(10, 2)) != 0)
    throw ProtocolError();
  const auto epoch = read_be(bytes.subspan(12, 8));
  if (!epoch)
    throw ProtocolError();
  return {epoch};
}
std::array<std::uint8_t, config_bytes> encode_config(Config config) {
  if (!config.epoch)
    throw ProtocolError();
  std::array<std::uint8_t, config_bytes> bytes{1, 2, 2, 1};
  put(bytes, 4, 48000, 4);
  put(bytes, 8, packet_frames, 2);
  put(bytes, 12, config.epoch, 8);
  return bytes;
}
PcmPacket decode_packet(std::span<const std::uint8_t> bytes) {
  if (bytes.size() != packet_bytes || bytes[0] != 1 || (bytes[1] != 0 && bytes[1] != 2) ||
      read_be(bytes.subspan(6, 2)) != 0)
    throw ProtocolError();
  PcmPacket packet{read_be(bytes.subspan(8, 8)),
                   read_be(bytes.subspan(16, 8)),
                   static_cast<std::uint16_t>(read_be(bytes.subspan(2, 2))),
                   static_cast<std::uint16_t>(read_be(bytes.subspan(4, 2))),
                   bytes[1] == 2,
                   bytes.subspan(metadata_bytes)};
  validate(packet);
  return packet;
}
std::array<std::uint8_t, packet_bytes> encode_packet(const PcmPacket &packet) {
  validate(packet); // Before writing or allocating transport storage.
  std::array<std::uint8_t, packet_bytes> bytes{};
  bytes[0] = 1;
  bytes[1] = packet.discontinuity ? 2 : 0;
  put(bytes, 2, packet.frames, 2);
  put(bytes, 4, packet.silence_frames, 2);
  put(bytes, 8, packet.epoch, 8);
  put(bytes, 16, packet.timestamp_us, 8);
  std::copy(packet.pcm.begin(), packet.pcm.end(), bytes.begin() + metadata_bytes);
  return bytes;
}
} // namespace bridge::ipc::audio
