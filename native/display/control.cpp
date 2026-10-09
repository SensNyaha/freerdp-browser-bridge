#include "control.hpp"
#include <algorithm>
#include <freerdp/settings.h>
#include <winpr/error.h>

namespace bridge::display {
Control::~Control() { (void)unbind(); }
bool Control::on_thread() const noexcept {
  return !bound() || thread_ == std::this_thread::get_id();
}
bool Control::bind(rdpContext &base, DispClientContext *context) noexcept {
  if (bound() || !context || !context->handle || context->custom || context->DisplayControlCaps ||
      !context->SendMonitorLayout || !base.settings ||
      !freerdp_settings_get_bool(base.settings, FreeRDP_SupportDisplayControl) ||
      !freerdp_settings_get_bool(base.settings, FreeRDP_SynchronousDynamicChannels) ||
      freerdp_settings_get_bool(base.settings, FreeRDP_AsyncChannels) ||
      freerdp_settings_get_bool(base.settings, FreeRDP_AsyncUpdate))
    return false;
  context_ = context;
  thread_ = std::this_thread::get_id();
  context->custom = this;
  context->DisplayControlCaps = receive_caps;
  return true;
}
bool Control::unbind() noexcept {
  if (!on_thread())
    return false;
  if (context_) {
    context_->DisplayControlCaps = nullptr;
    context_->custom = nullptr;
    context_ = nullptr;
  }
  thread_ = {};
  capabilities_.reset();
  pending_.reset();
  // DVC rebind does not invalidate a desktop already observed through GDI.
  return true;
}
UINT Control::receive_caps(DispClientContext *context, UINT32 monitors, UINT32 factor_a,
                           UINT32 factor_b) noexcept {
  if (!context || !context->custom)
    return ERROR_INVALID_DATA;
  auto &self = *static_cast<Control *>(context->custom);
  if (self.context_ != context || !self.on_thread())
    return ERROR_INVALID_DATA;
  if (!monitors || !factor_a || !factor_b) {
    self.capabilities_.reset();
    self.pending_.reset();
    return CHANNEL_RC_OK; // No usable layout; keep an otherwise healthy desktop connected.
  }
  // MS-RDPEDISP: area = monitors * A * B. Saturate to our provider limit before
  // multiplying by the monitor count, so even three UINT32_MAX values cannot overflow.
  const auto per_monitor = (std::min)(std::uint64_t{factor_a} * factor_b, max_area);
  self.capabilities_ = Capabilities{monitors, (std::min)(per_monitor * monitors, max_area)};
  return CHANNEL_RC_OK;
}
std::optional<Size> Control::requested() const noexcept {
  return pending_ ? std::optional{pending_->size} : std::nullopt;
}
Request Control::request(Size size, Clock::time_point now) noexcept {
  if (size.width < DISPLAY_CONTROL_MIN_MONITOR_WIDTH || size.width > max_width ||
      size.height < DISPLAY_CONTROL_MIN_MONITOR_HEIGHT || size.height > max_height ||
      size.width % 2 || size.height % 2)
    return Request::invalid;
  if (!on_thread() || !ready())
    return Request::unavailable;
  if (std::uint64_t{size.width} * size.height > capabilities_->usable_area)
    return Request::invalid;
  if (pending_)
    return Request::busy;
  if (size == *actual_)
    return Request::unchanged;
  DISPLAY_CONTROL_MONITOR_LAYOUT layout{};
  layout.Flags = DISPLAY_CONTROL_MONITOR_PRIMARY;
  layout.Width = size.width;
  layout.Height = size.height;
  layout.DesktopScaleFactor = layout.DeviceScaleFactor = 100;
  // Unknown physical dimensions are zero; the server must ignore that pair.
  const auto deadline =
      now > (Clock::time_point::max)() - timeout ? (Clock::time_point::max)() : now + timeout;
  pending_ = Pending{size, deadline};
  if (context_->SendMonitorLayout(context_, 1, &layout) != CHANNEL_RC_OK) {
    pending_.reset();
    return Request::send_failed;
  }
  return Request::sent; // Only a subsequent desktop observation can confirm it.
}
bool Control::observe(Size size) noexcept {
  if (!on_thread() || !size.width || !size.height || size.width > 7680 || size.height > 4320)
    return false;
  actual_ = size;
  if (pending_ && pending_->size == size)
    pending_.reset();
  return true;
}
bool Control::expire(Clock::time_point now) noexcept {
  if (!on_thread() || !pending_ || now < pending_->deadline)
    return false;
  pending_.reset();
  return true;
}
} // namespace bridge::display
