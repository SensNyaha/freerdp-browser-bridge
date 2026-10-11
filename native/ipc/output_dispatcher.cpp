#include "output_dispatcher.hpp"
#include <limits>

namespace bridge::ipc {
DispatchAdmission OutputDispatcher::try_select_audio_codec(OutputAudioCodec codec) {
  const std::unique_lock lock(mutex_, std::try_to_lock);
  if (!lock.owns_lock())
    return DispatchAdmission::busy;
  if (!stats_.accepting)
    return DispatchAdmission::closed;
  return queue_.select_audio_codec(codec) ? DispatchAdmission::accepted
                                          : DispatchAdmission::invalid;
}
DispatchAdmission OutputDispatcher::try_send(Kind kind, std::uint64_t request_id,
                                             std::span<const std::uint8_t> bytes) {
  const std::unique_lock lock(mutex_, std::try_to_lock);
  if (!lock.owns_lock())
    return DispatchAdmission::busy;
  if (!stats_.accepting)
    return DispatchAdmission::closed;
  try {
    switch (queue_.push(kind, request_id, bytes)) {
    case EnqueueStatus::accepted:
      return DispatchAdmission::accepted;
    case EnqueueStatus::full:
      return DispatchAdmission::full;
    case EnqueueStatus::invalid:
      return DispatchAdmission::invalid;
    }
  } catch (...) {
    fail(); // Fixed failure state; never expose payload or allocator diagnostics.
  }
  return DispatchAdmission::closed;
}
DispatchResult OutputDispatcher::write_next(const Write &write) noexcept {
  if (writing_.test_and_set(std::memory_order_acquire))
    return DispatchResult::busy;
  struct Release {
    std::atomic_flag &flag;
    ~Release() { flag.clear(std::memory_order_release); }
  } release{writing_};
  try {
    std::optional<Packet> record;
    {
      const std::lock_guard lock(mutex_);
      if (stats_.failed)
        return DispatchResult::failed;
      if (stats_.closed)
        return DispatchResult::closed;
      if (!write) {
        fail();
        return DispatchResult::failed;
      }
      record = queue_.take();
      if (!record) {
        if (!stats_.accepting) {
          stats_.closed = true;
          return DispatchResult::closed;
        }
        return DispatchResult::idle;
      }
      stats_.in_flight_bytes = header_bytes + record->payload.size();
    }
    const auto header = encode_header(
        {record->kind, record->request_id, static_cast<std::uint32_t>(record->payload.size())});
    const bool sent = write(header, record->payload);
    const std::lock_guard lock(mutex_);
    stats_.in_flight_bytes = 0;
    if (!sent || stats_.failed) {
      fail();
      return DispatchResult::failed;
    }
    if (stats_.sent_records != (std::numeric_limits<std::uint64_t>::max)())
      ++stats_.sent_records;
    if (!stats_.accepting && queue_.stats().records == 0)
      stats_.closed = true;
    return DispatchResult::sent;
  } catch (...) {
    const std::lock_guard lock(mutex_);
    stats_.in_flight_bytes = 0;
    fail();
    return DispatchResult::failed;
  }
}
void OutputDispatcher::fail() noexcept {
  stats_.failed = true;
  stats_.accepting = false;
  queue_.discard_all();
  stats_.closed = stats_.in_flight_bytes == 0;
}
void OutputDispatcher::finish() {
  const std::lock_guard lock(mutex_);
  stats_.accepting = false;
  if (queue_.stats().records == 0 && stats_.in_flight_bytes == 0)
    stats_.closed = true;
}
void OutputDispatcher::abort() {
  const std::lock_guard lock(mutex_);
  fail();
}
bool OutputDispatcher::try_discard_audio() {
  const std::unique_lock lock(mutex_, std::try_to_lock);
  if (!lock.owns_lock() || !stats_.accepting)
    return false;
  queue_.discard_audio();
  return true;
}
std::optional<DispatcherStats> OutputDispatcher::try_stats() const {
  const std::unique_lock lock(mutex_, std::try_to_lock);
  if (!lock.owns_lock())
    return std::nullopt;
  auto result = stats_;
  result.queued = queue_.stats();
  return result;
}
} // namespace bridge::ipc
