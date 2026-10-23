#include "dvc_completion_hook.hpp"
#include "../audio/audin_ingress.hpp"
#include "../audio/svc_ingress.hpp"
#include "gfx_message_gate.hpp"
#include <exception>
#include <stdexcept>
#include <type_traits>
#include <winpr/error.h>
#include <winpr/stream.h>

namespace bridge::channels {
DvcCompletionHook::DvcCompletionHook(DvcMessageBudget &budget, std::uint32_t channel,
                                     IWTSVirtualChannelCallback &original, Clock clock,
                                     void *clock_context, DvcPayload payload,
                                     DvcAllocationLimits allocations)
    : box_{{}, this}, budget_(budget), channel_(channel), original_(&original), clock_(clock),
      clock_context_(clock_context), payload_(payload) {
  static_assert(std::is_standard_layout_v<Box>);
  if (!clock || !original.OnDataReceived || !allocations.valid() ||
      (payload != DvcPayload::opaque && payload != DvcPayload::graphics &&
       payload != DvcPayload::audio && payload != DvcPayload::microphone))
    throw std::invalid_argument("Invalid DVC completion hook");
  if (payload == DvcPayload::graphics)
    graphics_ = std::make_unique<media::GfxMessageGate>(allocations);
  if (payload == DvcPayload::audio)
    audio_ = std::make_unique<audio::AudioSvcIngress>([this](auto bytes) {
      wStream view{};
      if (!Stream_StaticConstInit(&view, bytes.data(), bytes.size())) {
        audio_status_ = ERROR_INVALID_DATA;
        return false;
      }
      audio_status_ = original_->OnDataReceived(original_, &view);
      return audio_status_ == CHANNEL_RC_OK;
    });
  box_.api.OnOpen = on_open;
  box_.api.OnDataReceived = on_data;
  box_.api.OnClose = on_close;
  box_.api.pInterface = original.pInterface;
}
DvcCompletionHook::~DvcCompletionHook() {
  if (busy_ || (published_ && !closed_))
    std::terminate(); // Never leave a live host callback pointing into freed storage.
}
IWTSVirtualChannelCallback *DvcCompletionHook::interface() noexcept {
  published_ = true;
  return &box_.api;
}
DvcCompletionHook &DvcCompletionHook::owner(IWTSVirtualChannelCallback *p) noexcept {
  return *reinterpret_cast<Box *>(p)->owner; // Our own standard-layout public-API extension.
}
UINT DvcCompletionHook::fault() noexcept {
  failed_ = true;
  return ERROR_INVALID_DATA;
}
bool DvcCompletionHook::poll(std::uint64_t now) noexcept {
  if (closed_)
    return !failed_;
  if (audio_ && !audio_->poll(now))
    (void)fault();
  return !failed_;
}
bool DvcCompletionHook::observe() noexcept {
  try {
    (void)budget_.release(channel_, clock_(clock_context_));
    if (!budget_.stats().failed)
      return true; // Standalone DATA and already-retired global budget have no reservation.
  } catch (...) {
  }
  (void)fault();
  return false;
}
UINT DvcCompletionHook::on_open(IWTSVirtualChannelCallback *p) noexcept {
  auto &self = owner(p);
  if (self.closed_ || self.closing_ || self.failed_ || !self.original_)
    return ERROR_INVALID_STATE;
  if (self.busy_)
    return self.fault();
  self.busy_ = true;
  UINT status = CHANNEL_RC_OK;
  try {
    if (self.original_->OnOpen)
      status = self.original_->OnOpen(self.original_);
  } catch (...) {
    status = ERROR_INTERNAL_ERROR;
  }
  self.busy_ = false;
  if (status != CHANNEL_RC_OK)
    (void)self.fault();
  if (self.closing_)
    (void)self.finish_close();
  return self.failed_ ? (status == CHANNEL_RC_OK ? ERROR_INVALID_DATA : status) : status;
}
UINT DvcCompletionHook::on_data(IWTSVirtualChannelCallback *p, wStream *stream) noexcept {
  auto &self = owner(p);
  if (self.closed_ || self.closing_ || self.failed_ || !self.original_)
    return ERROR_INVALID_STATE;
  if (self.busy_ || !stream)
    return self.fault();
  self.busy_ = true;
  UINT status = CHANNEL_RC_OK;
  try {
    if (self.payload_ == DvcPayload::microphone &&
        Stream_GetRemainingLength(stream) > audio::AudinIngress::max_bytes) {
      status = ERROR_INVALID_DATA;
    } else if (self.audio_) {
      const auto size = Stream_GetRemainingLength(stream);
      const auto *bytes = static_cast<const BYTE *>(Stream_ConstPointer(stream));
      self.audio_status_ = CHANNEL_RC_OK;
      const auto accepted =
          (!size || bytes) &&
          self.audio_->receive({{bytes, size}, size, true, true}, self.clock_(self.clock_context_));
      status = accepted ? CHANNEL_RC_OK
                        : (self.audio_status_ == CHANNEL_RC_OK ? ERROR_INVALID_DATA
                                                               : self.audio_status_);
    } else {
      status = self.graphics_ ? self.graphics_->forward(*self.original_, *stream)
                              : self.original_->OnDataReceived(self.original_, stream);
    }
  } catch (...) {
    status = ERROR_INTERNAL_ERROR;
  }
  // This observes a complete host callback, including failed application delivery.
  // The host still owns/releases its stream after return; no allocator/RSS claim.
  if (!self.observe() || status != CHANNEL_RC_OK)
    (void)self.fault();
  self.busy_ = false;
  if (self.closing_)
    (void)self.finish_close();
  return self.failed_ ? (status == CHANNEL_RC_OK ? ERROR_INVALID_DATA : status) : status;
}
UINT DvcCompletionHook::finish_close() noexcept {
  if (closed_)
    return close_status_;
  // Snapshot before calling: the original OnClose can destroy its own callback.
  auto *original = original_;
  if (!original) {
    closing_ = closed_ = true;
    close_status_ = fault();
    return close_status_;
  }
  const auto callback = original->OnClose;
  original_ = nullptr;
  closing_ = closed_ = true;
  busy_ = true;
  UINT status = CHANNEL_RC_OK;
  if (graphics_ && graphics_->retire() != CHANNEL_RC_OK)
    (void)fault();
  if (audio_)
    audio_->close();
  try {
    if (callback)
      status = callback(original);
  } catch (...) {
    status = ERROR_INTERNAL_ERROR;
  }
  (void)observe();
  busy_ = false;
  if (status != CHANNEL_RC_OK)
    (void)fault();
  close_status_ = failed_ ? (status == CHANNEL_RC_OK ? ERROR_INVALID_DATA : status) : status;
  return close_status_;
}
UINT DvcCompletionHook::retire() noexcept {
  if (busy_) {
    closing_ = true;
    return ERROR_IO_PENDING;
  }
  if (closed_)
    return close_status_;
  closing_ = true;
  return finish_close();
}
UINT DvcCompletionHook::on_close(IWTSVirtualChannelCallback *p) noexcept {
  auto &self = owner(p);
  const auto status = self.retire();
  // A nested host close is deferred until the current borrowed callback returns.
  return status == ERROR_IO_PENDING ? CHANNEL_RC_OK : status;
}
} // namespace bridge::channels
