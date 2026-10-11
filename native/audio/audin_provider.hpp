#pragma once
#include "addin_scope.hpp"
#include "audin_source.hpp"
#include <freerdp/addin.h>
#include <freerdp/dvc.h>

namespace bridge::audio {
// Preparatory backend scope. AUDIN channel entry stays refused until a bounded
// DVC gate is installed. Context/source wrapper outlive delayed host termination.
class AudinProvider {
  static std::atomic<AudinProvider *> active_;
  channels::AddinScope scope_;
  rdpContext *context_ = nullptr;
  AudinSource *source_ = nullptr;
  std::thread::id thread_;
  bool bound_ = false, used_ = false, loading_ = false, entering_ = false;
  bool attempted_ = false;
  bool on_thread() const noexcept;
  static PVIRTUALCHANNELENTRY load(LPCSTR, LPCSTR, LPCSTR, DWORD) noexcept;
  static UINT VCAPITYPE entry(PFREERDP_AUDIN_DEVICE_ENTRY_POINTS) noexcept;
  static UINT VCAPITYPE denied(PFREERDP_AUDIN_DEVICE_ENTRY_POINTS) noexcept;
  static UINT VCAPITYPE dynamic_denied(IDRDYNVC_ENTRY_POINTS *) noexcept;
  static BOOL VCAPITYPE static_denied(PCHANNEL_ENTRY_POINTS) noexcept;
  static BOOL VCAPITYPE static_ex_denied(PCHANNEL_ENTRY_POINTS_EX, LPVOID) noexcept;

public:
  AudinProvider() noexcept = default;
  AudinProvider(const AudinProvider &) = delete;
  AudinProvider &operator=(const AudinProvider &) = delete;
  ~AudinProvider();
  UINT bind(rdpContext &, AudinSource &) noexcept;
  UINT close() noexcept;
};
} // namespace bridge::audio
