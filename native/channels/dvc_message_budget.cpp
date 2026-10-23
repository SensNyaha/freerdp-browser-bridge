#include "dvc_message_budget.hpp"
#include <algorithm>
#include <limits>
#include <stdexcept>

namespace bridge::channels {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
} // namespace
DvcMessageBudget::DvcMessageBudget(DvcMessageBudgetLimits limits) : limits_(limits) {
  if (!limits.slots || limits.slots > limits.hard_slots || !limits.total_bytes ||
      limits.total_bytes > limits.hard_total_bytes || !limits.message_bytes ||
      limits.message_bytes > DvcAllocationLimits::hard_message_bytes ||
      limits.message_bytes > limits.total_bytes || !limits.timeout_ms || limits.timeout_ms > 10000)
    throw std::invalid_argument("Invalid DVC message budget");
}
void DvcMessageBudget::close() noexcept {
  entries_.fill({});
  stats_.active = stats_.reserved_bytes = 0;
  stats_.closed = true;
}
bool DvcMessageBudget::fail(bool abandoned) noexcept {
  if (!stats_.failed) {
    stats_.failed = true;
    increment(stats_.failures);
    if (abandoned)
      increment(stats_.abandonments);
  }
  close();
  return false;
}
std::optional<std::uint64_t> DvcMessageBudget::deadline() const noexcept {
  std::optional<std::uint64_t> result;
  for (const auto &entry : entries_)
    if (entry.active && (!result || entry.deadline < *result))
      result = entry.deadline;
  return result;
}
bool DvcMessageBudget::poll(std::uint64_t now) noexcept {
  if (stats_.closed)
    return false;
  if ((observed_ && now < *observed_) ||
      now > (std::numeric_limits<std::uint64_t>::max)() - limits_.timeout_ms)
    return fail();
  observed_ = now;
  const auto earliest = deadline();
  if (earliest && now >= *earliest)
    return fail(true);
  return true;
}
bool DvcMessageBudget::reserve(std::uint32_t channel, std::size_t bytes,
                               std::uint64_t now) noexcept {
  if (!poll(now))
    return false;
  if (bytes > limits_.message_bytes)
    return fail();
  auto found = std::find_if(entries_.begin(), entries_.end(), [channel](const auto &entry) {
    return entry.active && entry.channel == channel;
  });
  const bool replace = found != entries_.end();
  const auto previous = replace ? found->bytes : 0;
  const auto retained = stats_.reserved_bytes - previous;
  if (bytes > limits_.total_bytes - retained)
    return fail();
  if (!replace) {
    if (stats_.active >= limits_.slots)
      return fail();
    found = std::find_if(entries_.begin(), entries_.end(),
                         [](const auto &entry) { return !entry.active; });
    if (found == entries_.end())
      return fail();
    *found = {channel, bytes, now + limits_.timeout_ms, true};
    ++stats_.active;
  } else {
    found->bytes = bytes;
    increment(
        stats_.replacements); // A new first cannot postpone an uncompleted channel's deadline.
  }
  stats_.reserved_bytes = retained + bytes;
  stats_.peak_bytes = std::max(stats_.peak_bytes, stats_.reserved_bytes);
  increment(stats_.reservations);
  return true;
}
bool DvcMessageBudget::release(std::uint32_t channel, std::uint64_t now) noexcept {
  if (!poll(now))
    return false;
  for (auto &entry : entries_) {
    if (!entry.active || entry.channel != channel)
      continue;
    stats_.reserved_bytes -= entry.bytes;
    --stats_.active;
    entry = {};
    increment(stats_.releases);
    return true;
  }
  return false; // Standalone DATA has no reservation; absence is not a fault.
}
} // namespace bridge::channels
