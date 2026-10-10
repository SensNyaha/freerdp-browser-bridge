#pragma once
#include "opus_audio.hpp"
#include "opus_encoder.hpp"
#include "publisher.hpp"

namespace bridge::audio {
struct OpusPublisherStats {
  PublisherStats source;
  std::uint64_t encoded_packets;
  std::size_t cached_bytes;
};
// Serialized preparatory owner. Reuses PCM capture/epoch/reset barriers and owns
// one encoded retry record. Not selected by the worker or its PCM-only queue.
class OpusPublisher final {
public:
  using TrySend = PcmPublisher::TrySend;
  using TryDiscard = PcmPublisher::TryDiscard;
  OpusPublisher(RdpsndSink &, TryDiscard, std::uint64_t previous_epoch = 0,
                std::uint64_t previous_status_revision = 0, OpusOptions options = {});
  PublishStatus pump(std::uint64_t worker_time_us, const TrySend &) noexcept;
  bool reset() noexcept;
  std::optional<OpusPublisherStats> stats() const noexcept;

private:
  TryDiscard discard_output_;
  std::unique_ptr<ipc::audio::opus::EncodedPacket> cached_;
  SoftwareOpusEncoder encoder_;
  std::optional<std::uint64_t> configured_epoch_;
  PcmPublisher source_;
  void clear() noexcept;
  bool send(ipc::Kind, std::span<const std::uint8_t>, const TrySend &);
};
} // namespace bridge::audio
