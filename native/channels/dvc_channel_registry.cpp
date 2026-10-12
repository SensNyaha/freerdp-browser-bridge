#include "dvc_channel_registry.hpp"
#include <algorithm>
#include <limits>
#include <stdexcept>
#include <winpr/error.h>

namespace bridge::channels {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
} // namespace
DvcChannelRegistry::DvcChannelRegistry(DvcCompletionHook::Clock clock, void *clock_context,
                                       DvcMessageBudgetLimits budget,
                                       DvcAllocationLimits allocations)
    : budget_(budget), allocations_(allocations), slots_(budget.slots), clock_(clock),
      clock_context_(clock_context) {
  if (!clock || !allocations.valid())
    throw std::invalid_argument("Invalid DVC channel registry");
}
bool DvcChannelRegistry::fail(UINT status) noexcept {
  if (!failed_) {
    failed_ = true;
    failure_status_ = status;
    increment(failures_);
  }
  closed_ = true;
  // Admission is closed, but host target retirement is still owed independently.
  budget_.close();
  return false;
}
bool DvcChannelRegistry::contains(std::uint32_t id) const noexcept {
  return std::any_of(entries_.begin(), entries_.end(), [id](const auto &entry) {
    return entry.hook && !entry.hook->closed() && entry.id == id;
  });
}
bool DvcChannelRegistry::poll(std::uint64_t now) noexcept {
  if (closed_)
    return false;
  if (busy_)
    return fail(ERROR_INVALID_DATA);
  if (std::any_of(entries_.begin(), entries_.end(),
                  [](const auto &entry) { return entry.hook && entry.hook->failed(); }) ||
      !budget_.poll(now))
    return fail(ERROR_INVALID_DATA);
  return true;
}
DvcChannelBinding DvcChannelRegistry::bind(IWTSVirtualChannelManager &manager,
                                           IWTSVirtualChannel &channel,
                                           IWTSVirtualChannelCallback &original,
                                           std::uint64_t now) noexcept {
  if (!poll(now))
    return {ERROR_INVALID_STATE, nullptr};
  if (!manager.GetChannelId || !original.OnDataReceived) {
    (void)fail(ERROR_INVALID_PARAMETER);
    return {ERROR_INVALID_PARAMETER, nullptr};
  }
  busy_ = true;
  DvcChannelBinding result{ERROR_INVALID_STATE, nullptr};
  try {
    const auto id = manager.GetChannelId(&channel);
    if (!closed_) {
      if (contains(id)) {
        (void)fail(ERROR_ALREADY_EXISTS);
        result.status = ERROR_ALREADY_EXISTS;
      } else {
        auto end = entries_.begin() + slots_;
        auto free = std::find_if(entries_.begin(), end, [](const auto &entry) {
          return !entry.hook || entry.hook->closed();
        });
        if (free == end) {
          (void)fail(ERROR_TOO_MANY_OPEN_FILES);
          result.status = ERROR_TOO_MANY_OPEN_FILES;
        } else {
          auto hook =
              std::make_unique<DvcCompletionHook>(budget_, id, original, clock_, clock_context_);
          if (free->hook)
            increment(reused_);
          free->id = id;
          free->hook = std::move(hook);
          result = {CHANNEL_RC_OK, free->hook->interface()};
          increment(bindings_);
        }
      }
    }
  } catch (...) {
    (void)fail(ERROR_INTERNAL_ERROR);
    result = {ERROR_INTERNAL_ERROR, nullptr};
  }
  busy_ = false;
  return result;
}
bool DvcChannelRegistry::admit(std::span<const std::uint8_t> payload, std::uint64_t now) noexcept {
  if (!poll(now))
    return false;
  const auto info = inspect_dvc_allocations(payload, allocations_);
  if (!info)
    return fail(ERROR_INVALID_DATA);
  if (info->declared_message && info->channel_id && contains(*info->channel_id))
    if (!budget_.reserve(*info->channel_id, *info->declared_message, now))
      return fail(ERROR_INVALID_DATA);
  return true;
}
UINT DvcChannelRegistry::retire() noexcept {
  closed_ = true;
  bool pending = busy_;
  for (auto &entry : entries_) {
    if (!entry.hook)
      continue;
    const auto status = entry.hook->retire();
    pending = pending || !entry.hook->closed();
    if (status != CHANNEL_RC_OK && status != ERROR_IO_PENDING)
      (void)fail(status);
  }
  budget_.close();
  return pending ? ERROR_IO_PENDING : (failed_ ? failure_status_ : CHANNEL_RC_OK);
}
DvcChannelRegistryStats DvcChannelRegistry::stats() const noexcept {
  DvcChannelRegistryStats result{};
  result.budget = budget_.stats();
  result.bindings = bindings_;
  result.reused_slots = reused_;
  result.failures = failures_;
  result.closed = closed_;
  result.failed = failed_;
  result.resources_retired = closed_ && !busy_;
  for (const auto &entry : entries_) {
    if (!entry.hook)
      continue;
    if (!entry.hook->closed()) {
      ++result.active_channels;
      result.resources_retired = false;
    }
    result.failed = result.failed || entry.hook->failed();
  }
  return result;
}
} // namespace bridge::channels
