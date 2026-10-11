#include "microphone.hpp"

namespace bridge::ipc::microphone {
PcmPacket decode_pcm(std::span<const std::uint8_t> bytes) {
  const auto packet = audio::decode_packet(bytes);
  if (packet.frames != audio::packet_frames || packet.silence_frames)
    throw ProtocolError();
  return {packet.epoch, packet.timestamp_us, packet.discontinuity, packet.pcm};
}
std::array<std::uint8_t, packet_bytes> encode_pcm(const PcmPacket &packet) {
  return audio::encode_packet({packet.epoch, packet.timestamp_us, audio::packet_frames, 0,
                               packet.discontinuity, packet.pcm});
}
Result decode_result(std::span<const std::uint8_t> bytes) {
  if (bytes.size() != result_bytes || bytes[0] != 1 || bytes[1] > 4 || bytes[2] || bytes[3])
    throw ProtocolError();
  return static_cast<Result>(bytes[1]);
}
std::array<std::uint8_t, result_bytes> encode_result(Result result) {
  if (static_cast<unsigned>(result) > 4)
    throw ProtocolError();
  return {1, static_cast<std::uint8_t>(result), 0, 0};
}
} // namespace bridge::ipc::microphone
