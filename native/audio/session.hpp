#pragma once
#include "publisher.hpp"
#include "rdpsnd_provider.hpp"
#include "static_gate.hpp"

namespace bridge::audio {
enum class RetireStatus { active, pending, done, invalid, expired, failed };
struct SessionStats {
  SinkStats source;
  PublisherStats publisher;
  std::uint64_t close_attempts = 0, drain_calls = 0, drain_failures = 0, invalid_calls = 0;
  UINT close_status = CHANNEL_RC_OK;
  RetireStatus retirement = RetireStatus::active;
  bool resources_retired = false;
  bool publication_failed = false;
};
// Construct/bind after context creation on its synchronous RDP thread. This wrapper
// must outlive context Free/host Terminated, even after resources retire and join.
// Retire after RDP disconnect when activated; unactivated registrations may retire
// before final disconnect. ContextFree alone does not deliver host Terminated.
// Drain and output callbacks must not block.
// Failed/expired live ownership is an outer process fault.
class AudioSession {
public:
  using Drain = std::function<bool()>;
  AudioSession(rdpContext &, PcmPublisher::TrySend, PcmPublisher::TryDiscard, Drain = {},
               std::uint64_t retire_window_us = 1000000);
  AudioSession(const AudioSession &) = delete;
  AudioSession &operator=(const AudioSession &) = delete;
  PublishStatus pump(std::uint64_t worker_time_us) noexcept;
  RetireStatus retire(std::uint64_t worker_time_us) noexcept;
  std::optional<SessionStats> stats() const noexcept;

private:
  RdpsndSink source_;
  AudioStaticGate gate_;
  RdpsndProvider provider_;
  PcmPublisher publisher_;
  PcmPublisher::TrySend send_;
  Drain drain_;
  const std::thread::id thread_;
  const std::uint64_t retire_window_us_;
  std::uint64_t observed_us_ = 0, retire_deadline_us_ = 0;
  bool observed_ = false, busy_ = false;
  SessionStats stats_;
  bool on_thread() const noexcept;
  bool observe(std::uint64_t) noexcept;
};
} // namespace bridge::audio
