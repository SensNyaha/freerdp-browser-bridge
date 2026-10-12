#pragma once
#include "dvc_completion_hook.hpp"
#include <memory>

namespace bridge::channels {
struct DvcChannelBinding {
  UINT status;
  IWTSVirtualChannelCallback *callback;
};
struct DvcChannelRegistryStats {
  DvcMessageBudgetStats budget;
  std::size_t active_channels = 0;
  std::uint64_t bindings = 0, reused_slots = 0, failures = 0;
  bool closed = false, failed = false, resources_retired = false;
};
// The host owner binds only successfully accepted public listener callbacks.
// Caller keeps rejected original callbacks; close returns pending while borrowed
// targets are active. Slot reuse requires host OnClose return/unpublication.
class DvcChannelRegistry final {
public:
  DvcChannelRegistry(DvcCompletionHook::Clock, void *clock_context = nullptr,
                     DvcMessageBudgetLimits = {}, DvcAllocationLimits = {});
  DvcChannelRegistry(const DvcChannelRegistry &) = delete;
  DvcChannelRegistry &operator=(const DvcChannelRegistry &) = delete;
  DvcChannelBinding bind(IWTSVirtualChannelManager &, IWTSVirtualChannel &,
                         IWTSVirtualChannelCallback &, std::uint64_t now_ms) noexcept;
  bool admit(std::span<const std::uint8_t>, std::uint64_t now_ms) noexcept;
  bool poll(std::uint64_t now_ms) noexcept;
  UINT retire() noexcept;
  DvcChannelRegistryStats stats() const noexcept;
  bool contains(std::uint32_t) const noexcept;
  bool owns_callback(const IWTSVirtualChannelCallback &) const noexcept;

private:
  struct Entry {
    std::uint32_t id = 0;
    const IWTSVirtualChannelCallback *original = nullptr;
    std::unique_ptr<DvcCompletionHook> hook;
  };
  std::array<Entry, DvcMessageBudgetLimits::hard_slots> entries_{};
  DvcMessageBudget budget_;
  const DvcAllocationLimits allocations_;
  const std::size_t slots_;
  const DvcCompletionHook::Clock clock_;
  void *const clock_context_;
  std::uint64_t bindings_ = 0, reused_ = 0, failures_ = 0;
  UINT failure_status_ = 0;
  bool busy_ = false, closed_ = false, failed_ = false;
  bool fail(UINT) noexcept;
};
} // namespace bridge::channels
