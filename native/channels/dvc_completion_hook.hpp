#pragma once
#include "dvc_message_budget.hpp"
#include <freerdp/dvc.h>

namespace bridge::channels {
// Public callback proxy only. The caller must retain this proxy and budget until
// the host has closed it and all delegated callbacks have returned.
class DvcCompletionHook final {
public:
  using Clock = std::uint64_t (*)(void *);
  DvcCompletionHook(DvcMessageBudget &, std::uint32_t channel, IWTSVirtualChannelCallback &, Clock,
                    void *clock_context = nullptr, bool gfx_zgfx = false, DvcAllocationLimits = {});
  ~DvcCompletionHook();
  DvcCompletionHook(const DvcCompletionHook &) = delete;
  DvcCompletionHook &operator=(const DvcCompletionHook &) = delete;
  IWTSVirtualChannelCallback *interface() noexcept;
  UINT retire() noexcept;
  bool closed() const noexcept { return closed_ && !busy_; }
  bool failed() const noexcept { return failed_; }

private:
  struct Box {
    IWTSVirtualChannelCallback api{};
    DvcCompletionHook *owner;
  } box_;
  DvcMessageBudget &budget_;
  const std::uint32_t channel_;
  IWTSVirtualChannelCallback *original_;
  const Clock clock_;
  void *const clock_context_;
  const bool gfx_zgfx_;
  const DvcAllocationLimits allocations_;
  bool published_ = false, busy_ = false, closing_ = false, closed_ = false, failed_ = false;
  UINT close_status_ = 0;
  static DvcCompletionHook &owner(IWTSVirtualChannelCallback *) noexcept;
  static UINT on_open(IWTSVirtualChannelCallback *) noexcept;
  static UINT on_data(IWTSVirtualChannelCallback *, wStream *) noexcept;
  static UINT on_close(IWTSVirtualChannelCallback *) noexcept;
  UINT fault() noexcept;
  bool observe() noexcept;
  UINT finish_close() noexcept;
};
} // namespace bridge::channels
