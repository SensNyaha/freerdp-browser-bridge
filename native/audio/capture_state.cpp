#include "capture_state.hpp"
#include <exception>
#include <limits>

namespace bridge::audio {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
} // namespace
CaptureStatePublisher::~CaptureStatePublisher() {
  if (busy_)
    std::terminate();
}
bool CaptureStatePublisher::observe(ipc::audio::Availability availability, std::uint64_t epoch,
                                    std::uint64_t now) noexcept {
  if (busy_ || retired_ || failed_ || (observed_ && now < *observed_) ||
      (desired_ && epoch < desired_->epoch))
    return false;
  const bool changed =
      !desired_ || availability != desired_->availability || epoch != desired_->epoch;
  if (changed && desired_ && desired_->revision == UINT64_MAX)
    return false;
  const auto revision = desired_ ? desired_->revision + (changed ? 1U : 0U) : 1;
  const ipc::microphone::State state{enabled_, availability, revision, epoch, now};
  try {
    (void)ipc::microphone::encode_state(state);
  } catch (const ipc::ProtocolError &) {
    return false;
  }
  observed_ = now;
  if (changed)
    desired_ = state;
  return true;
}
CapturePublication CaptureStatePublisher::publish(TrySend send, void *owner) noexcept {
  if (busy_)
    return CapturePublication::busy;
  if (retired_)
    return CapturePublication::inactive;
  if (failed_)
    return CapturePublication::failed;
  if (!desired_ || (published_ && published_->revision == desired_->revision))
    return CapturePublication::idle;
  const auto bytes =
      ipc::microphone::encode_state(*desired_); // Already validated; fixed stack body.
  bool accepted = false;
  busy_ = true;
  try {
    if (!send || !owner)
      failed_ = true;
    else
      accepted = send(owner, ipc::Kind::microphone_state, bytes);
  } catch (...) {
    failed_ = true; // Uncertain handoff: never replay this revision after an exception.
  }
  busy_ = false;
  if (failed_) {
    increment(stats_.failures);
    return CapturePublication::failed;
  }
  if (!accepted) {
    increment(stats_.backpressure);
    return CapturePublication::busy;
  }
  published_ = desired_;
  increment(stats_.published);
  return CapturePublication::published;
}
std::optional<ipc::microphone::State> CaptureStatePublisher::published() const noexcept {
  return failed_ || retired_ ? std::nullopt : published_;
}
bool CaptureStatePublisher::retire() noexcept {
  if (busy_)
    return false;
  retired_ = true;
  desired_.reset();
  published_.reset();
  return true;
}
} // namespace bridge::audio
