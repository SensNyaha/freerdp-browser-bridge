#pragma once
#include "../compat/span.hpp"
#include "protocol.hpp"
#include <string>

namespace bridge::ipc {
constexpr bool valid_ip_settings(std::uint8_t mask, std::uint8_t prefer, std::uint8_t force) {
  return mask <= 3U && prefer <= 1U && (force == 0 || force == 4 || force == 6) &&
         ((mask & 1U) || prefer == 0) && ((mask & 2U) || force == 0);
}
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
  bool clipboard_html = false;
  std::uint32_t clipboard_maximum = 0;
  std::uint8_t performance_mask = 0, performance_values = 0;
  std::uint8_t ip_mask = 0, prefer_ipv6 = 0, force_ip_version = 0;
};
ConnectionConfig decode_connection_config(::bridge::compat::span<const std::uint8_t> bytes);
void validate_secret(::bridge::compat::span<const std::uint8_t> bytes);
void wipe(::bridge::compat::span<std::uint8_t> bytes) noexcept;
} // namespace bridge::ipc
