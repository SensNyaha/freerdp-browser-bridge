#include "../compat/span.hpp"
#include "audio_reset.hpp"

namespace bridge::ipc::audio {
std::uint64_t decode_reset(::bridge::compat::span<const std::uint8_t> bytes) {
  if (bytes.size() != reset_request_bytes || bytes[0] != 1 || bytes[1] || bytes[2] || bytes[3])
    throw ProtocolError();
  const auto epoch = read_be(bytes.subspan(4, 8));
  if (!epoch)
    throw ProtocolError();
  return epoch;
}
std::array<std::uint8_t, reset_request_bytes> encode_reset(std::uint64_t epoch) {
  if (!epoch)
    throw ProtocolError();
  std::array<std::uint8_t, reset_request_bytes> bytes{1};
  for (std::size_t i = 0; i < 8; ++i)
    bytes[4 + i] = static_cast<std::uint8_t>(epoch >> (56 - i * 8));
  return bytes;
}
ResetResult decode_reset_result(::bridge::compat::span<const std::uint8_t> bytes) {
  if (bytes.size() != reset_result_bytes || bytes[0] != 1 || bytes[1] > 3 || bytes[2] || bytes[3])
    throw ProtocolError();
  return static_cast<ResetResult>(bytes[1]);
}
std::array<std::uint8_t, reset_result_bytes> encode_reset_result(ResetResult result) {
  const auto code = static_cast<std::uint8_t>(result);
  if (code > 3)
    throw ProtocolError();
  return {1, code, 0, 0};
}
} // namespace bridge::ipc::audio
