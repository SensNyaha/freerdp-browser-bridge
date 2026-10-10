#pragma once
#include "audio.hpp"
#include "rdpsnd_sink.hpp"
#include <functional>

namespace bridge::audio {
enum class PublishStatus { idle, sent, blocked, invalid, failed };
struct PublisherStats {
  std::uint64_t captured_packets = 0, sent_packets = 0, sent_configs = 0;
  std::uint64_t replaced_packets = 0, reset_discarded_packets = 0;
  std::uint64_t blocked_calls = 0, invalid_clocks = 0;
  std::uint64_t consumer_resets = 0;
  std::uint64_t sent_states = 0;
  bool pending = false, reset_pending = false, state_pending = false, failed = false;
};
// One RDP-thread source. TrySend must not block; true means a bounded consumer
// copied the borrowed bytes. False preserves credit for a later call.
// Not installed by the worker until its bounded transport owner is available.
class PcmPublisher {
public:
  using TrySend = std::function<bool(ipc::Kind, std::span<const std::uint8_t>)>;
  // Clear only unsent consumer audio; false retains the barrier for a later pump.
  // Both source and callback targets must outlive this owner.
  using TryDiscard = std::function<bool()>;
  // Optional revision enables source status; omitted keeps the packet-only fixture mode.
  // The enabled PCM status profile is immutable for this owner.
  PcmPublisher(RdpsndSink &, TryDiscard, std::uint64_t previous_epoch = 0,
               std::optional<std::uint64_t> previous_status_revision = std::nullopt);
  PublishStatus pump(std::uint64_t worker_time_us, const TrySend &) noexcept;
  bool reset() noexcept;
  std::optional<PublisherStats> stats() const noexcept;

private:
  struct Storage {
    std::array<std::uint8_t, ipc::audio::packet_bytes> packet{};
    std::array<std::uint8_t, ipc::audio::config_bytes> config{};
    std::array<std::uint8_t, ipc::audio::state_bytes> state{};
  };
  RdpsndSink &source_;
  TryDiscard discard_output_;
  std::unique_ptr<Storage> bytes_;
  const std::thread::id thread_;
  std::uint64_t epoch_, observed_us_ = 0, source_revision_ = 0;
  std::optional<std::uint64_t> state_revision_;
  std::optional<ipc::audio::Availability> sent_availability_;
  std::uint64_t sent_state_epoch_ = 0, sent_source_revision_ = 0;
  bool observed_ = false, new_epoch_ = true, config_required_ = false, pending_ = false;
  bool busy_ = false, failed_ = false;
  bool reset_required_ = true;
  bool state_pending_ = false;
  PublisherStats stats_;
  bool on_thread() const noexcept;
  void discard() noexcept;
  PublishStatus publish_state(std::uint64_t, const TrySend &);
};
} // namespace bridge::audio
