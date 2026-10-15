#pragma once
#include "protocol.hpp"
#include <string>

namespace bridge::ipc {
struct ConnectionConfig {
  std::string host, username, domain;
  std::uint16_t port, width, height, color_depth;
  std::uint8_t security, certificate_policy, minimum_tls;
  std::uint32_t connect_ms, tcp_ack_ms;
  std::uint8_t h264_fps = 30, jpeg_fps = 20, jpeg_quality = 80;
  std::uint32_t target_bitrate = 4000000, max_bitrate = 4000000;
  bool dynamic_resolution = false;
  bool touch = false;
  bool pcm_output = false;
  bool opus_output = false;
  bool pcm_input = false;
  bool opus_input = false;
  bool audio_buffer_200 = false;
  bool clipboard_to_server = false, clipboard_from_server = false;
  std::uint32_t clipboard_maximum = 0;
};
ConnectionConfig decode_connection_config(std::span<const std::uint8_t> bytes);
void validate_secret(std::span<const std::uint8_t> bytes);
void wipe(std::span<std::uint8_t> bytes) noexcept;
} // namespace bridge::ipc
