#pragma once
#include "rdpsnd_sink.hpp"
#include <freerdp/addin.h>
#include <freerdp/client/drdynvc.h>

namespace bridge::audio {
class AudioStaticGate;
// Scoped loader for the exact rdpsnd/browser public device ABI. No worker activation.
// Context and sink wrapper must outlive the host's eventual device Free.
class RdpsndProvider {
  static std::atomic<RdpsndProvider *> active_;
  rdpContext *context_ = nullptr;
  RdpsndSink *sink_ = nullptr;
  AudioStaticGate *gate_ = nullptr;
  PVIRTUALCHANNELENTRYEX channel_delegate_ = nullptr;
  FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN previous_ = nullptr;
  std::thread::id thread_;
  bool bound_ = false, loading_ = false, entering_ = false, attempted_ = false, used_ = false;
  bool channel_attempted_ = false;
  bool on_thread() const noexcept;
  static PVIRTUALCHANNELENTRY load(LPCSTR, LPCSTR, LPCSTR, DWORD) noexcept;
  static UINT VCAPITYPE entry(PFREERDP_RDPSND_DEVICE_ENTRY_POINTS) noexcept;
  static UINT VCAPITYPE denied(PFREERDP_RDPSND_DEVICE_ENTRY_POINTS) noexcept;
  static BOOL VCAPITYPE channel_entry(PCHANNEL_ENTRY_POINTS_EX, LPVOID) noexcept;
  static BOOL VCAPITYPE channel_denied(PCHANNEL_ENTRY_POINTS_EX, LPVOID) noexcept;
  static BOOL VCAPITYPE legacy_denied(PCHANNEL_ENTRY_POINTS) noexcept;
  static UINT VCAPITYPE dynamic_denied(IDRDYNVC_ENTRY_POINTS *) noexcept;

public:
  RdpsndProvider() noexcept = default;
  RdpsndProvider(const RdpsndProvider &) = delete;
  RdpsndProvider &operator=(const RdpsndProvider &) = delete;
  ~RdpsndProvider();
  UINT bind(rdpContext &, RdpsndSink &, AudioStaticGate * = nullptr) noexcept;
  UINT close() noexcept;
};
} // namespace bridge::audio
