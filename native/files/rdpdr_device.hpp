#pragma once
#include "drive.hpp"
#include "../channels/addin_scope.hpp"
#include "rdpdr_wire.hpp"
#include <atomic>
#include <freerdp/channels/rdpdr.h>
#include <freerdp/freerdp.h>
#include <freerdp/dvc.h>
#include <freerdp/svc.h>

namespace bridge::files::rdpdr {
// Public FreeRDP DEVICE/IRP adapter. Scopes are already policy-bound; no path
// from an RDPDR_DRIVE setting is opened by this adapter. The caller serializes
// SDK registration/channel callbacks and joins them before context destruction.
// Keep this object alive THROUGH the SDK's final DEVICE::Free callbacks.
class Registration {
  struct Impl;
  std::unique_ptr<Impl> impl_;

public:
  Registration(rdpContext &, std::shared_ptr<DriveSession>, std::vector<std::string> names);
  ~Registration();
  Registration(const Registration &) = delete;
  Registration &operator=(const Registration &) = delete;
  UINT install(PDEVICE_SERVICE_ENTRY_POINTS) noexcept;
  bool released() const noexcept;
  bool for_context(const rdpContext &) const noexcept;
};
class StaticGate;
// Context-bound loader override for the drive device-service and guarded RDPDR
// static ABI. RDPDR is refused without a gate; other addins delegate unchanged.
// Close in reverse provider bind order;
// registered SDK DEVICE objects outlive this loader scope through Registration.
class Provider {
  static std::atomic<Provider *> active_;
  channels::AddinScope scope_;
  Registration *registration_ = nullptr;
  StaticGate *gate_ = nullptr;
  PVIRTUALCHANNELENTRYEX channel_delegate_ = nullptr;
  std::thread::id thread_;
  bool bound_ = false, entering_ = false, loading_ = false;
  bool channel_attempted_ = false;
  static PVIRTUALCHANNELENTRY load(LPCSTR, LPCSTR, LPCSTR, DWORD) noexcept;
  static UINT VCAPITYPE enter(PDEVICE_SERVICE_ENTRY_POINTS) noexcept;
  static UINT VCAPITYPE denied(PDEVICE_SERVICE_ENTRY_POINTS) noexcept;
  static BOOL VCAPITYPE legacy_denied(PCHANNEL_ENTRY_POINTS) noexcept;
  static BOOL VCAPITYPE channel_denied(PCHANNEL_ENTRY_POINTS_EX, LPVOID) noexcept;
  static BOOL VCAPITYPE channel_entry(PCHANNEL_ENTRY_POINTS_EX, LPVOID) noexcept;
  static UINT VCAPITYPE dynamic_denied(IDRDYNVC_ENTRY_POINTS *) noexcept;

public:
  Provider() = default;
  ~Provider();
  Provider(const Provider &) = delete;
  Provider &operator=(const Provider &) = delete;
  UINT bind(rdpContext &, Registration &, StaticGate * = nullptr) noexcept;
  UINT close() noexcept;
};
class ReceiveGuard {
public:
  using Resolve = UINT16 (*)(freerdp *);
  ReceiveGuard(freerdp &, pReceiveChannelData, Resolve = resolve_channel);
  bool receive(UINT16, const BYTE *, std::size_t, UINT32, std::size_t, std::uint64_t) noexcept;
  bool poll(std::uint64_t) noexcept;
  void close() noexcept;
  static UINT16 resolve_channel(freerdp *);

private:
  freerdp &instance_;
  const pReceiveChannelData delegate_;
  const Resolve resolve_;
  Ingress ingress_;
  UINT16 channel_ = 0;
  bool busy_ = false, failed_ = false, closed_ = false;
  bool fail() noexcept;
};
} // namespace bridge::files::rdpdr
