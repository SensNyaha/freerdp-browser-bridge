#pragma once
#include <array>
#include <freerdp/addin.h>
#include <freerdp/freerdp.h>
#include <thread>

namespace bridge::channels {
// Fixed, process-local bridge provider chain. One context/serialized owner;
// no concurrent context creation, provider mutation, callback or destruction.
// Client retires its resources before close; scopes close in reverse bind order.
class AddinScope {
  static constexpr std::size_t capacity = 8;
  static std::array<AddinScope *, capacity> stack_;
  static std::size_t count_;
  FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN callback_ = nullptr, previous_ = nullptr;
  rdpContext *context_ = nullptr;
  std::thread::id thread_;
  bool bound_ = false, used_ = false;
  bool on_thread() const noexcept;

public:
  AddinScope() = default;
  ~AddinScope();
  AddinScope(const AddinScope &) = delete;
  AddinScope &operator=(const AddinScope &) = delete;
  UINT bind(rdpContext &, FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN) noexcept;
  bool active() const noexcept; // Owned member of the current complete bridge chain.
  bool top() const noexcept;    // Owner may retire this scope without breaking a child.
  bool bound() const noexcept { return bound_; }
  FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN previous() const noexcept;
  UINT close() noexcept;
};
} // namespace bridge::channels
