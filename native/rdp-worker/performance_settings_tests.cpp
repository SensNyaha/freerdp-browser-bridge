#include "performance_settings.hpp"
#include <catch2/catch_test_macros.hpp>
#include <memory>

namespace {
using Settings = std::unique_ptr<rdpSettings, decltype(&freerdp_settings_free)>;
Settings create_settings(unsigned enabled) {
  Settings settings(freerdp_settings_new(0), freerdp_settings_free);
  REQUIRE(settings);
  REQUIRE(freerdp_settings_set_bool(settings.get(), FreeRDP_DisableWallpaper, !(enabled & 1U)));
  REQUIRE(
      freerdp_settings_set_bool(settings.get(), FreeRDP_AllowFontSmoothing, (enabled & 2U) != 0));
  REQUIRE(freerdp_settings_set_bool(settings.get(), FreeRDP_AllowDesktopComposition,
                                    (enabled & 4U) != 0));
  REQUIRE(
      freerdp_settings_set_bool(settings.get(), FreeRDP_DisableFullWindowDrag, !(enabled & 8U)));
  REQUIRE(freerdp_settings_set_bool(settings.get(), FreeRDP_DisableMenuAnims, !(enabled & 16U)));
  REQUIRE(freerdp_settings_set_bool(settings.get(), FreeRDP_DisableThemes, !(enabled & 32U)));
  return settings;
}
unsigned appearance(const rdpSettings *settings) {
  return (freerdp_settings_get_bool(settings, FreeRDP_DisableWallpaper) ? 0U : 1U) |
         (freerdp_settings_get_bool(settings, FreeRDP_AllowFontSmoothing) ? 2U : 0U) |
         (freerdp_settings_get_bool(settings, FreeRDP_AllowDesktopComposition) ? 4U : 0U) |
         (freerdp_settings_get_bool(settings, FreeRDP_DisableFullWindowDrag) ? 0U : 8U) |
         (freerdp_settings_get_bool(settings, FreeRDP_DisableMenuAnims) ? 0U : 16U) |
         (freerdp_settings_get_bool(settings, FreeRDP_DisableThemes) ? 0U : 32U);
}
} // namespace

TEST_CASE("public SDK performance setters preserve omitted fields and invert only Disable keys") {
  for (unsigned baseline : {0U, 63U}) {
    unsigned accepted = 0;
    for (unsigned mask = 0; mask < 64; ++mask) {
      for (unsigned values = 0; values < 64; ++values) {
        if ((values & ~mask) != 0)
          continue;
        auto settings = create_settings(baseline);
        bridge::rdp::apply_performance_settings(settings.get(), static_cast<std::uint8_t>(mask),
                                                static_cast<std::uint8_t>(values));
        const unsigned wanted = (baseline & ~mask) | values;
        REQUIRE(appearance(settings.get()) == wanted);
        // Pinned public SDK packs Client Info performance flags from these same public settings.
        freerdp_performance_flags_make(settings.get());
        const unsigned expected_flags = ((wanted & 1U) ? 0U : 0x1U) | ((wanted & 2U) ? 0x80U : 0U) |
                                        ((wanted & 4U) ? 0x100U : 0U) |
                                        ((wanted & 8U) ? 0U : 0x2U) | ((wanted & 16U) ? 0U : 0x4U) |
                                        ((wanted & 32U) ? 0U : 0x8U);
        REQUIRE(freerdp_settings_get_uint32(settings.get(), FreeRDP_PerformanceFlags) ==
                expected_flags);
        ++accepted;
      }
    }
    REQUIRE(accepted == 729);
  }
}

TEST_CASE("public SDK performance preset golden flags and invalid selection are deterministic") {
  struct Case {
    unsigned baseline;
    std::uint8_t mask, values;
    unsigned flags;
  };
  for (const auto &item :
       {Case{63, 25, 0, 0x187}, Case{0, 3, 2, 0x8f}, Case{0, 63, 63, 0x180}, Case{0, 3, 1, 0xe}}) {
    auto settings = create_settings(item.baseline);
    bridge::rdp::apply_performance_settings(settings.get(), item.mask, item.values);
    freerdp_performance_flags_make(settings.get());
    REQUIRE(freerdp_settings_get_uint32(settings.get(), FreeRDP_PerformanceFlags) == item.flags);
  }
  auto settings = create_settings(21);
  for (const auto &item : {Case{0, 64, 0, 0}, Case{0, 1, 2, 0}, Case{0, 63, 128, 0}}) {
    REQUIRE_THROWS_AS(
        bridge::rdp::apply_performance_settings(settings.get(), item.mask, item.values),
        bridge::ipc::ProtocolError);
    REQUIRE(appearance(settings.get()) == 21);
  }
  REQUIRE_THROWS_AS(bridge::rdp::apply_performance_settings(nullptr, 0, 0),
                    bridge::ipc::ProtocolError);
}
