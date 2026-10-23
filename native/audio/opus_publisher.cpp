#include "../compat/span.hpp"
#include "opus_publisher.hpp"
#include <stdexcept>

namespace bridge::audio {
OpusPublisher::OpusPublisher(RdpsndSink &sink, TryDiscard discard_output,
                             std::uint64_t previous_epoch, std::uint64_t previous_status_revision,
                             OpusOptions options)
    : discard_output_(std::move(discard_output)),
      cached_(std::make_unique<ipc::audio::opus::EncodedPacket>()), encoder_(options),
      source_(
          sink,
          [this] {
            if (!discard_output_())
              return false;
            clear();
            configured_epoch_.reset();
            return true;
          },
          previous_epoch, previous_status_revision) {
  if (!discard_output_)
    throw std::invalid_argument("Invalid Opus source owner");
}
void OpusPublisher::clear() noexcept {
  cached_->storage.fill(0);
  cached_->size = 0;
}
bool OpusPublisher::send(ipc::Kind kind, ::bridge::compat::span<const std::uint8_t> bytes,
                         const TrySend &consumer) {
  if (kind == ipc::Kind::audio_state) {
    const auto state = ipc::audio::decode_state(bytes);
    const auto encoded = ipc::audio::opus::encode_state(state);
    return consumer(kind, encoded);
  }
  if (kind == ipc::Kind::audio_config) {
    const auto config = ipc::audio::decode_config(bytes);
    if (configured_epoch_ != config.epoch) {
      encoder_.reset();
      clear();
      configured_epoch_ = config.epoch;
    }
    const auto encoded =
        ipc::audio::opus::encode_config({config.epoch, encoder_.lookahead_frames()});
    return consumer(kind, encoded);
  }
  if (kind != ipc::Kind::audio_pcm)
    throw ipc::ProtocolError();
  // Validate whole PCM, including the exact zero-filled underflow tail, before
  // changing prediction. Compressed transport cannot revalidate that tail.
  const auto packet = ipc::audio::decode_packet(bytes);
  if (configured_epoch_ != packet.epoch)
    throw ipc::ProtocolError();
  if (cached_->size) {
    const auto previous = ipc::audio::opus::decode_packet(cached_->bytes());
    if (previous.epoch != packet.epoch || previous.timestamp_us != packet.timestamp_us)
      clear();
    else if (previous.frames != packet.frames || previous.silence_frames != packet.silence_frames ||
             previous.discontinuity != packet.discontinuity)
      throw ipc::ProtocolError();
  }
  if (!cached_->size) {
    const auto unit = encoder_.encode({packet.pcm, packet.timestamp_us, packet.discontinuity});
    *cached_ =
        ipc::audio::opus::encode_packet({packet.epoch, unit.timestamp_us, packet.frames,
                                         packet.silence_frames, unit.discontinuity, unit.bytes});
  }
  if (!consumer(ipc::Kind::audio_opus, cached_->bytes()))
    return false;
  clear();
  return true;
}
PublishStatus OpusPublisher::pump(std::uint64_t now, const TrySend &consumer) noexcept {
  if (!consumer)
    return PublishStatus::invalid;
  try {
    const auto result =
        source_.pump(now, [&](auto kind, auto bytes) { return send(kind, bytes, consumer); });
    if (result == PublishStatus::failed)
      clear();
    return result;
  } catch (...) {
    // Callback type-erasure construction can fail before the noexcept source
    // pump is entered. No source/codec state has changed in that case.
    return PublishStatus::invalid;
  }
}
bool OpusPublisher::reset() noexcept {
  if (!source_.reset())
    return false;
  clear();
  return true;
}
std::optional<OpusPublisherStats> OpusPublisher::stats() const noexcept {
  const auto source = source_.stats();
  if (!source)
    return {};
  return OpusPublisherStats{*source, encoder_.encoded_packets(), cached_->size};
}
} // namespace bridge::audio
