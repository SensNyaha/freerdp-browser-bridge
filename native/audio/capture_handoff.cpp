#include "../compat/span.hpp"
#include "capture_handoff.hpp"
#include <algorithm>
#include <exception>
#include <limits>

namespace bridge::audio {
using ipc::microphone::Result;
namespace {
std::size_t capacity(CaptureCodec codec) {
  switch (codec) {
  case CaptureCodec::pcm:
    return ipc::audio::pcm_bytes;
  case CaptureCodec::opus:
    return ipc::audio::opus::max_payload_bytes;
  }
  throw ipc::ProtocolError();
}
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
CaptureHandoff::CaptureHandoff(CaptureCodec codec)
    : codec_(codec), capacity_(capacity(codec)),
      bytes_(std::make_unique<std::uint8_t[]>(capacity_)) {}
CaptureHandoff::~CaptureHandoff() {
  if (servicing_)
    std::terminate(); // Borrowed bytes require caller to preserve owner lifetime.
  std::fill_n(bytes_.get(), capacity_, 0);
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
                                              ::bridge::compat::span<const std::uint8_t> payload,
                                              std::uint64_t now, std::uint64_t epoch, bool ready) {
  if (!id)
    throw ipc::ProtocolError();
  Request request{id, 0, 0, now, false};
  ::bridge::compat::span<const std::uint8_t> input;
  // Decode only the selected grammar and bound before copying the sole slot.
  if (codec_ == CaptureCodec::pcm) {
    const auto packet = ipc::microphone::decode_pcm(payload);
    request.epoch = packet.epoch;
    request.timestamp = packet.timestamp_us;
    request.discontinuity = packet.discontinuity;
    input = packet.pcm;
  } else {
    const auto packet = ipc::microphone::opus::decode_packet(payload);
    request.epoch = packet.epoch;
    request.timestamp = packet.timestamp_us;
    request.discontinuity = packet.discontinuity;
    request.lookahead = packet.lookahead_frames;
    input = packet.encoded;
  }
  request.bytes = input.size();
  std::optional<Result> result;
  if (servicing_)
    result = Result::busy;
  else if (retired_)
    result = Result::unavailable;
  else
    result = refusal(request.epoch, epoch, ready);
  if (!result && (request_ || now > (std::numeric_limits<std::uint64_t>::max)() - window_us))
    result = Result::busy;
  if (result) {
    count(*result);
    return result;
  }
  std::copy(input.begin(), input.end(), bytes_.get());
  request_ = request;
  increment(stats_.queued);
  return {};
}
std::optional<CaptureCompletion> CaptureHandoff::service(std::uint64_t now, std::uint64_t epoch,
                                                         bool ready, Submit submit,
                                                         void *owner) noexcept {
  return service_impl(now, epoch, ready, submit, nullptr, owner);
}
std::optional<CaptureCompletion> CaptureHandoff::service_opus(std::uint64_t now,
                                                              std::uint64_t epoch, bool ready,
                                                              SubmitOpus submit,
                                                              void *owner) noexcept {
  return service_impl(now, epoch, ready, nullptr, submit, owner);
}
std::optional<CaptureCompletion> CaptureHandoff::service_impl(std::uint64_t now,
                                                              std::uint64_t epoch, bool ready,
                                                              Submit submit, SubmitOpus opus_submit,
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
      const auto input = ::bridge::compat::span<const std::uint8_t>(bytes_.get(), request.bytes);
      if (codec_ == CaptureCodec::pcm)
        result =
            submit && owner
                ? submit(owner, {request.epoch, request.timestamp, request.discontinuity, input})
                : Result::unavailable;
      else
        result = opus_submit && owner
                     ? opus_submit(owner, {request.epoch, request.timestamp, request.lookahead,
                                           request.discontinuity, input})
                     : Result::unavailable;
    } catch (...) {
      result = Result::unavailable;
    }
    servicing_ = false;
    if (static_cast<unsigned>(*result) > 4)
      result = Result::invalid;
  }
  std::fill_n(bytes_.get(), capacity_, 0); // Callback returned; borrowed bytes are no longer live.
  count(*result);
  return CaptureCompletion{request.id, *result};
}
bool CaptureHandoff::retire() noexcept {
  if (pending())
    return false;
  std::fill_n(bytes_.get(), capacity_, 0);
  retired_ = true;
  return true;
}
CaptureHandoffStats CaptureHandoff::stats() const noexcept {
  auto value = stats_;
  value.owned_bytes = pending() ? capacity_ : 0;
  return value;
}
} // namespace bridge::audio
