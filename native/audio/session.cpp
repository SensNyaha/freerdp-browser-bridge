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
                           std::uint64_t retire_window_us)
    : gate_(context, source_), publisher_(source_, std::move(discard), 0, 0),
      send_(std::move(send)), drain_(std::move(drain)), thread_(std::this_thread::get_id()),
      retire_window_us_(retire_window_us) {
  if (!send_ || !context.instance || retire_window_us_ < ipc::audio::interval_us ||
      retire_window_us_ > 1000000)
    throw std::invalid_argument("Invalid audio session owner");
  if (!drain_)
    drain_ = [&context] {
      return freerdp_channels_process_pending_messages(context.instance) == 1;
    };
  if (provider_.bind(context, source_, &gate_) != CHANNEL_RC_OK)
    throw std::runtime_error("Audio provider binding failed");
}
bool AudioSession::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
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
  const auto result = publisher_.pump(now, send_);
  if (result == PublishStatus::failed)
    stats_.publication_failed = true;
  busy_ = false;
  return result;
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
    // Publication must clear unsent PCM even while native confirmations drain.
    (void)source_.reset_stream(SourceAvailability::closed);
  }
  if (!stats_.resources_retired) {
    increment(stats_.close_attempts);
    stats_.close_status = provider_.close();
    stats_.resources_retired = stats_.close_status == CHANNEL_RC_OK;
  }
  const auto published = publisher_.pump(now, send_);
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
  const auto publisher = publisher_.stats();
  if (!source || !publisher)
    return {};
  result.source = *source;
  result.publisher = *publisher;
  return result;
}
} // namespace bridge::audio
