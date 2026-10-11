#pragma once
#include "audin_ingress.hpp"
#include "audin_source.hpp"
#include <freerdp/dvc.h>

namespace bridge::audio {
enum class AudinChannelPhase { closed, handshake, recording, unsupported, failed };
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
  explicit AudinDvcGate(AudinSource &) noexcept;
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
  AudinChannelPhase phase() const noexcept;
  UINT last_error() const noexcept;
};
} // namespace bridge::audio
