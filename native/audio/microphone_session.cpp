#include "microphone_session.hpp"
#include <limits>
#include <stdexcept>

namespace bridge::audio {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != UINT64_MAX)
    ++value;
}
} // namespace
MicrophoneSession::MicrophoneSession(rdpContext &context, CaptureStatePublisher::TrySend send,
                                     void *sender, std::uint64_t window)
    : registration_(context, source_), send_(send), sender_(sender),
      thread_(std::this_thread::get_id()), retire_window_us_(window) {
  if (!send || !sender || !context.instance || window < 20000 || window > 1000000)
    throw std::invalid_argument("Invalid microphone session owner");
  if (provider_.bind(context, source_, &registration_) != CHANNEL_RC_OK)
    throw std::runtime_error("Microphone provider binding failed");
}
bool MicrophoneSession::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
bool MicrophoneSession::observe(std::uint64_t now) noexcept {
  if ((observed_ && now < observed_us_) || now > UINT64_MAX - retire_window_us_) {
    increment(stats_.invalid_calls);
    return false;
  }
  observed_ = true;
  observed_us_ = now;
  return true;
}
CapturePublication MicrophoneSession::publish(std::uint64_t now, bool closing) noexcept {
  using ipc::audio::Availability;
  const auto source = source_.stats();
  if (!source)
    return CapturePublication::failed;
  auto availability = Availability::waiting;
  const auto phase = registration_.gate().phase();
  if (closing || source_.retired() || registration_.retired())
    availability = Availability::closed;
  else if (phase == AudinChannelPhase::failed)
    availability = Availability::failed;
  else if (phase == AudinChannelPhase::unsupported)
    availability = Availability::unavailable;
  else if (registration_.gate().ready())
    availability = Availability::ready;
  if (!publisher_.observe(availability, source->epoch, now))
    return CapturePublication::failed;
  return publisher_.publish(send_, sender_);
}
MicrophonePump MicrophoneSession::pump(std::uint64_t now) noexcept {
  if (!on_thread() || busy_ || stats_.retirement != MicrophoneRetirement::active || !observe(now))
    return MicrophonePump::invalid;
  if (stats_.publication_failed)
    return MicrophonePump::failed;
  busy_ = true;
  const auto publication = publish(now);
  if (publication == CapturePublication::failed) {
    stats_.publication_failed = true;
    stats_.close_status = registration_.gate().close();
    busy_ = false;
    return MicrophonePump::failed;
  }
  const auto authority = publisher_.published();
  const auto source = source_.stats();
  MicrophonePump result =
      publication == CapturePublication::busy ? MicrophonePump::blocked : MicrophonePump::idle;
  if (registration_.gate().phase() == AudinChannelPhase::failed)
    result = MicrophonePump::failed;
  else if (authority && source && authority->availability == ipc::audio::Availability::ready &&
           authority->epoch == source->epoch && registration_.gate().ready()) {
    const auto tick = registration_.gate().tick(now);
    if (tick == AudinScheduledStatus::delivered)
      result = MicrophonePump::delivered;
    else if (tick == AudinScheduledStatus::failed)
      result = MicrophonePump::failed;
  }
  busy_ = false;
  return result;
}
ipc::microphone::Result
MicrophoneSession::submit(const ipc::microphone::PcmPacket &packet) noexcept {
  using ipc::microphone::Result;
  if (!on_thread())
    return Result::unavailable;
  if (busy_)
    return Result::busy;
  if (stats_.retirement != MicrophoneRetirement::active || stats_.publication_failed)
    return Result::unavailable;
  const auto source = source_.stats();
  if (!source)
    return Result::unavailable;
  if (packet.epoch != source->epoch)
    return Result::stale;
  const auto authority = publisher_.published();
  if (!authority || authority->availability != ipc::audio::Availability::ready ||
      authority->epoch != source->epoch || !registration_.gate().ready())
    return Result::unavailable;
  switch (source_.submit({packet.epoch, packet.timestamp_us, packet.discontinuity, packet.pcm})) {
  case CaptureStatus::accepted:
    return Result::accepted;
  case CaptureStatus::stale:
    return Result::stale;
  case CaptureStatus::inactive:
    return Result::unavailable;
  case CaptureStatus::invalid:
    return Result::invalid;
  }
  return Result::invalid;
}
AudinCaptureReset MicrophoneSession::reset_capture(std::uint64_t expected) noexcept {
  if (!on_thread() || stats_.retirement != MicrophoneRetirement::active ||
      stats_.publication_failed)
    return {AudinCaptureResetStatus::inactive};
  if (busy_)
    return {AudinCaptureResetStatus::busy};
  return registration_.gate().reset_capture(expected);
}
MicrophoneRetirement MicrophoneSession::retire(std::uint64_t now) noexcept {
  if (!on_thread() || busy_)
    return MicrophoneRetirement::invalid;
  if (stats_.retirement == MicrophoneRetirement::done ||
      stats_.retirement == MicrophoneRetirement::failed ||
      stats_.retirement == MicrophoneRetirement::expired)
    return stats_.retirement;
  if (!observe(now))
    return MicrophoneRetirement::invalid;
  if (stats_.retirement == MicrophoneRetirement::pending && now >= retire_deadline_us_) {
    stats_.retirement = MicrophoneRetirement::expired;
    return stats_.retirement;
  }
  busy_ = true;
  if (stats_.retirement == MicrophoneRetirement::active) {
    stats_.retirement = MicrophoneRetirement::pending;
    retire_deadline_us_ = now + retire_window_us_;
    stats_.close_status = registration_.gate().close(); // Stop capture even below another scope.
  }
  if (!stats_.resources_retired) {
    increment(stats_.close_attempts);
    stats_.close_status = provider_.close();
    stats_.resources_retired = stats_.close_status == CHANNEL_RC_OK;
  }
  const auto publication =
      stats_.publication_failed ? CapturePublication::failed : publish(now, true);
  if (publication == CapturePublication::failed)
    stats_.publication_failed = true;
  if (stats_.resources_retired && publication != CapturePublication::busy) {
    (void)publisher_.retire();
    stats_.retirement =
        stats_.publication_failed ? MicrophoneRetirement::failed : MicrophoneRetirement::done;
  }
  busy_ = false;
  return stats_.retirement;
}
std::optional<ipc::microphone::State> MicrophoneSession::published_state() const noexcept {
  if (!on_thread() || busy_ || stats_.retirement != MicrophoneRetirement::active ||
      stats_.publication_failed)
    return {};
  return publisher_.published();
}
std::optional<MicrophoneSessionStats> MicrophoneSession::stats() const noexcept {
  if (!on_thread() || busy_)
    return {};
  const auto source = source_.stats();
  if (!source)
    return {};
  auto value = stats_;
  value.source = *source;
  value.publication = publisher_.stats();
  return value;
}
} // namespace bridge::audio
