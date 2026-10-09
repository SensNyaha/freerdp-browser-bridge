#include "protocol.hpp"
#include "cursor.hpp"
#include "display.hpp"
#include <algorithm>
#include <limits>

namespace bridge::ipc {
std::uint64_t read_be(std::span<const std::uint8_t> bytes) {
  if (bytes.size() > 8)
    throw ProtocolError();
  std::uint64_t result = 0;
  for (const auto byte : bytes)
    result = (result << 8) | byte;
  return result;
}
void append_be(std::vector<std::uint8_t> &bytes, std::uint64_t value, std::size_t count) {
  if (count > 8)
    throw ProtocolError();
  for (std::size_t i = count; i > 0; --i)
    bytes.push_back(static_cast<std::uint8_t>((value >> ((i - 1) * 8)) & 0xff));
}
static std::uint32_t limit(Kind kind) {
  switch (kind) {
  case Kind::hello:
    return 8;
  case Kind::hello_ack:
    return 4096;
  case Kind::heartbeat:
  case Kind::heartbeat_ack:
  case Kind::shutdown:
  case Kind::shutdown_ack:
  case Kind::configure_ack:
  case Kind::secret_ack:
  case Kind::connect:
  case Kind::connect_ack:
  case Kind::certificate_decision_ack:
  case Kind::input_ack:
  case Kind::pipeline_stats:
    return 0;
  case Kind::error:
  case Kind::display_resize:
  case Kind::display_resize_result:
    return 4;
  case Kind::display_update:
    return display_update_bytes;
  case Kind::pipeline_stats_ack:
    return 64;
  case Kind::cursor_update:
    return static_cast<std::uint32_t>(cursor::metadata_bytes + cursor::max_rgba_bytes);
  case Kind::configure:
    return 2048;
  case Kind::secret:
    return 4096;
  case Kind::state:
    return 8;
  case Kind::certificate:
    return 42;
  case Kind::certificate_decision:
    return 41;
  case Kind::capture:
    return 8;
  case Kind::frame:
    return static_cast<std::uint32_t>(max_jpeg_bytes + frame_metadata_bytes);
  case Kind::capture_avc:
  case Kind::input:
    return 12;
  case Kind::input_text:
    return 512;
  case Kind::frame_avc:
    return static_cast<std::uint32_t>(max_jpeg_bytes + avc_metadata_bytes + max_avc_config_bytes);
  }
  throw ProtocolError();
}
Header decode_header(std::span<const std::uint8_t> bytes) {
  constexpr std::array<std::uint8_t, 4> magic{'R', 'W', 'I', '1'};
  if (bytes.size() != header_bytes || !std::equal(magic.begin(), magic.end(), bytes.begin()) ||
      read_be(bytes.subspan(4, 2)) != version || read_be(bytes.subspan(8, 4)) != 0)
    throw ProtocolError();
  const auto kind = static_cast<Kind>(read_be(bytes.subspan(6, 2)));
  const auto length = static_cast<std::uint32_t>(read_be(bytes.subspan(20, 4)));
  const auto maximum = limit(kind);
  const bool variable = kind == Kind::hello_ack || kind == Kind::configure ||
                        kind == Kind::secret || kind == Kind::frame || kind == Kind::frame_avc ||
                        kind == Kind::cursor_update || kind == Kind::input_text;
  if (length > maximum || (!variable && length != maximum) ||
      (kind == Kind::frame && length < frame_metadata_bytes) ||
      (kind == Kind::frame_avc && length < avc_metadata_bytes) ||
      (kind == Kind::cursor_update && length < cursor::metadata_bytes) ||
      (kind == Kind::input_text && (length == 0 || length % 2)))
    throw ProtocolError();
  return {kind, read_be(bytes.subspan(12, 8)), length};
}
std::vector<std::uint8_t> encode(const Packet &packet) {
  if (packet.payload.size() > std::numeric_limits<std::uint32_t>::max())
    throw ProtocolError();
  std::vector<std::uint8_t> bytes{'R', 'W', 'I', '1'};
  append_be(bytes, version, 2);
  append_be(bytes, static_cast<std::uint16_t>(packet.kind), 2);
  append_be(bytes, 0, 4);
  append_be(bytes, packet.request_id, 8);
  append_be(bytes, packet.payload.size(), 4);
  (void)decode_header(bytes);
  bytes.insert(bytes.end(), packet.payload.begin(), packet.payload.end());
  return bytes;
}
void validate_hello(std::span<const std::uint8_t> payload) {
  if (payload.size() != 8 || read_be(payload.subspan(0, 2)) > version ||
      read_be(payload.subspan(2, 2)) < version || read_be(payload.subspan(4, 4)) != 0)
    throw ProtocolError();
}
} // namespace bridge::ipc
