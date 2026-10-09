#pragma once
#include <cstdint>
#include <freerdp/dvc.h>
#include <freerdp/freerdp.h>
#include <optional>
#include <thread>

namespace bridge::touch {
enum class Phase { closed, handshake, running, suspended, failed };
struct Negotiated {
  std::uint32_t version;
  std::uint16_t contacts;
  bool operator==(const Negotiated &) const = default;
};
// A synchronous, single-channel public-DVC adapter. Owns the delegated callback
// until OnClose, not the plugin/transport. Its lifetime must cover host callbacks.
// Rebind only after the host has relinquished the previous callback. Close/destroy
// on the bound RDP thread, before plugin termination; no async channel/update mode.
// Transport readiness is NOT input readiness: contact/lease reset belongs to the owner.
class DvcGate {
  struct Endpoint {
    IWTSVirtualChannel api;
    DvcGate *owner;
  } endpoint_;
  struct Callbacks {
    IWTSVirtualChannelCallback api;
    DvcGate *owner;
  } callbacks_;
  IWTSVirtualChannel *transport_ = nullptr;
  IWTSVirtualChannelCallback *delegate_ = nullptr;
  std::thread::id thread_;
  Phase phase_ = Phase::closed;
  std::optional<Negotiated> negotiated_, candidate_;
  std::uint32_t expected_version_ = 0;
  std::uint64_t suppressed_ = 0;
  bool receiving_ = false, writing_ = false, opening_ = false, closing_ = false;
  bool ready_reply_ = false;
  bool on_thread() const noexcept;
  UINT fail(UINT error) noexcept;
  UINT receive(wStream *stream) noexcept;
  UINT write(ULONG size, const BYTE *bytes, void *reserved) noexcept;
  static UINT receive_callback(IWTSVirtualChannelCallback *, wStream *) noexcept;
  static UINT open_callback(IWTSVirtualChannelCallback *) noexcept;
  static UINT close_callback(IWTSVirtualChannelCallback *) noexcept;
  static UINT write_callback(IWTSVirtualChannel *, ULONG, const BYTE *, void *) noexcept;
  static UINT transport_close_callback(IWTSVirtualChannel *) noexcept;

public:
  static constexpr ULONG max_outbound_bytes = 8192;
  DvcGate() noexcept;
  DvcGate(const DvcGate &) = delete;
  DvcGate &operator=(const DvcGate &) = delete;
  ~DvcGate();
  UINT open(rdpContext &base, IWTSListenerCallback *listener, IWTSVirtualChannel *transport,
            BYTE *data, BOOL *accepted, IWTSVirtualChannelCallback **callback) noexcept;
  UINT close() noexcept;
  Phase phase() const noexcept { return on_thread() ? phase_ : Phase::closed; }
  bool ready() const noexcept { return on_thread() && phase_ == Phase::running; }
  bool quiescent() const noexcept {
    return on_thread() && !receiving_ && !writing_ && !opening_ && !closing_;
  }
  std::optional<Negotiated> negotiated() const noexcept {
    return on_thread() ? negotiated_ : std::nullopt;
  }
  std::uint64_t suppressed_frames() const noexcept { return on_thread() ? suppressed_ : 0; }
};
} // namespace bridge::touch
