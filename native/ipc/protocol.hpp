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
  error = 7
};
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
void validate_hello(std::span<const std::uint8_t> payload);
std::vector<std::uint8_t> encode(const Packet &packet);
} // namespace bridge::ipc
