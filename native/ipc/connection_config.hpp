#pragma once
#include "protocol.hpp"
#include <string>

namespace bridge::ipc {
struct ConnectionConfig {
  std::string host, username, domain;
  std::uint16_t port, width, height, color_depth;
  std::uint8_t security, certificate_policy, minimum_tls;
  std::uint32_t connect_ms, tcp_ack_ms;
};
ConnectionConfig decode_connection_config(std::span<const std::uint8_t> bytes);
void validate_secret(std::span<const std::uint8_t> bytes);
void wipe(std::span<std::uint8_t> bytes) noexcept;
} // namespace bridge::ipc
