#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <functional>

namespace bridge::touch {
enum class Action : std::uint8_t { begin, update, end, cancel };
struct Event {
  Action action;
  std::uint32_t id, x, y;
  bool operator==(const Event &) const = default;
};
enum class Result { accepted, invalid, full, failed, cleanup_required };
// RDP-thread owned foundation, with no queue, timer, wire format or feature advertisement.
// The caller must establish RDPEI readiness and release contacts before a display change.
// Sinks must not re-enter this state during dispatch or cleanup.
class State {
  struct Slot {
    bool used = false;
    Event event{};
  };
  std::array<Slot, 10> slots_{};
  bool failed_ = false;

public:
  static constexpr std::size_t max_contacts = 10;
  using Sink = std::function<bool(const Event &)>;
  State() = default;
  State(const State &) = delete;
  State &operator=(const State &) = delete;
  Result apply(Event event, const Sink &send, std::uint32_t width, std::uint32_t height) noexcept;
  // Attempts every contact, retaining unsuccessful cancellations for a later cleanup attempt.
  bool release(const Sink &send) noexcept;
  // Only after channel loss/destruction; does not assert that remote releases were delivered.
  void abandon() noexcept;
  std::size_t active() const noexcept;
  bool cleanup_required() const noexcept { return failed_; }
};
bool valid(const Event &event) noexcept;
} // namespace bridge::touch
