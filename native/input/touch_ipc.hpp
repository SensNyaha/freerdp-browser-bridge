#pragma once
#include "protocol.hpp"
#include "touch.hpp"

namespace bridge::touch {
constexpr std::size_t ipc_event_bytes = 16;
// Stateless validation only. Dispatch still requires current lease, negotiated
// contact readiness and display-generation ownership; no API success is implied.
Event decode_ipc(std::span<const std::uint8_t> payload);
struct Request {
  Event event;
  std::uint64_t generation;
};
Request decode_request(std::span<const std::uint8_t> payload);
enum class Availability : std::uint16_t {
  unavailable,
  ready,
  suspended,
  draining,
  handshake,
  incompatible
};
struct Update {
  std::uint64_t revision, generation;
  std::uint16_t width, height, contacts;
  bool enabled;
  Availability availability;
  bool operator==(const Update &) const = default;
};
std::vector<std::uint8_t> encode_update(const Update &);
} // namespace bridge::touch
