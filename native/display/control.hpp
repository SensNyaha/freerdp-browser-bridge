#pragma once
#include <chrono>
#include <cstdint>
#include <freerdp/client/disp.h>
#include <freerdp/freerdp.h>
#include <optional>
#include <thread>

namespace bridge::display {
struct Size {
  std::uint32_t width, height;
  bool operator==(const Size &other) const noexcept {
    return width == other.width && height == other.height;
  }
  bool operator!=(const Size &other) const noexcept { return !(*this == other); }
};
struct Capabilities {
  std::uint32_t max_monitors;
  std::uint64_t usable_area;
};
enum class Request { sent, unchanged, unavailable, invalid, busy, send_failed };
// All calls, callbacks and destruction after bind belong to the synchronous RDP thread.
// This adapter does not allocate a framebuffer or change FreeRDP desktop settings.
class Control {
  using Clock = std::chrono::steady_clock;
  struct Pending {
    Size size;
    Clock::time_point deadline;
  };
  DispClientContext *context_ = nullptr;
  std::thread::id thread_;
  std::optional<Capabilities> capabilities_;
  std::optional<Size> actual_;
  std::optional<Pending> pending_;
  bool on_thread() const noexcept;
  static UINT receive_caps(DispClientContext *, UINT32, UINT32, UINT32) noexcept;

public:
  // One even-sized primary monitor, within both currently supported media providers.
  static constexpr std::uint32_t max_width = 3840, max_height = 2160;
  static constexpr std::uint64_t max_area = std::uint64_t{max_width} * max_height;
  static constexpr auto timeout = std::chrono::seconds(5);
  Control() = default;
  Control(const Control &) = delete;
  Control &operator=(const Control &) = delete;
  ~Control();
  bool bind(rdpContext &base, DispClientContext *context) noexcept;
  bool unbind() noexcept;
  bool bound() const noexcept { return context_ != nullptr; }
  bool ready() const noexcept { return bound() && capabilities_ && actual_; }
  std::optional<Capabilities> capabilities() const noexcept { return capabilities_; }
  std::optional<Size> actual() const noexcept { return actual_; }
  std::optional<Size> requested() const noexcept;
  Request request(Size size, Clock::time_point now) noexcept;
  // Called only after successful GDI initialization/resize, never after a layout write.
  bool observe(Size size) noexcept;
  bool expire(Clock::time_point now) noexcept;
};
} // namespace bridge::display
