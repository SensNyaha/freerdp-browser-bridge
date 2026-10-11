#pragma once
#include "microphone.hpp"
#include <optional>

namespace bridge::audio {
enum class CapturePublication { idle, published, busy, failed, inactive };
struct CaptureStateStats {
  std::uint64_t published = 0, backpressure = 0, failures = 0;
};
// Serialized RDP-owner status publisher. Only admitted metadata is authority;
// one latest candidate, no event FIFO. Caller must retire source on send fault.
class CaptureStatePublisher {
  const bool enabled_;
  std::optional<ipc::microphone::State> desired_, published_;
  std::optional<std::uint64_t> observed_;
  CaptureStateStats stats_;
  bool busy_ = false, failed_ = false, retired_ = false;

public:
  using TrySend = bool (*)(void *, ipc::Kind, std::span<const std::uint8_t>);
  explicit CaptureStatePublisher(bool enabled) noexcept : enabled_(enabled) {}
  CaptureStatePublisher(const CaptureStatePublisher &) = delete;
  CaptureStatePublisher &operator=(const CaptureStatePublisher &) = delete;
  ~CaptureStatePublisher();
  bool observe(ipc::audio::Availability, std::uint64_t epoch, std::uint64_t now_us) noexcept;
  CapturePublication publish(TrySend, void *owner) noexcept;
  std::optional<ipc::microphone::State> published() const noexcept;
  CaptureStateStats stats() const noexcept { return stats_; }
  bool retire() noexcept;
};
} // namespace bridge::audio
