#pragma once
#include "dvc_bounds.hpp"
#include "gfx_pdu_admission.hpp"
#include <freerdp/codec/zgfx.h>
#include <freerdp/dvc.h>
#include <memory>
#include <thread>

namespace bridge::media {
// Isolated synchronous owner. Production callback selection is a separate step.
class GfxMessageGate final {
  std::unique_ptr<ZGFX_CONTEXT, decltype(&zgfx_context_free)> codec_{nullptr, zgfx_context_free};
  const channels::DvcAllocationLimits allocations_;
  const GfxPduLimits pdus_;
  const std::thread::id thread_ = std::this_thread::get_id();
  bool busy_ = false, failed_ = false, retiring_ = false;
  UINT process(IWTSVirtualChannelCallback &, wStream &);

public:
  explicit GfxMessageGate(channels::DvcAllocationLimits = {}, GfxPduLimits = {});
  ~GfxMessageGate();
  GfxMessageGate(const GfxMessageGate &) = delete;
  GfxMessageGate &operator=(const GfxMessageGate &) = delete;
  [[nodiscard]] UINT forward(IWTSVirtualChannelCallback &, wStream &) noexcept;
  [[nodiscard]] UINT retire() noexcept;
  bool failed() const noexcept { return failed_; }
  bool retired() const noexcept { return retiring_ && !busy_ && !codec_; }
};
} // namespace bridge::media
