#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <span>
#include <stdexcept>
#include <vector>

namespace bridge::ipc {
constexpr std::size_t header_bytes = 24;
constexpr std::uint16_t version = 1;
enum class Kind : std::uint16_t {
  hello = 1,
  hello_ack = 2,
  heartbeat = 3,
  heartbeat_ack = 4,
  shutdown = 5,
  shutdown_ack = 6,
  error = 7,
  configure = 8,
  configure_ack = 9,
  secret = 10,
  secret_ack = 11,
  connect = 12,
  connect_ack = 13,
  state = 14,
  certificate = 15,
  certificate_decision = 16,
  certificate_decision_ack = 17,
  capture = 18,
  frame = 19,
  capture_avc = 20,
  frame_avc = 21,
  input = 22,
  input_ack = 23,
  pipeline_stats = 24,
  pipeline_stats_ack = 25,
  cursor_update = 26,
  display_update = 27,
  display_resize = 28,
  display_resize_result = 29,
  input_text = 30,
  input_touch = 31,
  touch_update = 32,
  audio_config = 33,
  audio_pcm = 34,
  audio_state = 35,
  audio_opus = 36, // Experimental private Windows profile; public media remains gated.
  audio_reset = 37,
  audio_reset_result = 38,
  microphone_pcm = 39, // Experimental private PCM input.
  microphone_result = 40,
  microphone_state = 41,
  microphone_reset = 42,
  microphone_reset_result = 43,
  microphone_opus = 44,
  clipboard_state = 45,
  clipboard_command = 46,
  clipboard_result = 47
};
constexpr std::size_t max_jpeg_bytes = 8 * 1024 * 1024;
constexpr std::size_t frame_metadata_bytes = 24;
constexpr std::size_t avc_metadata_bytes = 28;
constexpr std::size_t max_avc_config_bytes = 2059;
struct Header {
  Kind kind;
  std::uint64_t request_id;
  std::uint32_t length;
};
struct Packet {
  Kind kind;
  std::uint64_t request_id;
  std::vector<std::uint8_t> payload;
};
class ProtocolError final : public std::runtime_error {
public:
  ProtocolError() : std::runtime_error("Invalid worker IPC record") {}
};
std::uint64_t read_be(std::span<const std::uint8_t> bytes);
void append_be(std::vector<std::uint8_t> &bytes, std::uint64_t value, std::size_t count);
Header decode_header(std::span<const std::uint8_t> bytes);
void validate_header(const Header &header);
std::array<std::uint8_t, header_bytes> encode_header(const Header &header);
void validate_hello(std::span<const std::uint8_t> payload);
std::vector<std::uint8_t> encode(const Packet &packet);
} // namespace bridge::ipc
