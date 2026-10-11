#pragma once
#include "audin_plugin.hpp"
#include "audin_provider.hpp"
#include "capture_state.hpp"

namespace bridge::audio {
enum class MicrophonePump { idle, blocked, delivered, invalid, failed };
enum class MicrophoneRetirement { active, pending, done, invalid, expired, failed };
struct MicrophoneSessionStats {
  AudinSourceStats source;
  CaptureStateStats publication;
  std::uint64_t close_attempts = 0, invalid_calls = 0;
  UINT close_status = CHANNEL_RC_OK;
  MicrophoneRetirement retirement = MicrophoneRetirement::active;
  bool resources_retired = false, publication_failed = false;
};
// Construct/bind and call on RDP owner. Preserve wrapper through context Free /
// delayed host Terminated after retirement. Worker selection/IPC remain pending.
class MicrophoneSession {
  AudinSource source_;
  AudinRegistration registration_;
  AudinProvider provider_;
  CaptureStatePublisher publisher_{true};
  CaptureStatePublisher::TrySend send_;
  void *sender_;
  const std::thread::id thread_;
  const std::uint64_t retire_window_us_;
  std::uint64_t observed_us_ = 0, retire_deadline_us_ = 0;
  bool observed_ = false, busy_ = false;
  MicrophoneSessionStats stats_;
  bool on_thread() const noexcept;
  bool observe(std::uint64_t) noexcept;
  CapturePublication publish(std::uint64_t, bool closing = false) noexcept;

public:
  MicrophoneSession(rdpContext &, CaptureStatePublisher::TrySend, void *sender,
                    std::uint64_t retire_window_us = 1000000);
  MicrophoneSession(const MicrophoneSession &) = delete;
  MicrophoneSession &operator=(const MicrophoneSession &) = delete;
  MicrophonePump pump(std::uint64_t now_us) noexcept;
  ipc::microphone::Result submit(const ipc::microphone::PcmPacket &) noexcept;
  AudinCaptureReset reset_capture(std::uint64_t expected_epoch) noexcept;
  MicrophoneRetirement retire(std::uint64_t now_us) noexcept;
  std::optional<ipc::microphone::State> published_state() const noexcept;
  std::optional<std::uint64_t> capture_deadline() const noexcept;
  std::optional<MicrophoneSessionStats> stats() const noexcept;
};
} // namespace bridge::audio
