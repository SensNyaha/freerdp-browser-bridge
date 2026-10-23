#include "event_pump.hpp"
#include <catch2/catch_test_macros.hpp>
using namespace std::chrono_literals;
TEST_CASE("Queued scene tiles are applied before one latest-state capture") {
  std::chrono::steady_clock::time_point time{};
  std::size_t tiles = 0;
  const auto result = bridge::pump_ready_events(
      [&] {
        ++tiles;
        time += 50us;
        return true;
      },
      [&] { return tiles < 64; }, [] { return false; }, [&] { return time; });
  REQUIRE(result.healthy);
  REQUIRE(tiles == 64);
  REQUIRE(result.checks == 64);
  REQUIRE(result.elapsed == 3200us);
  // A ready 64-tile scene becomes complete in one batch, instead of being sampled 64 times.
}
TEST_CASE("Ready RDP pumping is bounded by time, record count, stop and failure") {
  std::chrono::steady_clock::time_point time{};
  auto result = bridge::pump_ready_events(
      [&] {
        time += 1ms;
        return true;
      },
      [] { return true; }, [] { return false; }, [&] { return time; });
  REQUIRE(result.checks == 8);
  REQUIRE(result.elapsed == 8ms);
  result = bridge::pump_ready_events([] { return true; }, [] { return true; }, [] { return false; },
                                     [&] { return time; });
  REQUIRE(result.checks == 256);
  result = bridge::pump_ready_events([] { return true; }, [] { return true; }, [] { return true; },
                                     [&] { return time; });
  REQUIRE(result.checks == 0);
  result = bridge::pump_ready_events([] { return false; }, [] { return true; },
                                     [] { return false; }, [&] { return time; });
  REQUIRE_FALSE(result.healthy);
  REQUIRE(result.checks == 1);
  result = bridge::pump_ready_events([] { return true; }, [] { return false; },
                                     [] { return false; }, [&] { return time; });
  REQUIRE(result.healthy);
  REQUIRE(result.checks == 1);
}
