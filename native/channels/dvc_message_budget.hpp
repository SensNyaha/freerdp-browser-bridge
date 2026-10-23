#pragma once
#include "dvc_bounds.hpp"
#include <array>

namespace bridge::channels {
struct DvcMessageBudgetLimits {
  static constexpr std::size_t hard_slots = 32;
  static constexpr std::size_t hard_total_bytes = 64 * 1024 * 1024;
  std::size_t slots = hard_slots, total_bytes = hard_total_bytes;
  std::size_t message_bytes = DvcAllocationLimits::hard_message_bytes;
  std::uint64_t timeout_ms = 5000;
};
struct DvcMessageBudgetStats {
  std::size_t reserved_bytes = 0, peak_bytes = 0, active = 0;
  std::uint64_t reservations = 0, replacements = 0, releases = 0, failures = 0, abandonments = 0;
  bool closed = false, failed = false;
};
// Declaration reservations only, not a stream-pool/RSS bound. Before forwarding,
// reserve the claim; release only on observed host completion or channel close.
// Failure requires caller retirement of actual host resources, not just this table.
class DvcMessageBudget final {
public:
  explicit DvcMessageBudget(DvcMessageBudgetLimits = {});
  DvcMessageBudget(const DvcMessageBudget &) = delete;
  DvcMessageBudget &operator=(const DvcMessageBudget &) = delete;
  bool reserve(std::uint32_t channel, std::size_t declared_bytes, std::uint64_t now_ms) noexcept;
  bool release(std::uint32_t channel, std::uint64_t now_ms) noexcept;
  bool poll(std::uint64_t now_ms) noexcept;
  void close() noexcept;
  std::optional<std::uint64_t> deadline() const noexcept;
  DvcMessageBudgetStats stats() const noexcept { return stats_; }

private:
  struct Entry {
    std::uint32_t channel = 0;
    std::size_t bytes = 0;
    std::uint64_t deadline = 0;
    bool active = false;
  };
  const DvcMessageBudgetLimits limits_;
  std::array<Entry, DvcMessageBudgetLimits::hard_slots> entries_{};
  std::optional<std::uint64_t> observed_;
  DvcMessageBudgetStats stats_;
  bool fail(bool abandoned = false) noexcept;
};
} // namespace bridge::channels
