#pragma once
#include "protocol.hpp"
#include <bitset>
#include <functional>
#include <optional>

namespace bridge::input {
enum class Type : std::uint8_t {
  key = 1,
  move = 2,
  button = 3,
  wheel = 4,
  reset = 5,
  sync = 6,
  text = 7,
  unicode = 8 // Internal events, never accepted in the legacy INPUT record.
};
constexpr std::size_t max_text_units = 256;
struct Event {
  Type type;
  std::uint8_t flags{};
  std::uint16_t a{}, b{}, c{};
  std::array<std::uint16_t, max_text_units> text{};
};
Event decode(std::span<const std::uint8_t> payload);
Event decode_text(std::span<const std::uint8_t> payload);
// Owned exclusively by the RDP thread. A failed send preserves the pressed state for cleanup.
class State {
  std::bitset<512> keys_;
  std::bitset<5> buttons_;
  std::uint16_t x_{}, y_{};
  std::optional<std::uint16_t> unicode_pressed_;

public:
  using Sink = std::function<bool(const Event &)>;
  bool apply(Event event, const Sink &send, std::uint16_t width, std::uint16_t height);
  bool release(const Sink &send);
};
// Explicit control reset also clears standard server buttons that a preceding
// lost client may have left held outside this owner's local pressed state.
bool initialize_pointer(const State::Sink &send, std::uint16_t x = 0, std::uint16_t y = 0);
} // namespace bridge::input
