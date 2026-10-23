#include "publisher.hpp"
#include <limits>
#include <stdexcept>

namespace bridge::audio {
namespace {
void increment(std::uint64_t &counter) noexcept {
  if (counter != (std::numeric_limits<std::uint64_t>::max)())
    ++counter;
}
ipc::audio::Availability availability(SourceAvailability source) {
  switch (source) {
  case SourceAvailability::waiting:
    return ipc::audio::Availability::waiting;
  case SourceAvailability::ready:
    return ipc::audio::Availability::ready;
  case SourceAvailability::suspended:
    return ipc::audio::Availability::suspended;
  case SourceAvailability::closed:
    return ipc::audio::Availability::closed;
  case SourceAvailability::failed:
    return ipc::audio::Availability::failed;
  case SourceAvailability::unavailable:
    return ipc::audio::Availability::unavailable;
  }
  throw ipc::ProtocolError();
}
} // namespace
PcmPublisher::PcmPublisher(RdpsndSink &source, TryDiscard discard_output,
                           std::uint64_t previous_epoch,
                           std::optional<std::uint64_t> previous_status_revision)
    : source_(source), discard_output_(std::move(discard_output)),
      bytes_(std::make_unique<Storage>()), thread_(std::this_thread::get_id()),
      epoch_(previous_epoch), state_revision_(previous_status_revision),
      state_pending_(previous_status_revision.has_value()) {
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
PublishStatus PcmPublisher::publish_state(std::uint64_t now, const TrySend &send) {
  if (!state_revision_)
    return PublishStatus::idle;
  const auto source = source_.stats();
  if (!source)
    throw ipc::ProtocolError();
  const auto current = availability(source->availability);
  // Reserve the next epoch without consuming it; fresh capture must use this identifier.
  const auto epoch = new_epoch_ ? epoch_ + 1 : epoch_;
  if (sent_availability_ == current && sent_state_epoch_ == epoch &&
      sent_source_revision_ == source->stream_revision) {
    state_pending_ = false;
    return PublishStatus::idle;
  }
  state_pending_ = true;
  bytes_->state = ipc::audio::encode_state({true, current, *state_revision_ + 1, epoch, now});
  if (!send(ipc::Kind::audio_state, bytes_->state)) {
    increment(stats_.blocked_calls);
    return PublishStatus::blocked;
  }
  ++*state_revision_;
  sent_availability_ = current;
  sent_state_epoch_ = epoch;
  sent_source_revision_ = source->stream_revision;
  state_pending_ = false;
  increment(stats_.sent_states);
  return PublishStatus::sent;
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
  if (epoch_ == (std::numeric_limits<std::uint64_t>::max)() ||
      (state_revision_ && *state_revision_ == (std::numeric_limits<std::uint64_t>::max)())) {
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
    const auto clear_output = [&] {
      if (!reset_required_)
        return true;
      if (discard_output_()) {
        reset_required_ = false;
        increment(stats_.consumer_resets);
        return true;
      }
      increment(stats_.blocked_calls);
      return false;
    };
    if (!clear_output()) {
      busy_ = false;
      return PublishStatus::blocked;
    }
    if (!source_.ready()) {
      discard();
      const auto status = publish_state(now, send);
      busy_ = false;
      return status;
    }
    // Capture before flushing so a blocked old packet cannot precede fresh state.
    const auto captured = source_.packet(now);
    if (captured.status == PacketStatus::invalid)
      throw ipc::ProtocolError();
    if (captured.status == PacketStatus::ready) {
      bool discontinuity = captured.discontinuity;
      if (new_epoch_ || discontinuity) {
        // A packetizer skip can change epoch without a source reset. Clear older
        // unsent consumer PCM before the new control status can overtake it.
        if (!new_epoch_)
          reset_required_ = true;
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
    if (!clear_output()) {
      busy_ = false;
      return PublishStatus::blocked;
    }
    result = publish_state(now, send);
    if (result == PublishStatus::blocked) {
      busy_ = false;
      return result;
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
  state_pending_ = state_revision_.has_value();
  return source_.reset_stream();
}
std::optional<PublisherStats> PcmPublisher::stats() const noexcept {
  if (!on_thread())
    return {};
  auto result = stats_;
  result.pending = pending_;
  result.reset_pending = reset_required_;
  result.state_pending = state_pending_;
  result.failed = failed_;
  return result;
}
} // namespace bridge::audio
