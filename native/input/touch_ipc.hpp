#pragma once
#include "protocol.hpp"
#include "touch.hpp"

namespace bridge::touch {
constexpr std::size_t ipc_event_bytes = 16;
// Stateless validation only. Dispatch still requires current lease, negotiated
// contact readiness and display-generation ownership; no API success is implied.
Event decode_ipc(std::span<const std::uint8_t> payload);
} // namespace bridge::touch
