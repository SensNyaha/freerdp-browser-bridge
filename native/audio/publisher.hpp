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
  bool pending = false, failed = false;
};
// One RDP-thread source. TrySend must not block; true means a bounded consumer
// copied the borrowed bytes. False preserves credit for a later call.
// Not installed by the worker until its bounded transport owner is available.
class PcmPublisher {
public:
  using TrySend = std::function<bool(ipc::Kind, std::span<const std::uint8_t>)>;
  explicit PcmPublisher(RdpsndSink &, std::uint64_t previous_epoch = 0);
  PublishStatus pump(std::uint64_t worker_time_us, const TrySend &) noexcept;
  bool reset() noexcept;
  std::optional<PublisherStats> stats() const noexcept;

private:
  struct Storage {
    std::array<std::uint8_t, ipc::audio::packet_bytes> packet{};
    std::array<std::uint8_t, ipc::audio::config_bytes> config{};
  };
  RdpsndSink &source_;
  std::unique_ptr<Storage> bytes_;
  const std::thread::id thread_;
  std::uint64_t epoch_, observed_us_ = 0, source_revision_ = 0;
  bool observed_ = false, new_epoch_ = true, config_required_ = false, pending_ = false;
  bool busy_ = false, failed_ = false;
  PublisherStats stats_;
  bool on_thread() const noexcept;
  void discard() noexcept;
};
} // namespace bridge::audio
