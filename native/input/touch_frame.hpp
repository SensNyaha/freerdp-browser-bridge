#pragma once
#include <array>
#include <cstdint>
#include <optional>
#include <span>

namespace bridge::touch {
struct ContactView {
  std::uint8_t id;
  std::int32_t x, y;
  std::uint32_t flags;
  std::span<const std::uint8_t> encoded;
};
struct TouchFrame {
  std::array<ContactView, 64> contacts{};
  std::size_t count = 0;
};
// Pinned single-frame TOUCH profile. Views borrow the input only during the call.
std::optional<TouchFrame> read_touch_frame(std::span<const std::uint8_t>) noexcept;
struct TerminalRecord {
  static constexpr std::size_t capacity = 31;
  std::array<std::uint8_t, capacity> bytes{};
  std::size_t size = 0;
};
struct TerminalPacket {
  std::array<std::uint8_t, 10 + 10 * TerminalRecord::capacity> bytes{};
  std::size_t size = 0;
};
// Re-envelopes only validated native UP records; does not encode DOWN/UPDATE or fields.
std::optional<TerminalPacket> terminal_packet(std::span<const TerminalRecord>) noexcept;
} // namespace bridge::touch
