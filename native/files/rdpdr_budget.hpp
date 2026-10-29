#pragma once
#include "rdpdr_wire.hpp"
#include <array>
#include <cstdint>

namespace bridge::files::rdpdr {
inline constexpr std::size_t maximum_packet_bytes = maximum_reply_bytes + 16;
inline constexpr std::size_t maximum_stream_capacity = 2 * maximum_packet_bytes + 256;
inline constexpr std::size_t maximum_pending_writes = 64;
inline constexpr std::size_t maximum_pending_bytes = 8 * maximum_packet_bytes;
inline constexpr std::uint64_t maximum_write_ms = 10000;
struct BorrowedWrite {
  std::uintptr_t ticket = 0;
  void *token = nullptr;
  std::uint8_t *data = nullptr;
  std::size_t bytes = 0;
  std::size_t capacity = 0;
  std::uint64_t deadline = 0;
};
struct WriteBudgetStats {
  std::size_t pending = 0, bytes = 0, peak_pending = 0, peak_bytes = 0;
  bool failed = false, stopped = false;
};
// Serialized owner only. Fixed metadata, no payload storage or send queue.
// Host tickets are monotonic, never upstream pointers: reused stream addresses
// cannot let an old completion refund a new borrow. Stop/failure retains debt.
class WriteBudget {
  std::array<BorrowedWrite, maximum_pending_writes> writes_{};
  WriteBudgetStats stats_;
  std::uintptr_t next_ = 1;
  std::uint64_t last_ = 0;
  bool clocked_ = false;
  std::optional<BorrowedWrite> withdraw(std::uintptr_t) noexcept;

public:
  bool poll(std::uint64_t now_ms) noexcept;
  std::optional<std::uintptr_t> admit(void *token, std::uint8_t *data, std::size_t,
                                      std::uint64_t now_ms, std::size_t capacity = 0) noexcept;
  std::optional<BorrowedWrite> complete(std::uintptr_t, std::size_t, std::size_t,
                                        std::uint64_t now_ms) noexcept;
  // Only a definitive host refusal may withdraw before a completion.
  std::optional<BorrowedWrite> refused(std::uintptr_t) noexcept;
  // Caller must prove the host queue/producers joined before using this.
  std::optional<BorrowedWrite> cancel_after_join() noexcept;
  void stop() noexcept { stats_.stopped = true; }
  void fail() noexcept { stats_.failed = true; }
  WriteBudgetStats stats() const noexcept { return stats_; }
};
} // namespace bridge::files::rdpdr
