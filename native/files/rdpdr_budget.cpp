#include "rdpdr_budget.hpp"
#include <algorithm>
#include <limits>

namespace bridge::files::rdpdr {
bool WriteBudget::poll(std::uint64_t now) noexcept {
  if ((clocked_ && now < last_) || std::any_of(writes_.begin(), writes_.end(),
      [now](const auto &item) { return item.ticket && now >= item.deadline; })) fail();
  clocked_ = true;last_ = now;
  return !stats_.failed;
}
std::optional<std::uintptr_t> WriteBudget::admit(void *token, std::uint8_t *data,
                                                std::size_t size, std::uint64_t now, std::size_t capacity) noexcept {
  if (!poll(now) || stats_.stopped) return {};
  if (!capacity) capacity = size;
  if (!token || !data || !size || size > maximum_packet_bytes || !next_ ||
      capacity < size || capacity > maximum_stream_capacity ||
      now > (std::numeric_limits<std::uint64_t>::max)() - maximum_write_ms ||
      stats_.pending >= maximum_pending_writes || capacity > maximum_pending_bytes - stats_.bytes ||
      std::any_of(writes_.begin(), writes_.end(), [token](const auto &item) { return item.token == token; })) {
    fail();return {};
  }
  const auto at = std::find_if(writes_.begin(), writes_.end(), [](const auto &item) { return !item.ticket; });
  if (at == writes_.end()) { fail();return {}; }
  const auto ticket = next_;
  next_ = ticket == (std::numeric_limits<std::uintptr_t>::max)() ? 0 : ticket + 1;
  *at = {ticket, token, data, size, capacity, now + maximum_write_ms};
  ++stats_.pending;stats_.bytes += capacity;
  stats_.peak_pending = std::max(stats_.peak_pending, stats_.pending);
  stats_.peak_bytes = std::max(stats_.peak_bytes, stats_.bytes);
  return ticket;
}
std::optional<BorrowedWrite> WriteBudget::withdraw(std::uintptr_t ticket) noexcept {
  if (!ticket) { fail();return {}; }
  const auto at = std::find_if(writes_.begin(), writes_.end(), [ticket](const auto &item) { return item.ticket == ticket; });
  if (at == writes_.end()) { fail();return {}; }
  const auto result = *at;*at = {};
  --stats_.pending;stats_.bytes -= result.capacity;
  return result;
}
std::optional<BorrowedWrite> WriteBudget::complete(std::uintptr_t ticket, std::size_t size,
                                                  std::size_t total, std::uint64_t now) noexcept {
  (void)poll(now); // A late known completion still joins its borrow after failure.
  const auto at = std::find_if(writes_.begin(), writes_.end(), [ticket](const auto &item) { return item.ticket == ticket; });
  if (!ticket || at == writes_.end() || at->bytes != size || size != total) { fail();return {}; }
  return withdraw(ticket);
}
std::optional<BorrowedWrite> WriteBudget::refused(std::uintptr_t ticket) noexcept { return withdraw(ticket); }
std::optional<BorrowedWrite> WriteBudget::cancel_after_join() noexcept {
  if (!stats_.stopped) { fail();return {}; }
  const auto at = std::find_if(writes_.begin(), writes_.end(), [](const auto &item) { return item.ticket != 0; });
  return at == writes_.end() ? std::nullopt : withdraw(at->ticket);
}
} // namespace bridge::files::rdpdr
