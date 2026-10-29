#include "quota.hpp"
#include <algorithm>
#include <limits>
#include <mutex>
#include <new>

namespace bridge::files {
struct FileQuota::State {
  const QuotaLimits limits;
  std::mutex mutex;
  std::uint64_t bytes = 0, reserved = 0;
  std::uint32_t entries = 0;
  bool retired = false;
  explicit State(QuotaLimits value) : limits(value) {}
};
struct QuotaRecord {
  std::shared_ptr<FileQuota::State> state;
  std::uint64_t bytes;
  bool pending = false, released = false;
  QuotaRecord(std::shared_ptr<FileQuota::State> owner, std::uint64_t size)
      : state(std::move(owner)), bytes(size) {}
  // No implicit refund: the corresponding physical file can still exist.
};
FileQuota::FileQuota(std::shared_ptr<State> state) : state_(std::move(state)) {}
FileQuota::~FileQuota() { retire(); }
FileQuota::FileQuota(FileQuota &&) noexcept = default;
FileQuota &FileQuota::operator=(FileQuota &&other) noexcept {
  if (this != &other) {
    retire();
    state_ = std::move(other.state_);
  }
  return *this;
}
std::pair<QuotaStatus, FileQuota> FileQuota::create(QuotaLimits limits) {
  if (limits.bytes > static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max()) ||
      limits.file_bytes > limits.bytes || limits.entries > maximum_quota_entries)
    return {QuotaStatus::invalid, FileQuota{}};
  try {
    return {QuotaStatus::ok, FileQuota(std::make_shared<State>(limits))};
  } catch (const std::bad_alloc &) {
    return {QuotaStatus::unavailable, FileQuota{}};
  }
}
AllocationResult FileQuota::acquire(std::uint64_t bytes) const {
  if (!state_)
    return {QuotaStatus::invalid, {}};
  std::lock_guard lock(state_->mutex);
  if (state_->retired)
    return {QuotaStatus::retired, {}};
  if (bytes > state_->limits.file_bytes || bytes > state_->limits.bytes - state_->bytes ||
      state_->entries == state_->limits.entries)
    return {QuotaStatus::limit, {}};
  // Admit before allocating the per-entry record. No allocation occurs on a
  // policy refusal, and neither a share nor another producer gets its own cap.
  try {
    auto record = std::make_shared<QuotaRecord>(state_, bytes);
    state_->bytes += bytes;
    ++state_->entries;
    return {QuotaStatus::ok, QuotaAllocation(std::move(record))};
  } catch (const std::bad_alloc &) {
    return {QuotaStatus::unavailable, {}};
  }
}
QuotaSnapshot FileQuota::snapshot() const {
  if (!state_)
    return {};
  std::lock_guard lock(state_->mutex);
  return {QuotaStatus::ok, state_->bytes, state_->reserved, state_->entries, state_->retired};
}
QuotaLimits FileQuota::limits() const noexcept {
  return state_ ? state_->limits : QuotaLimits{0, 0, 0};
}
void FileQuota::retire() {
  if (!state_)
    return;
  std::lock_guard lock(state_->mutex);
  state_->retired = true;
}
QuotaAllocation::QuotaAllocation(std::shared_ptr<QuotaRecord> record) : record_(std::move(record)) {}
GrowthResult QuotaAllocation::reserve_size(std::uint64_t bytes) const {
  if (!record_)
    return {QuotaStatus::invalid, {}};
  auto &state = *record_->state;
  std::lock_guard lock(state.mutex);
  if (state.retired || record_->released)
    return {QuotaStatus::retired, {}};
  if (record_->pending)
    return {QuotaStatus::busy, {}};
  const auto upper = std::max(record_->bytes, bytes);
  const auto growth = upper - record_->bytes;
  if (bytes > state.limits.file_bytes || growth > state.limits.bytes - state.bytes)
    return {QuotaStatus::limit, {}};
  state.bytes += growth;
  state.reserved += growth;
  record_->pending = true;
  return {QuotaStatus::ok, GrowthReservation(record_, upper)};
}
QuotaStatus QuotaAllocation::release() {
  if (!record_)
    return QuotaStatus::invalid;
  auto &state = *record_->state;
  std::lock_guard lock(state.mutex);
  if (record_->released)
    return QuotaStatus::ok;
  if (record_->pending)
    return QuotaStatus::busy;
  state.bytes -= record_->bytes;
  --state.entries;
  record_->bytes = 0;
  record_->released = true;
  return QuotaStatus::ok;
}
GrowthReservation::GrowthReservation(std::shared_ptr<QuotaRecord> record, std::uint64_t upper)
    : record_(std::move(record)), upper_(upper), active_(true) {}
GrowthReservation::~GrowthReservation() {
  if (active_)
    (void)finish(upper_);
}
GrowthReservation::GrowthReservation(GrowthReservation &&other) noexcept
    : record_(std::move(other.record_)), upper_(other.upper_),
      active_(std::exchange(other.active_, false)) {}
GrowthReservation &GrowthReservation::operator=(GrowthReservation &&other) noexcept {
  if (this != &other) {
    if (active_)
      (void)finish(upper_);
    record_ = std::move(other.record_);
    upper_ = other.upper_;
    active_ = std::exchange(other.active_, false);
  }
  return *this;
}
QuotaStatus GrowthReservation::finish(std::uint64_t bytes) {
  if (!active_ || !record_)
    return QuotaStatus::invalid;
  auto &state = *record_->state;
  std::lock_guard lock(state.mutex);
  if (bytes > upper_) {
    state.retired = true;
    return QuotaStatus::invalid;
  }
  state.reserved -= upper_ - record_->bytes;
  state.bytes -= upper_ - bytes;
  record_->bytes = bytes;
  record_->pending = false;
  active_ = false;
  return QuotaStatus::ok;
}
} // namespace bridge::files
