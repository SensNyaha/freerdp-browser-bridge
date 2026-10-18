#include "process_cpu.hpp"
#include <catch2/catch_test_macros.hpp>

using bridge::runtime::process_cpu_micros;

TEST_CASE("Process CPU combines counters before microsecond truncation") {
  REQUIRE(process_cpu_micros(0, 0) == 0);
  REQUIRE(process_cpu_micros(9, 0) == 0);
  REQUIRE(process_cpu_micros(0, 9) == 0);
  REQUIRE(process_cpu_micros(9, 9) == 1);
  REQUIRE(process_cpu_micros(10, 20) == 3);
  REQUIRE(process_cpu_micros(0x100000000ULL, 10) == 429496730);
}

TEST_CASE("Process CPU refuses overflow and inexact JSON integer durations") {
  constexpr auto maximum = 9007199254740991ULL;
  REQUIRE(process_cpu_micros(maximum * 10, 9) == maximum);
  REQUIRE(process_cpu_micros(9, maximum * 10) == maximum);
  REQUIRE_FALSE(process_cpu_micros(maximum * 10, 10).has_value());
  constexpr auto all = (std::numeric_limits<std::uint64_t>::max)();
  REQUIRE_FALSE(process_cpu_micros(all, 1).has_value());
  REQUIRE_FALSE(process_cpu_micros(1, all).has_value());
  REQUIRE_FALSE(process_cpu_micros(all, 0).has_value());
}
