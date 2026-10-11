#include "capture_handoff.hpp"
#include <algorithm>
#include <exception>
#include <limits>

namespace bridge::audio {
using ipc::microphone::Result;
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
std::optional<Result> refusal(std::uint64_t expected, std::uint64_t current, bool ready) noexcept {
  if (!ready || !current)
    return Result::unavailable;
  if (expected != current)
    return Result::stale;
  return {};
}
} // namespace
CaptureHandoff::CaptureHandoff()
    : pcm_(std::make_unique<std::array<std::uint8_t, ipc::audio::pcm_bytes>>()) {}
CaptureHandoff::~CaptureHandoff() {
  if (servicing_)
    std::terminate(); // Borrowed bytes require caller to preserve owner lifetime.
  pcm_->fill(0);
}
void CaptureHandoff::count(Result result) noexcept {
  switch (result) {
  case Result::accepted:
    increment(stats_.accepted);
    break;
  case Result::stale:
    increment(stats_.stale);
    break;
  case Result::unavailable:
    increment(stats_.unavailable);
    break;
  case Result::busy:
    increment(stats_.busy);
    break;
  case Result::invalid:
    increment(stats_.invalid);
    break;
  }
}
std::optional<Result> CaptureHandoff::enqueue(std::uint64_t id,
                                              std::span<const std::uint8_t> payload,
                                              std::uint64_t now, std::uint64_t epoch, bool ready) {
  if (!id)
    throw ipc::ProtocolError();
  const auto packet = ipc::microphone::decode_pcm(payload); // Validate before copying slot.
  std::optional<Result> result;
  if (servicing_)
    result = Result::busy;
  else if (retired_)
    result = Result::unavailable;
  else
    result = refusal(packet.epoch, epoch, ready);
  if (!result && (request_ || now > (std::numeric_limits<std::uint64_t>::max)() - window_us))
    result = Result::busy;
  if (result) {
    count(*result);
    return result;
  }
  std::copy(packet.pcm.begin(), packet.pcm.end(), pcm_->begin());
  request_ = Request{id, packet.epoch, packet.timestamp_us, now, packet.discontinuity};
  increment(stats_.queued);
  return {};
}
std::optional<CaptureCompletion> CaptureHandoff::service(std::uint64_t now, std::uint64_t epoch,
                                                         bool ready, Submit submit,
                                                         void *owner) noexcept {
  if (servicing_ || !request_)
    return {};
  const auto request = *request_;
  request_.reset();
  auto result = refusal(request.epoch, epoch, ready && !retired_);
  if (!result && (now < request.admitted || now >= request.admitted + window_us)) {
    result = Result::busy;
    if (now >= request.admitted + window_us)
      increment(stats_.expired);
  }
  if (!result) {
    servicing_ = true;
    try {
      result = submit && owner
                   ? submit(owner, {request.epoch, request.timestamp, request.discontinuity, *pcm_})
                   : Result::unavailable;
    } catch (...) {
      result = Result::unavailable;
    }
    servicing_ = false;
    if (static_cast<unsigned>(*result) > 4)
      result = Result::invalid;
  }
  pcm_->fill(0); // Callback returned; never overwrite its borrowed bytes earlier.
  count(*result);
  return CaptureCompletion{request.id, *result};
}
bool CaptureHandoff::retire() noexcept {
  if (pending())
    return false;
  pcm_->fill(0);
  retired_ = true;
  return true;
}
CaptureHandoffStats CaptureHandoff::stats() const noexcept {
  auto value = stats_;
  value.owned_bytes = pending() ? pcm_->size() : 0;
  return value;
}
} // namespace bridge::audio
