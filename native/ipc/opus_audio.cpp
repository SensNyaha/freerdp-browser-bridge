#include "../compat/span.hpp"
#include "opus_audio.hpp"
#include <algorithm>
#include <limits>

namespace bridge::ipc::audio::opus {
namespace {
void put(::bridge::compat::span<std::uint8_t> bytes, std::size_t at, std::uint64_t value, std::size_t count) {
  for (std::size_t i = 0; i < count; ++i)
    bytes[at + i] = static_cast<std::uint8_t>(value >> ((count - i - 1) * 8));
}
void validate(Config config) {
  if (!config.epoch || config.lookahead_frames > packet_frames)
    throw ProtocolError();
}
void validate(const Packet &packet) {
  if (!packet.epoch ||
      packet.timestamp_us > std::numeric_limits<std::uint64_t>::max() - interval_us ||
      packet.frames > packet_frames || packet.silence_frames > packet_frames ||
      static_cast<unsigned>(packet.frames) + packet.silence_frames != packet_frames)
    throw ProtocolError();
  validate_payload(packet.encoded);
}
} // namespace
void validate_payload(::bridge::compat::span<const std::uint8_t> bytes) {
  if (bytes.size() < min_payload_bytes || bytes.size() > max_payload_bytes)
    throw ProtocolError();
  const auto toc = bytes[0];
  if ((toc & 7) != 4) // Stereo, frame-count code 0.
    throw ProtocolError();
  const auto config = toc >> 3;
  switch (config) {
  case 1:
  case 5:
  case 9:
  case 13:
  case 15:
  case 19:
  case 23:
  case 27:
  case 31:
    return; // RFC 6716 table 2: single 20 ms frame in each bandwidth/mode.
  default:
    throw ProtocolError();
  }
}
Config decode_config(::bridge::compat::span<const std::uint8_t> bytes) {
  if (bytes.size() != config_bytes || bytes[0] != 1 || bytes[1] != 1 || bytes[2] != 2 ||
      bytes[3] != 0 || read_be(bytes.subspan(4, 4)) != 48000 ||
      read_be(bytes.subspan(8, 2)) != packet_frames)
    throw ProtocolError();
  const Config result{read_be(bytes.subspan(12, 8)),
                      static_cast<std::uint16_t>(read_be(bytes.subspan(10, 2)))};
  validate(result);
  return result;
}
std::array<std::uint8_t, config_bytes> encode_config(Config config) {
  validate(config);
  std::array<std::uint8_t, config_bytes> bytes{1, 1, 2, 0};
  put(bytes, 4, 48000, 4);
  put(bytes, 8, packet_frames, 2);
  put(bytes, 10, config.lookahead_frames, 2);
  put(bytes, 12, config.epoch, 8);
  return bytes;
}
Packet decode_packet(::bridge::compat::span<const std::uint8_t> bytes) {
  if (bytes.size() < min_packet_bytes || bytes.size() > max_packet_bytes || bytes[0] != 1 ||
      (bytes[1] != 0 && bytes[1] != 2) || read_be(bytes.subspan(6, 2)) != 0)
    throw ProtocolError();
  const Packet result{read_be(bytes.subspan(8, 8)),
                      read_be(bytes.subspan(16, 8)),
                      static_cast<std::uint16_t>(read_be(bytes.subspan(2, 2))),
                      static_cast<std::uint16_t>(read_be(bytes.subspan(4, 2))),
                      bytes[1] == 2,
                      bytes.subspan(metadata_bytes)};
  validate(result);
  return result;
}
EncodedPacket encode_packet(const Packet &packet) {
  validate(packet); // Before constructing/writing output storage.
  EncodedPacket output{{}, metadata_bytes + packet.encoded.size()};
  auto &bytes = output.storage;
  bytes[0] = 1;
  bytes[1] = packet.discontinuity ? 2 : 0;
  put(bytes, 2, packet.frames, 2);
  put(bytes, 4, packet.silence_frames, 2);
  put(bytes, 8, packet.epoch, 8);
  put(bytes, 16, packet.timestamp_us, 8);
  std::copy(packet.encoded.begin(), packet.encoded.end(), bytes.begin() + metadata_bytes);
  return output;
}
State decode_state(::bridge::compat::span<const std::uint8_t> bytes) {
  if (bytes.size() != state_bytes || bytes[2] > 1 || bytes[28] != (bytes[2] ? 1 : 0) ||
      bytes[30] != 0)
    throw ProtocolError();
  // Reuse the common source-clock/availability grammar through bounded metadata
  // translation. No sample copy or incoming-buffer mutation.
  std::array<std::uint8_t, state_bytes> normalized{};
  std::copy(bytes.begin(), bytes.end(), normalized.begin());
  if (bytes[2]) {
    normalized[28] = 2;
    normalized[30] = 1;
  }
  return audio::decode_state(normalized);
}
std::array<std::uint8_t, state_bytes> encode_state(const State &state) {
  auto bytes = audio::encode_state(state); // Validates common semantics first.
  if (state.enabled) {
    bytes[28] = 1;
    bytes[30] = 0;
  }
  return bytes;
}
} // namespace bridge::ipc::audio::opus
