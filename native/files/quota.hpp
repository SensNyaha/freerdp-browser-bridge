#pragma once
#include <cstdint>
#include <memory>
#include <utility>

namespace bridge::files {
inline constexpr std::uint32_t maximum_quota_entries = 65536;
struct QuotaLimits {
  std::uint64_t bytes = 256 * 1024 * 1024;
  std::uint64_t file_bytes = 64 * 1024 * 1024;
  std::uint32_t entries = 1024; // Files AND directories, including temporary uploads.
};
enum class QuotaStatus { ok, invalid, limit, retired, busy, unavailable };
struct QuotaSnapshot {
  QuotaStatus status = QuotaStatus::invalid;
  std::uint64_t bytes = 0; // Committed logical sizes plus pending growth.
  std::uint64_t reserved_bytes = 0;
  std::uint32_t entries = 0;
  bool retired = false;
};
struct QuotaRecord;
class QuotaAllocation;
struct AllocationResult;
struct GrowthResult;

// One shared authority per sandbox, not one budget per upload/share/handle.
// This accounts owned filesystem entries, never paths or browser-supplied sizes.
class FileQuota {
  struct State;
  std::shared_ptr<State> state_;
  explicit FileQuota(std::shared_ptr<State> state);
  friend struct QuotaRecord;
  friend class QuotaAllocation;
  friend class GrowthReservation;

public:
  FileQuota() = default;
  ~FileQuota();
  FileQuota(FileQuota &&) noexcept;
  FileQuota &operator=(FileQuota &&) noexcept;
  FileQuota(const FileQuota &) = delete;
  FileQuota &operator=(const FileQuota &) = delete;
  static std::pair<QuotaStatus, FileQuota> create(QuotaLimits limits);
  // Reserve BEFORE entry creation; also usable for an owner's verified initial
  // inventory. On a failed create, release its allocation explicitly.
  AllocationResult acquire(std::uint64_t verified_bytes = 0) const;
  QuotaSnapshot snapshot() const;
  QuotaLimits limits() const noexcept;
  void retire(); // Refuses new work; pending results and cleanup can still settle.
};

class GrowthReservation {
  std::shared_ptr<QuotaRecord> record_;
  std::uint64_t upper_ = 0;
  bool active_ = false;
  GrowthReservation(std::shared_ptr<QuotaRecord> record, std::uint64_t upper);
  friend class QuotaAllocation;

public:
  GrowthReservation() = default;
  ~GrowthReservation();
  GrowthReservation(GrowthReservation &&) noexcept;
  GrowthReservation &operator=(GrowthReservation &&) noexcept;
  GrowthReservation(const GrowthReservation &) = delete;
  GrowthReservation &operator=(const GrowthReservation &) = delete;
  explicit operator bool() const noexcept { return active_; }
  // Owner reports a verified actual size after joined IO (also after partial
  // failure). A missing result conservatively charges the admitted upper bound.
  // An impossible result retires the whole authority rather than undercharging.
  QuotaStatus finish(std::uint64_t verified_bytes);
};
struct GrowthResult {
  QuotaStatus status;
  GrowthReservation reservation;
};

class QuotaAllocation {
  std::shared_ptr<QuotaRecord> record_;
  explicit QuotaAllocation(std::shared_ptr<QuotaRecord> record);
  friend class FileQuota;

public:
  QuotaAllocation() = default;
  QuotaAllocation(QuotaAllocation &&) noexcept = default;
  QuotaAllocation &operator=(QuotaAllocation &&) noexcept = default;
  QuotaAllocation(const QuotaAllocation &) = delete;
  QuotaAllocation &operator=(const QuotaAllocation &) = delete;
  explicit operator bool() const noexcept { return record_ != nullptr; }
  GrowthResult reserve_size(std::uint64_t maximum_result_bytes) const;
  // Sole owner calls this only after the physical entry is absent AND all IO
  // handles are joined/closed. Repeated release is harmless. Dropping this
  // object without that proof keeps its charge until sandbox disposal.
  QuotaStatus release();
};
struct AllocationResult {
  QuotaStatus status;
  QuotaAllocation allocation;
};
} // namespace bridge::files
