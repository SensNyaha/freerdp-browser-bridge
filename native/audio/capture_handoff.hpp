#pragma once
#include "../compat/span.hpp"
#include "microphone.hpp"
#include "microphone_opus.hpp"
#include <memory>
#include <optional>

namespace bridge::audio {
struct CaptureCompletion {
  std::uint64_t request_id;
  ipc::microphone::Result result;
};
struct CaptureHandoffStats {
  std::uint64_t queued = 0, accepted = 0, stale = 0, unavailable = 0, busy = 0, invalid = 0;
  std::uint64_t expired = 0;
  std::size_t owned_bytes = 0;
};
enum class CaptureCodec { pcm, opus };
// Caller serializes producer/owner with its mutex. One 20 ms selected input slot;
// service callback is bounded/nonblocking on RDP owner, never retries samples.
class CaptureHandoff {
  struct Request {
    std::uint64_t id, epoch, timestamp, admitted;
    bool discontinuity;
    std::uint16_t lookahead = 0;
    std::size_t bytes = 0;
  };
  const CaptureCodec codec_;
  const std::size_t capacity_;
  std::unique_ptr<std::uint8_t[]> bytes_;
  std::optional<Request> request_;
  CaptureHandoffStats stats_;
  bool servicing_ = false, retired_ = false;
  void count(ipc::microphone::Result) noexcept;

public:
  static constexpr std::uint64_t window_us = 20000;
  using Submit = ipc::microphone::Result (*)(void *, const ipc::microphone::PcmPacket &);
  using SubmitOpus = ipc::microphone::Result (*)(void *, const ipc::microphone::opus::Packet &);

private:
  std::optional<CaptureCompletion> service_impl(std::uint64_t, std::uint64_t, bool, Submit,
                                                SubmitOpus, void *) noexcept;

public:
  explicit CaptureHandoff(CaptureCodec = CaptureCodec::pcm);
  CaptureHandoff(const CaptureHandoff &) = delete;
  CaptureHandoff &operator=(const CaptureHandoff &) = delete;
  ~CaptureHandoff();
  // Empty means queued, not accepted by AUDIN. Otherwise reply immediately.
  std::optional<ipc::microphone::Result> enqueue(std::uint64_t id,
                                                 ::bridge::compat::span<const std::uint8_t> payload,
                                                 std::uint64_t now_us, std::uint64_t current_epoch,
                                                 bool ready);
  std::optional<CaptureCompletion> service(std::uint64_t now_us, std::uint64_t current_epoch,
                                           bool ready, Submit, void *owner) noexcept;
  std::optional<CaptureCompletion> service_opus(std::uint64_t now_us, std::uint64_t current_epoch,
                                                bool ready, SubmitOpus, void *owner) noexcept;
  // Drain pending with service(ready=false) first; active callback cannot retire.
  bool retire() noexcept;
  bool pending() const noexcept { return servicing_ || request_.has_value(); }
  CaptureHandoffStats stats() const noexcept;
};
} // namespace bridge::audio
