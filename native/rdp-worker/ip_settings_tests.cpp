#include "ip_settings.hpp"
#include <catch2/catch_test_macros.hpp>
#include <memory>

TEST_CASE(
    "public IP setters preserve unselected values and project preference/force independently") {
  using Settings = std::unique_ptr<rdpSettings, decltype(&freerdp_settings_free)>;
  for (const BOOL baseline_prefer : {FALSE, TRUE}) {
    for (const UINT32 baseline_force : {0U, 4U, 6U}) {
      Settings settings(freerdp_settings_new(0), freerdp_settings_free);
      REQUIRE(settings);
      unsigned accepted = 0;
      for (std::uint8_t mask = 0; mask < 4; ++mask) {
        for (std::uint8_t prefer = 0; prefer < 2; ++prefer) {
          for (const std::uint8_t force : {std::uint8_t{0}, std::uint8_t{4}, std::uint8_t{6}}) {
            if (!bridge::ipc::valid_ip_settings(mask, prefer, force))
              continue;
            REQUIRE(freerdp_settings_set_bool(settings.get(), FreeRDP_PreferIPv6OverIPv4,
                                              baseline_prefer));
            REQUIRE(freerdp_settings_set_uint32(settings.get(), FreeRDP_ForceIPvX, baseline_force));
            bridge::rdp::apply_ip_settings(settings.get(), mask, prefer, force);
            REQUIRE(freerdp_settings_get_bool(settings.get(), FreeRDP_PreferIPv6OverIPv4) ==
                    ((mask & 1U) ? (prefer ? TRUE : FALSE) : baseline_prefer));
            REQUIRE(freerdp_settings_get_uint32(settings.get(), FreeRDP_ForceIPvX) ==
                    ((mask & 2U) ? force : baseline_force));
            ++accepted;
          }
        }
      }
      REQUIRE(accepted == 12);
    }
  }
}

TEST_CASE("public IP setters refuse noncanonical input before touching either setting") {
  using Settings = std::unique_ptr<rdpSettings, decltype(&freerdp_settings_free)>;
  Settings settings(freerdp_settings_new(0), freerdp_settings_free);
  REQUIRE(settings);
  REQUIRE(freerdp_settings_set_bool(settings.get(), FreeRDP_PreferIPv6OverIPv4, TRUE));
  REQUIRE(freerdp_settings_set_uint32(settings.get(), FreeRDP_ForceIPvX, 6));
  struct Selection {
    std::uint8_t mask, prefer, force;
  };
  for (const auto &item : {Selection{4, 0, 0}, Selection{3, 2, 4}, Selection{3, 0, 5},
                           Selection{0, 1, 0}, Selection{1, 0, 6}, Selection{2, 1, 4}}) {
    REQUIRE_THROWS_AS(
        bridge::rdp::apply_ip_settings(settings.get(), item.mask, item.prefer, item.force),
        bridge::ipc::ProtocolError);
    REQUIRE(freerdp_settings_get_bool(settings.get(), FreeRDP_PreferIPv6OverIPv4) == TRUE);
    REQUIRE(freerdp_settings_get_uint32(settings.get(), FreeRDP_ForceIPvX) == 6);
  }
  REQUIRE_THROWS_AS(bridge::rdp::apply_ip_settings(nullptr, 0, 0, 0), bridge::ipc::ProtocolError);
}
