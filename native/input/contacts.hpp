#pragma once
#include "rdpei_plugin.hpp"
#include "touch.hpp"
#include "touch_frame.hpp"
#include <chrono>

namespace bridge::touch {
enum class Drain { idle, pending, ready, failed, unavailable };
// Construct/service/destroy on the RDP thread. Registration outlives this observer.
// Destroy only after successful drain or during connection teardown, not a live detach.
// Drain::failed requires connection teardown; no gesture/uncertain write retry.
// No lease authority: the caller must check current ownership before apply().
class Contacts {
  struct Slot {
    bool used = false, terminal = false;
    Event event{};
    INT32 native = -1;
    TerminalRecord record;
  };
  PluginRegistration &registration_;
  std::thread::id thread_ = std::this_thread::get_id();
  State state_;
  std::array<Slot, State::max_contacts> slots_{};
  State::Sink sink_;
  bool reset_ = false, lost_ = false, failed_ = false;
  std::optional<std::chrono::steady_clock::time_point> deadline_;
  bool on_thread() const noexcept;
  bool send(const Event &) noexcept;
  UINT frame(std::span<const BYTE>, FrameDisposition) noexcept;
  void phase(Phase) noexcept;

public:
  explicit Contacts(PluginRegistration &);
  Contacts(const Contacts &) = delete;
  Contacts &operator=(const Contacts &) = delete;
  ~Contacts();
  bool ready() const noexcept;
  Result apply(Event, std::uint32_t width, std::uint32_t height) noexcept;
  void reset() noexcept;
  Drain
  service(std::chrono::steady_clock::time_point now = std::chrono::steady_clock::now()) noexcept;
  std::size_t owned() const noexcept;
};
} // namespace bridge::touch
