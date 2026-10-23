#pragma once
#include "audio.hpp"
#include "audio_reset.hpp"
#include <functional>
#include <optional>

namespace bridge::audio {
struct ResetCompletion {
  std::uint64_t request_id;
  ipc::audio::ResetResult result;
};
// Externally serialized across control/producer threads. Observe only statuses
// already accepted by output. Service invokes the owner on its RDP thread.
class ResetControl {
public:
  static constexpr std::uint64_t window_us = 1000000;
  bool observe(const ipc::audio::State &) noexcept;
  // Empty result means one request was queued; otherwise reply immediately.
  std::optional<ipc::audio::ResetResult> enqueue(std::uint64_t request_id,
                                                 std::uint64_t expected_epoch, std::uint64_t now_us,
                                                 bool usable);
  std::optional<ResetCompletion> service(std::uint64_t now_us, bool usable,
                                         const std::function<bool()> &reset) noexcept;
  bool pending() const noexcept { return request_.has_value(); }

private:
  struct Request {
    std::uint64_t id, epoch, deadline;
  };
  std::optional<ipc::audio::State> state_;
  std::optional<Request> request_;
  std::uint64_t scheduled_epoch_ = 0;
  std::optional<ipc::audio::ResetResult> refusal(std::uint64_t, bool) const noexcept;
};
} // namespace bridge::audio
