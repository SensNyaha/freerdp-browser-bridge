#pragma once
#include "rdpsnd_sink.hpp"
#include <freerdp/addin.h>

namespace bridge::audio {
// Scoped loader for the exact rdpsnd/browser public device ABI. No worker activation.
// Context and sink wrapper must outlive the host's eventual device Free.
class RdpsndProvider {
  static std::atomic<RdpsndProvider *> active_;
  rdpContext *context_ = nullptr;
  RdpsndSink *sink_ = nullptr;
  FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN previous_ = nullptr;
  std::thread::id thread_;
  bool bound_ = false, loading_ = false, entering_ = false, attempted_ = false, used_ = false;
  bool on_thread() const noexcept;
  static PVIRTUALCHANNELENTRY load(LPCSTR, LPCSTR, LPCSTR, DWORD) noexcept;
  static UINT VCAPITYPE entry(PFREERDP_RDPSND_DEVICE_ENTRY_POINTS) noexcept;
  static UINT VCAPITYPE denied(PFREERDP_RDPSND_DEVICE_ENTRY_POINTS) noexcept;

public:
  RdpsndProvider() noexcept = default;
  RdpsndProvider(const RdpsndProvider &) = delete;
  RdpsndProvider &operator=(const RdpsndProvider &) = delete;
  ~RdpsndProvider();
  UINT bind(rdpContext &, RdpsndSink &) noexcept;
  UINT close() noexcept;
};
} // namespace bridge::audio
