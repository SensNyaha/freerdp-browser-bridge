#pragma once
#include "../compat/span.hpp"
#include "output_queue.hpp"
#include <atomic>
#include <functional>
#include <mutex>

namespace bridge::ipc {
enum class DispatchAdmission { accepted, full, invalid, busy, closed };
enum class DispatchResult { sent, idle, busy, closed, failed };
struct DispatcherStats {
  OutputStats queued;
  std::size_t in_flight_bytes = 0;
  std::uint64_t sent_records = 0;
  bool accepting = true, failed = false, closed = false;
};
// Shared producer/one-consumer owner; no thread, pipe or cancellation policy.
// Must outlive every caller, including an outstanding Write callback.
class OutputDispatcher {
public:
  // Called without the producer mutex. Header/body are borrowed until return.
  // Return true only after the complete record has been written in order.
  // The external driver must supply bounded/cancellable I/O and one writer.
  using Write = std::function<bool(::bridge::compat::span<const std::uint8_t>, ::bridge::compat::span<const std::uint8_t>)>;
  OutputDispatcher() = default;
  explicit OutputDispatcher(OutputAudioCodec codec) : queue_(codec) {}
  DispatchAdmission try_select_audio_codec(OutputAudioCodec codec);
  DispatchAdmission try_send(Kind, std::uint64_t request_id, ::bridge::compat::span<const std::uint8_t>);
  DispatchResult write_next(const Write &) noexcept;
  // Refuse new producers, retain pending records for the external driver to drain.
  void finish();
  // Discard queued records; cannot interrupt the external in-flight Write.
  void abort();
  bool try_discard_audio();
  std::optional<DispatcherStats> try_stats() const;

private:
  mutable std::mutex mutex_;
  std::atomic_flag writing_ = ATOMIC_FLAG_INIT;
  OutputQueue queue_;
  DispatcherStats stats_;
  void fail() noexcept;
};
} // namespace bridge::ipc
