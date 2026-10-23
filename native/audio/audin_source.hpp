#pragma once
#include "capture.hpp"
#include <atomic>
#include <freerdp/client/audin.h>
#include <thread>
#include <winpr/wtsapi.h>

namespace bridge::audio {
enum class AudinPumpStatus { delivered, inactive, invalid, failed };
enum class AudinCaptureResetStatus { reset, stale, inactive, busy, invalid, exhausted, failed };
struct AudinCaptureReset {
  AudinCaptureResetStatus status;
  std::uint64_t epoch = 0;
};
struct AudinSourceStats {
  CaptureStats capture;
  std::uint64_t epoch = 0, callbacks = 0, emitted_frames = 0, callback_failures = 0;
  std::uint64_t capture_resets = 0;
  UINT last_error = CHANNEL_RC_OK;
  bool opened = false;
};
// Public device ABI adapter only; no host microphone, channel registration or
// worker activation. One serialized RDP owner determines callback pacing.
// Retire on that owner before joining; wrapper survives delayed host Free.
class AudinSource {
  struct Device : IAudinDevice {
    AudinSource *owner;
    explicit Device(AudinSource *value) : IAudinDevice{}, owner(value) {}
  } device_{this};
  std::unique_ptr<PcmCaptureSource> capture_;
  std::thread::id thread_;
  std::atomic<bool> retired_{false};
  AudinSourceStats stats_;
  AUDIO_FORMAT format_{};
  AudinReceive receive_ = nullptr;
  void *user_ = nullptr;
  bool busy_ = false;
  bool usable() const noexcept;
  static AudinSource *owner(IAudinDevice *) noexcept;
  static BOOL supported(IAudinDevice *, const AUDIO_FORMAT *) noexcept;
  static UINT set_format(IAudinDevice *, const AUDIO_FORMAT *, UINT32) noexcept;
  static UINT open(IAudinDevice *, AudinReceive, void *) noexcept;
  static UINT close(IAudinDevice *) noexcept;
  static UINT free(IAudinDevice *) noexcept;
  void stop() noexcept;

public:
  AudinSource();
  AudinSource(const AudinSource &) = delete;
  AudinSource &operator=(const AudinSource &) = delete;
  ~AudinSource();
  IAudinDevice &device() noexcept { return device_; }
  CaptureStatus submit(const CapturePacket &) noexcept;
  CaptureStatus skip(std::uint64_t frames) noexcept;
  // Wipe old input and advance epoch without replacing the open AUDIN receiver.
  // Caller owns permission/lease checks; this is not a public/browser command.
  AudinCaptureReset reset_capture(std::uint64_t expected_epoch) noexcept;
  AudinPumpStatus pump() noexcept;
  std::optional<AudinSourceStats> stats() const noexcept;
  bool retire() noexcept;
  bool retired() const noexcept { return retired_.load(std::memory_order_acquire); }
};
} // namespace bridge::audio
