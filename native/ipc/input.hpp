#pragma once
#include "protocol.hpp"
#include <bitset>
#include <functional>

namespace bridge::input {
enum class Type : std::uint8_t { key = 1, move = 2, button = 3, wheel = 4, reset = 5, sync = 6 };
struct Event {
  Type type;
  std::uint8_t flags{};
  std::uint16_t a{}, b{}, c{};
};
Event decode(std::span<const std::uint8_t> payload);
// Owned exclusively by the RDP thread. A failed send preserves the pressed state for cleanup.
class State {
  std::bitset<512> keys_;
  std::bitset<5> buttons_;
  std::uint16_t x_{}, y_{};

public:
  using Sink = std::function<bool(const Event &)>;
  bool apply(Event event, const Sink &send, std::uint16_t width, std::uint16_t height);
  bool release(const Sink &send);
};
} // namespace bridge::input
