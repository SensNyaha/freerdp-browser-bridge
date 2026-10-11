#include "session.hpp"
#include <freerdp/channels/channels.h>
#include <limits>
#include <stdexcept>

namespace bridge::audio {
namespace {
void increment(std::uint64_t &counter) noexcept {
  if (counter != (std::numeric_limits<std::uint64_t>::max)())
    ++counter;
}
} // namespace
AudioSession::AudioSession(rdpContext &context, PcmPublisher::TrySend send,
                           PcmPublisher::TryDiscard discard, Drain drain,
                           std::uint64_t retire_window_us, ipc::OutputAudioCodec codec)
    : gate_(context, source_), send_(std::move(send)), drain_(std::move(drain)),
      thread_(std::this_thread::get_id()), retire_window_us_(retire_window_us), codec_(codec) {
  if (!send_ || !context.instance || retire_window_us_ < ipc::audio::interval_us ||
      retire_window_us_ > 1000000 ||
      (codec_ != ipc::OutputAudioCodec::pcm && codec_ != ipc::OutputAudioCodec::opus))
    throw std::invalid_argument("Invalid audio session owner");
  // Exactly one capture/publisher owner; PCM does not instantiate a codec SDK.
  if (codec_ == ipc::OutputAudioCodec::opus)
    opus_publisher_ = std::make_unique<OpusPublisher>(source_, std::move(discard));
  else
    pcm_publisher_ = std::make_unique<PcmPublisher>(source_, std::move(discard), 0, 0);
  if (!drain_)
    drain_ = [&context] {
      return freerdp_channels_process_pending_messages(context.instance) == 1;
    };
  if (provider_.bind(context, source_, &gate_) != CHANNEL_RC_OK)
    throw std::runtime_error("Audio provider binding failed");
}
bool AudioSession::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
PublishStatus AudioSession::publish(std::uint64_t now) noexcept {
  return pcm_publisher_ ? pcm_publisher_->pump(now, send_) : opus_publisher_->pump(now, send_);
}
bool AudioSession::observe(std::uint64_t now) noexcept {
  if ((observed_ && now < observed_us_) ||
      now > (std::numeric_limits<std::uint64_t>::max)() - retire_window_us_) {
    increment(stats_.invalid_calls);
    return false;
  }
  observed_ = true;
  observed_us_ = now;
  return true;
}
PublishStatus AudioSession::pump(std::uint64_t now) noexcept {
  if (!on_thread() || busy_ || stats_.retirement != RetireStatus::active || !observe(now))
    return PublishStatus::invalid;
  busy_ = true;
  const auto result = publish(now);
  if (result == PublishStatus::failed)
    stats_.publication_failed = true;
  busy_ = false;
  return result;
}
bool AudioSession::reset() noexcept {
  if (!on_thread() || busy_ || stats_.retirement != RetireStatus::active ||
      stats_.publication_failed || source_.retired())
    return false;
  busy_ = true;
  const bool reset = pcm_publisher_ ? pcm_publisher_->reset() : opus_publisher_->reset();
  busy_ = false;
  if (reset)
    increment(stats_.source_resets);
  return reset;
}
RetireStatus AudioSession::retire(std::uint64_t now) noexcept {
  if (!on_thread() || busy_)
    return RetireStatus::invalid;
  if (stats_.retirement == RetireStatus::done || stats_.retirement == RetireStatus::expired ||
      stats_.retirement == RetireStatus::failed)
    return stats_.retirement;
  if (!observe(now))
    return RetireStatus::invalid;
  if (stats_.retirement == RetireStatus::pending && now >= retire_deadline_us_) {
    stats_.retirement = RetireStatus::expired;
    return stats_.retirement;
  }
  busy_ = true;
  if (stats_.retirement == RetireStatus::active) {
    stats_.retirement = RetireStatus::pending;
    retire_deadline_us_ = now + retire_window_us_;
    // Publication clears unsent audio while native confirmations drain.
    (void)source_.reset_stream(SourceAvailability::closed);
  }
  if (!stats_.resources_retired) {
    increment(stats_.close_attempts);
    stats_.close_status = provider_.close();
    stats_.resources_retired = stats_.close_status == CHANNEL_RC_OK;
  }
  const auto published = publish(now);
  if (published == PublishStatus::failed || published == PublishStatus::invalid)
    stats_.publication_failed = true;
  if (stats_.resources_retired) {
    if (stats_.publication_failed)
      stats_.retirement = RetireStatus::failed;
    else if (published != PublishStatus::blocked)
      stats_.retirement = RetireStatus::done;
  } else {
    increment(stats_.drain_calls);
    bool drained = false;
    try {
      drained = drain_();
    } catch (...) {
    }
    // Closed-handle cancellation can report failure after delivering completions.
    // The next owner call must recheck provider ownership, regardless of this result.
    if (!drained)
      increment(stats_.drain_failures);
  }
  busy_ = false;
  return stats_.retirement;
}
std::optional<SessionStats> AudioSession::stats() const noexcept {
  if (!on_thread())
    return {};
  auto result = stats_;
  const auto source = source_.stats();
  if (!source)
    return {};
  result.source = *source;
  result.codec = codec_;
  if (pcm_publisher_) {
    const auto publisher = pcm_publisher_->stats();
    if (!publisher)
      return {};
    result.publisher = *publisher;
  } else {
    const auto publisher = opus_publisher_->stats();
    if (!publisher)
      return {};
    result.publisher = publisher->source;
    result.opus_encoded_packets = publisher->encoded_packets;
    result.opus_cached_bytes = publisher->cached_bytes;
  }
  return result;
}
} // namespace bridge::audio
