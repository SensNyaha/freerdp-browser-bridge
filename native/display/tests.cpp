#include "control.hpp"
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <freerdp/settings.h>
#include <limits>
#include <memory>
#include <winpr/error.h>
using namespace bridge::display;
using Clock = std::chrono::steady_clock;
namespace {
struct Fixture {
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{
      nullptr, freerdp_client_context_free};
  DispClientContext channel{};
  Control control;
  UINT send_status = CHANNEL_RC_OK;
  UINT32 writes = 0, count = 0;
  DISPLAY_CONTROL_MONITOR_LAYOUT layout{};
  explicit Fixture(bool bind = true) {
    RDP_CLIENT_ENTRY_POINTS entry{};
    entry.Size = sizeof(entry);
    entry.Version = RDP_CLIENT_INTERFACE_VERSION;
    entry.ContextSize = sizeof(rdpClientContext);
    context.reset(freerdp_client_context_new(&entry));
    REQUIRE(context);
    boolean(FreeRDP_SupportDisplayControl, TRUE);
    boolean(FreeRDP_SynchronousDynamicChannels, TRUE);
    boolean(FreeRDP_AsyncChannels, FALSE);
    boolean(FreeRDP_AsyncUpdate, FALSE);
    channel.handle = this; // Replaces the transport write only, not bridge callbacks/state.
    channel.SendMonitorLayout = [](DispClientContext *c, UINT32 monitors,
                                   DISPLAY_CONTROL_MONITOR_LAYOUT *layouts) -> UINT {
      auto &f = *static_cast<Fixture *>(c->handle);
      ++f.writes;
      f.count = monitors;
      if (monitors == 1 && layouts)
        f.layout = layouts[0];
      return f.send_status;
    };
    if (bind)
      REQUIRE(control.bind(*context, &channel));
  }
  void boolean(FreeRDP_Settings_Keys_Bool key, BOOL value) {
    REQUIRE(freerdp_settings_set_bool(context->settings, key, value));
  }
  UINT caps(UINT32 monitors = 16, UINT32 a = 8192, UINT32 b = 8192) {
    REQUIRE(channel.DisplayControlCaps);
    return channel.DisplayControlCaps(&channel, monitors, a, b);
  }
  void activate() {
    REQUIRE(control.observe({1920, 1080}));
    REQUIRE(caps() == CHANNEL_RC_OK);
  }
};
} // namespace
TEST_CASE("Display Control requires negotiated caps and observes actual desktop confirmation") {
  Fixture f;
  const auto now = Clock::time_point{};
  REQUIRE(f.control.bound());
  REQUIRE_FALSE(f.control.ready());
  REQUIRE(f.control.request({2048, 1152}, now) == Request::unavailable);
  REQUIRE(f.caps() == CHANNEL_RC_OK);
  REQUIRE_FALSE(f.control.ready());
  REQUIRE(f.control.request({2048, 1152}, now) == Request::unavailable);
  REQUIRE(f.control.observe({1920, 1080}));
  REQUIRE(f.control.ready());
  REQUIRE(f.control.request({1920, 1080}, now) == Request::unchanged);
  REQUIRE(f.writes == 0);
  const auto width = freerdp_settings_get_uint32(f.context->settings, FreeRDP_DesktopWidth);
  const auto height = freerdp_settings_get_uint32(f.context->settings, FreeRDP_DesktopHeight);
  REQUIRE(f.control.request({2048, 1152}, now) == Request::sent);
  REQUIRE(freerdp_settings_get_uint32(f.context->settings, FreeRDP_DesktopWidth) == width);
  REQUIRE(freerdp_settings_get_uint32(f.context->settings, FreeRDP_DesktopHeight) == height);
  REQUIRE(f.writes == 1);
  REQUIRE(f.count == 1);
  REQUIRE(f.layout.Flags == DISPLAY_CONTROL_MONITOR_PRIMARY);
  REQUIRE(f.layout.Left == 0);
  REQUIRE(f.layout.Top == 0);
  REQUIRE(f.layout.Width == 2048);
  REQUIRE(f.layout.Height == 1152);
  REQUIRE(f.layout.PhysicalWidth == 0);
  REQUIRE(f.layout.PhysicalHeight == 0);
  REQUIRE(f.layout.Orientation == 0);
  REQUIRE(f.layout.DesktopScaleFactor == 100);
  REQUIRE(f.layout.DeviceScaleFactor == 100);
  REQUIRE(f.control.actual() == Size{1920, 1080});
  REQUIRE(f.control.requested() == Size{2048, 1152});
  REQUIRE(f.control.request({1280, 720}, now) == Request::busy);
  REQUIRE(f.control.request({1920, 1080}, now) == Request::busy);
  REQUIRE(f.writes == 1);
  REQUIRE(f.control.observe({1600, 900}));
  REQUIRE(f.control.actual() == Size{1600, 900});
  REQUIRE(f.control.requested() == Size{2048, 1152});
  REQUIRE_FALSE(f.control.observe({0, 0}));
  REQUIRE(f.control.actual() == Size{1600, 900});
  REQUIRE(f.control.observe({2048, 1152}));
  REQUIRE_FALSE(f.control.requested());
  REQUIRE(f.control.actual() == Size{2048, 1152});
}
TEST_CASE("Display layouts reject odd and out-of-provider dimensions before transport writes") {
  Fixture f;
  f.activate();
  const auto now = Clock::time_point{};
  constexpr auto maximum = (std::numeric_limits<std::uint32_t>::max)();
  for (const auto size : {Size{0, 200},
                          {199, 200},
                          {201, 200},
                          {3841, 200},
                          {3842, 200},
                          {200, 0},
                          {200, 199},
                          {200, 201},
                          {200, 2161},
                          {200, 2162},
                          {maximum, 200},
                          {200, maximum}}) {
    CAPTURE(size.width, size.height);
    REQUIRE(f.control.request(size, now) == Request::invalid);
    REQUIRE(f.writes == 0);
    REQUIRE_FALSE(f.control.requested());
    REQUIRE(f.control.actual() == Size{1920, 1080});
  }
  for (const auto size : {Size{200, 200}, {3840, 2160}}) {
    REQUIRE(f.control.request(size, now) == Request::sent);
    REQUIRE(f.layout.Width == size.width);
    REQUIRE(f.layout.Height == size.height);
    REQUIRE(f.control.observe(size));
  }
  REQUIRE(f.writes == 2);
  REQUIRE(f.control.observe({7680, 4320})); // Remote observations aren't request/provider promises.
  REQUIRE_FALSE(f.control.observe({7681, 4320}));
  REQUIRE_FALSE(f.control.observe({7680, 4321}));
  REQUIRE(f.control.actual() == Size{7680, 4320});
}
TEST_CASE("Server monitor area uses all three factors and saturates without integer overflow") {
  Fixture f;
  REQUIRE(f.control.observe({1920, 1080}));
  const auto now = Clock::time_point{};
  // 2 * 200 * 200 = 80000: the single monitor may exceed A * B, but not the total.
  REQUIRE(f.caps(2, 200, 200) == CHANNEL_RC_OK);
  REQUIRE(f.control.capabilities()->max_monitors == 2);
  REQUIRE(f.control.capabilities()->usable_area == 80000);
  REQUIRE(f.control.request({400, 200}, now) == Request::sent);
  REQUIRE(f.control.observe({400, 200}));
  REQUIRE(f.control.request({402, 200}, now) == Request::invalid);
  REQUIRE(f.writes == 1);
  constexpr auto maximum = (std::numeric_limits<UINT32>::max)();
  REQUIRE(f.caps(maximum, maximum, maximum) == CHANNEL_RC_OK);
  REQUIRE(f.control.capabilities()->usable_area == Control::max_area);
  REQUIRE(f.control.request({3840, 2160}, now) == Request::sent);
  REQUIRE(f.control.observe({3840, 2160}));
  for (const auto zeros : {std::array<UINT32, 3>{0, 200, 200}, {1, 0, 200}, {1, 200, 0}}) {
    REQUIRE(f.caps(maximum, maximum, maximum) == CHANNEL_RC_OK);
    REQUIRE(f.control.request({200, 200}, now) == Request::sent);
    REQUIRE(f.control.requested() == Size{200, 200});
    REQUIRE(f.caps(zeros[0], zeros[1], zeros[2]) == CHANNEL_RC_OK);
    REQUIRE_FALSE(f.control.ready());
    REQUIRE_FALSE(f.control.capabilities());
    REQUIRE_FALSE(f.control.requested());
    REQUIRE(f.control.actual() == Size{3840, 2160});
    REQUIRE(f.control.request({200, 200}, now) == Request::unavailable);
  }
  REQUIRE(f.caps(1, 1, 1) == CHANNEL_RC_OK);
  REQUIRE(f.control.request({200, 200}, now) == Request::invalid);
}
TEST_CASE("Failed and timed-out display writes cannot change authoritative dimensions") {
  Fixture f;
  f.activate();
  const auto now = Clock::time_point{} + std::chrono::hours(1);
  f.send_status = ERROR_INTERNAL_ERROR;
  REQUIRE(f.control.request({1280, 720}, now) == Request::send_failed);
  REQUIRE_FALSE(f.control.requested());
  REQUIRE(f.control.actual() == Size{1920, 1080});
  f.send_status = CHANNEL_RC_OK;
  REQUIRE(f.control.request({1280, 720}, now) == Request::sent);
  REQUIRE_FALSE(f.control.expire(now - std::chrono::seconds(1)));
  REQUIRE_FALSE(f.control.expire(now + Control::timeout - std::chrono::nanoseconds(1)));
  REQUIRE(f.control.expire(now + Control::timeout));
  REQUIRE_FALSE(f.control.expire(now + Control::timeout));
  REQUIRE_FALSE(f.control.requested());
  REQUIRE(f.control.actual() == Size{1920, 1080});
  // A late remote resize is still authoritative, but does not resurrect a timed-out request.
  REQUIRE(f.control.observe({1280, 720}));
  REQUIRE_FALSE(f.control.requested());
  REQUIRE(f.control.request({2048, 1152}, (Clock::time_point::max)()) == Request::sent);
  REQUIRE(f.control.expire((Clock::time_point::max)()));
}
TEST_CASE("DVC teardown clears callbacks and pending requests; rebind requires fresh caps") {
  Fixture f;
  f.activate();
  REQUIRE(f.control.request({1280, 720}, Clock::time_point{}) == Request::sent);
  const auto callback = f.channel.DisplayControlCaps;
  REQUIRE(f.control.unbind());
  REQUIRE_FALSE(f.control.bound());
  REQUIRE_FALSE(f.control.ready());
  REQUIRE_FALSE(f.control.requested());
  REQUIRE_FALSE(f.channel.custom);
  REQUIRE_FALSE(f.channel.DisplayControlCaps);
  REQUIRE(f.channel.SendMonitorLayout);
  REQUIRE(callback(&f.channel, 1, 8192, 8192) == ERROR_INVALID_DATA);
  REQUIRE(callback(nullptr, 1, 8192, 8192) == ERROR_INVALID_DATA);
  REQUIRE(f.control.unbind());
  REQUIRE(f.control.actual() == Size{1920, 1080});
  REQUIRE(f.control.bind(*f.context, &f.channel));
  REQUIRE(f.control.request({1280, 720}, Clock::time_point{}) == Request::unavailable);
  REQUIRE(f.caps() == CHANNEL_RC_OK);
  REQUIRE(f.control.request({1280, 720}, Clock::time_point{}) == Request::sent);
  REQUIRE(f.control.observe({1280, 720}));
  REQUIRE_FALSE(f.control.requested());
}
TEST_CASE("Display binding respects ownership and synchronous FreeRDP settings") {
  Fixture f(false);
  REQUIRE_FALSE(f.control.bind(*f.context, nullptr));
  f.channel.handle = nullptr;
  REQUIRE_FALSE(f.control.bind(*f.context, &f.channel));
  f.channel.handle = &f;
  f.channel.custom = &f;
  REQUIRE_FALSE(f.control.bind(*f.context, &f.channel));
  REQUIRE(f.channel.custom == &f);
  f.channel.custom = nullptr;
  f.channel.DisplayControlCaps = [](DispClientContext *, UINT32, UINT32, UINT32) -> UINT {
    return CHANNEL_RC_OK;
  };
  REQUIRE_FALSE(f.control.bind(*f.context, &f.channel));
  f.channel.DisplayControlCaps = nullptr;
  const auto send = f.channel.SendMonitorLayout;
  f.channel.SendMonitorLayout = nullptr;
  REQUIRE_FALSE(f.control.bind(*f.context, &f.channel));
  f.channel.SendMonitorLayout = send;
  for (const auto key : {FreeRDP_AsyncChannels, FreeRDP_AsyncUpdate}) {
    f.boolean(key, TRUE);
    REQUIRE_FALSE(f.control.bind(*f.context, &f.channel));
    f.boolean(key, FALSE);
  }
  for (const auto key : {FreeRDP_SupportDisplayControl, FreeRDP_SynchronousDynamicChannels}) {
    f.boolean(key, FALSE);
    REQUIRE_FALSE(f.control.bind(*f.context, &f.channel));
    f.boolean(key, TRUE);
  }
  auto *settings = f.context->settings;
  f.context->settings = nullptr;
  const auto missing_settings = f.control.bind(*f.context, &f.channel);
  f.context->settings = settings;
  REQUIRE_FALSE(missing_settings);
  REQUIRE(f.control.bind(*f.context, &f.channel));
  REQUIRE_FALSE(f.control.bind(*f.context, &f.channel));
}
TEST_CASE("Display adapter destruction detaches its public callback ownership") {
  Fixture f(false);
  {
    Control temporary;
    REQUIRE(temporary.bind(*f.context, &f.channel));
    REQUIRE(temporary.observe({1920, 1080}));
    REQUIRE(f.caps() == CHANNEL_RC_OK);
    REQUIRE(temporary.request({1280, 720}, Clock::time_point{}) == Request::sent);
  }
  REQUIRE_FALSE(f.channel.custom);
  REQUIRE_FALSE(f.channel.DisplayControlCaps);
  REQUIRE(f.channel.SendMonitorLayout);
}
TEST_CASE("Display callbacks and mutating operations reject a different thread") {
  Fixture f;
  f.activate();
  REQUIRE(f.control.request({1280, 720}, Clock::time_point{}) == Request::sent);
  bool unbound = true, observed = true, expired = true;
  UINT caps = CHANNEL_RC_OK;
  Request result = Request::sent;
  std::thread other([&] {
    caps = f.channel.DisplayControlCaps(&f.channel, 1, 200, 200);
    result = f.control.request({1280, 720}, Clock::time_point{});
    observed = f.control.observe({1280, 720});
    expired = f.control.expire((Clock::time_point::max)());
    unbound = f.control.unbind();
  });
  other.join(); // No concurrent mutations; assertions inspect results after synchronization.
  REQUIRE(caps == ERROR_INVALID_DATA);
  REQUIRE(result == Request::unavailable);
  REQUIRE_FALSE(observed);
  REQUIRE_FALSE(expired);
  REQUIRE_FALSE(unbound);
  REQUIRE(f.control.ready());
  REQUIRE(f.control.actual() == Size{1920, 1080});
  REQUIRE(f.control.requested() == Size{1280, 720});
  REQUIRE(f.writes == 1);
}
