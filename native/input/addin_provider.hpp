#pragma once
#include "addin_scope.hpp"
#include "rdpei_plugin.hpp"
#include <freerdp/addin.h>

namespace bridge::touch {
// One process-wide provider scope, bound after client context creation, on the
// RDP thread. No concurrent provider/context changes or callbacks during close.
// Registration/context outlive this scope and the host's final plugin callback.
// close retires the registration before restoring the previously installed provider.
class AddinProvider {
  static std::atomic<AddinProvider *> active_;
  PluginRegistration *registration_ = nullptr;
  rdpContext *context_ = nullptr;
  channels::AddinScope scope_;
  std::thread::id thread_;
  bool bound_ = false, loading_ = false, entering_ = false;
  bool on_thread() const noexcept;
  static PVIRTUALCHANNELENTRY load(LPCSTR, LPCSTR, LPCSTR, DWORD) noexcept;
  static UINT VCAPITYPE entry(IDRDYNVC_ENTRY_POINTS *) noexcept;
  static UINT VCAPITYPE denied(IDRDYNVC_ENTRY_POINTS *) noexcept;

public:
  AddinProvider() noexcept = default;
  AddinProvider(const AddinProvider &) = delete;
  AddinProvider &operator=(const AddinProvider &) = delete;
  ~AddinProvider();
  UINT bind(rdpContext &, PluginRegistration &) noexcept;
  UINT close() noexcept;
};
} // namespace bridge::touch
