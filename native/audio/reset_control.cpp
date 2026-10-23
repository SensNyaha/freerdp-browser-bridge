#include "reset_control.hpp"
#include <limits>

namespace bridge::audio {
using ipc::audio::ResetResult;
bool ResetControl::observe(const ipc::audio::State &state) noexcept {
  try {
    (void)ipc::audio::encode_state(state);
  } catch (const ipc::ProtocolError &) {
    return false;
  }
  if (state_ && (state.enabled != state_->enabled || state.revision <= state_->revision ||
                 state.epoch < state_->epoch || state.timestamp_us < state_->timestamp_us))
    return false;
  state_ = state;
  return true;
}
std::optional<ResetResult> ResetControl::refusal(std::uint64_t epoch, bool usable) const noexcept {
  if (!usable || !state_ || !state_->enabled)
    return ResetResult::unavailable;
  if (epoch != state_->epoch)
    return ResetResult::stale;
  if (state_->availability != ipc::audio::Availability::ready ||
      epoch == (std::numeric_limits<std::uint64_t>::max)())
    return ResetResult::unavailable;
  if (epoch == scheduled_epoch_)
    return ResetResult::busy;
  return {};
}
std::optional<ResetResult> ResetControl::enqueue(std::uint64_t id, std::uint64_t epoch,
                                                 std::uint64_t now, bool usable) {
  if (!id || !epoch)
    throw ipc::ProtocolError();
  if (const auto result = refusal(epoch, usable))
    return result;
  if (request_ || now > (std::numeric_limits<std::uint64_t>::max)() - window_us)
    return ResetResult::busy;
  request_ = Request{id, epoch, now + window_us};
  return {};
}
std::optional<ResetCompletion> ResetControl::service(std::uint64_t now, bool usable,
                                                     const std::function<bool()> &reset) noexcept {
  if (!request_)
    return {};
  const auto request = *request_;
  request_.reset();
  auto result = refusal(request.epoch, usable);
  if (!result && (now < request.deadline - window_us || now >= request.deadline))
    result = ResetResult::busy;
  if (!result) {
    bool success = false;
    try {
      success = reset && reset();
    } catch (...) {
    }
    result = success ? ResetResult::scheduled : ResetResult::unavailable;
    if (success)
      scheduled_epoch_ = request.epoch;
  }
  return ResetCompletion{request.id, *result};
}
} // namespace bridge::audio
