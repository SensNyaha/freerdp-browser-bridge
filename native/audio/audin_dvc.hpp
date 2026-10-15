#pragma once
#include "audin_ingress.hpp"
#include "audin_source.hpp"
#include "capture_cadence.hpp"
#include <freerdp/dvc.h>

namespace bridge::audio {
enum class AudinChannelPhase { closed, handshake, recording, unsupported, failed };
enum class AudinScheduledStatus { inactive, waiting, delivered, failed };
struct AudinNegotiationStats {
  std::uint64_t channels = 0, versions = 0, offers = 0, opens = 0, refused = 0;
  std::uint64_t recording = 0, failures = 0;
  std::uint32_t server_formats = 0, client_formats = 0;
};
// One serialized public DVC callback/endpoint owner, with no worker activation.
// Retire before plugin termination/thread join; wrapper outlives delayed OnClose.
class AudinDvcGate {
  template <class Api> struct Box {
    Api api{};
    AudinDvcGate *owner;
    explicit Box(AudinDvcGate *value) : owner(value) {}
  };
  Box<IWTSVirtualChannel> endpoint_{this};
  Box<IWTSVirtualChannelCallback> callback_{this};
  AudinSource &source_;
  AudinIngress ingress_;
  CaptureCadence cadence_;
  AudinNegotiationStats negotiation_;
  std::uint64_t scheduled_epoch_ = 0;
  IWTSVirtualChannel *transport_ = nullptr;
  IWTSVirtualChannelCallback *delegate_ = nullptr;
  std::thread::id thread_;
  std::atomic<bool> retired_{false};
  AudinChannelPhase phase_ = AudinChannelPhase::closed;
  std::optional<AudinPdu> pending_;
  std::array<std::uint16_t, AudinIngress::max_formats> channels_{};
  std::uint32_t index_ = 0, frames_ = 0;
  std::size_t data_bytes_ = 0;
  unsigned reply_ = 0;
  UINT close_result_ = CHANNEL_RC_OK, last_error_ = CHANNEL_RC_OK;
  bool used_ = false, receiving_ = false, writing_ = false, opening_ = false;
  bool closing_ = false, pumping_ = false, incoming_ = false, emitted_ = false;
  template <class Api> static AudinDvcGate &get(Api *) noexcept;
  bool on_thread() const noexcept;
  UINT fail(UINT) noexcept;
  UINT receive(wStream *) noexcept;
  UINT write(ULONG, const BYTE *, void *) noexcept;
  UINT opened() noexcept;

public:
  static constexpr std::uint32_t unsupported_open_result = 0x80070032U;
  explicit AudinDvcGate(AudinSource &,
                        AudinCaptureProfile = AudinCaptureProfile::compatibility) noexcept;
  AudinDvcGate(const AudinDvcGate &) = delete;
  AudinDvcGate &operator=(const AudinDvcGate &) = delete;
  ~AudinDvcGate();
  UINT open(rdpContext &, IWTSListenerCallback *, IWTSVirtualChannel *, BYTE *, BOOL *,
            IWTSVirtualChannelCallback **) noexcept;
  UINT close() noexcept;
  UINT retire() noexcept;
  bool retired() const noexcept { return retired_.load(std::memory_order_acquire); }
  bool quiescent() const noexcept;
  bool ready() const noexcept;
  AudinPumpStatus pump() noexcept;
  // RDP-owner poll: at most one pair; skipped deadlines discard old queued PCM.
  AudinScheduledStatus tick(std::uint64_t now_us) noexcept;
  AudinCaptureReset reset_capture(std::uint64_t expected_epoch) noexcept;
  std::optional<std::uint64_t> capture_deadline() const noexcept;
  std::optional<CaptureCadenceStats> cadence_stats() const noexcept;
  std::optional<AudinNegotiationStats> negotiation_stats() const noexcept;
  AudinChannelPhase phase() const noexcept;
  UINT last_error() const noexcept;
};
} // namespace bridge::audio
