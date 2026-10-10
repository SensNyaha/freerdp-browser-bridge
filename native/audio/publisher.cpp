#include "publisher.hpp"
#include <limits>
#include <stdexcept>

namespace bridge::audio {
namespace {
void increment(std::uint64_t &counter) noexcept {
  if (counter != (std::numeric_limits<std::uint64_t>::max)())
    ++counter;
}
} // namespace
PcmPublisher::PcmPublisher(RdpsndSink &source, TryDiscard discard_output,
                           std::uint64_t previous_epoch)
    : source_(source), discard_output_(std::move(discard_output)),
      bytes_(std::make_unique<Storage>()), thread_(std::this_thread::get_id()),
      epoch_(previous_epoch) {
  if (!source_.stats() || source_.retired() || !discard_output_)
    throw std::invalid_argument("Invalid PCM source owner");
}
bool PcmPublisher::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
void PcmPublisher::discard() noexcept {
  if (pending_)
    increment(stats_.reset_discarded_packets);
  pending_ = config_required_ = false;
  new_epoch_ = true;
  bytes_->packet.fill(0);
  bytes_->config.fill(0);
}
PublishStatus PcmPublisher::pump(std::uint64_t now, const TrySend &send) noexcept {
  if (!on_thread() || busy_)
    return PublishStatus::invalid;
  if (failed_)
    return PublishStatus::failed;
  if (!send)
    return PublishStatus::invalid;
  if ((observed_ && now < observed_us_) ||
      now > (std::numeric_limits<std::uint64_t>::max)() - ipc::audio::interval_us) {
    increment(stats_.invalid_clocks);
    return PublishStatus::invalid;
  }
  // Exhaustion is fatal before reading source samples; an epoch can never wrap/replay.
  if (epoch_ == (std::numeric_limits<std::uint64_t>::max)()) {
    failed_ = true;
    discard();
    return PublishStatus::failed;
  }
  observed_ = true;
  observed_us_ = now;
  const auto revision = source_.stream_revision();
  if (!revision || *revision == (std::numeric_limits<std::uint64_t>::max)()) {
    failed_ = true;
    discard();
    return PublishStatus::failed;
  }
  if (*revision != source_revision_) {
    discard();
    source_revision_ = *revision;
    reset_required_ = true;
  }
  busy_ = true;
  PublishStatus result = PublishStatus::idle;
  try {
    if (reset_required_) {
      if (discard_output_()) {
        reset_required_ = false;
        increment(stats_.consumer_resets);
      } else {
        increment(stats_.blocked_calls);
        busy_ = false;
        return PublishStatus::blocked;
      }
    }
    if (!source_.ready()) {
      discard();
      busy_ = false;
      return PublishStatus::idle;
    }
    // Capture before flushing so a blocked old packet cannot precede fresh state.
    const auto captured = source_.packet(now);
    if (captured.status == PacketStatus::invalid)
      throw ipc::ProtocolError();
    if (captured.status == PacketStatus::ready) {
      bool discontinuity = captured.discontinuity;
      if (new_epoch_ || discontinuity) {
        ++epoch_;
        bytes_->config = ipc::audio::encode_config({epoch_});
        config_required_ = true;
        new_epoch_ = false;
        discontinuity = true;
      }
      if (pending_) {
        increment(stats_.replaced_packets);
        discontinuity = true;
      }
      bytes_->packet = ipc::audio::encode_packet(
          {epoch_, captured.timestamp_us, static_cast<std::uint16_t>(captured.frames),
           static_cast<std::uint16_t>(captured.silence_frames), discontinuity, captured.bytes});
      pending_ = true;
      increment(stats_.captured_packets);
    }
    if (pending_) {
      if (config_required_ && !send(ipc::Kind::audio_config, bytes_->config)) {
        increment(stats_.blocked_calls);
        result = PublishStatus::blocked;
      } else {
        if (config_required_) {
          config_required_ = false;
          increment(stats_.sent_configs);
        }
        if (!send(ipc::Kind::audio_pcm, bytes_->packet)) {
          increment(stats_.blocked_calls);
          result = PublishStatus::blocked;
        } else {
          pending_ = false;
          increment(stats_.sent_packets);
          result = PublishStatus::sent;
        }
      }
    }
  } catch (...) {
    failed_ = true;
    discard();
    reset_required_ = true;
    result = PublishStatus::failed;
  }
  busy_ = false;
  return result;
}
bool PcmPublisher::reset() noexcept {
  if (!on_thread() || busy_ || failed_)
    return false;
  discard();
  reset_required_ = true;
  return source_.reset_stream();
}
std::optional<PublisherStats> PcmPublisher::stats() const noexcept {
  if (!on_thread())
    return {};
  auto result = stats_;
  result.pending = pending_;
  result.reset_pending = reset_required_;
  result.failed = failed_;
  return result;
}
} // namespace bridge::audio
