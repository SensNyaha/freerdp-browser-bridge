#include "process_cpu.hpp"
#include "process_stat.hpp"
#include <catch2/catch_test_macros.hpp>
#include <string>

using bridge::runtime::process_cpu_micros;
using bridge::runtime::process_cpu_tick_micros;
using bridge::runtime::process_stat_cpu;

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

TEST_CASE("Process CPU tick conversion uses the supplied clock frequency and preserves carry") {
  REQUIRE(process_cpu_tick_micros(0, 0, 100) == 0);
  REQUIRE(process_cpu_tick_micros(1, 1, 3) == 666666);
  REQUIRE(process_cpu_tick_micros(1, 1, 100) == 20000);
  REQUIRE(process_cpu_tick_micros(1, 1, 128) == 15625);
  REQUIRE(process_cpu_tick_micros(250, 250, 250) == 2000000);
  REQUIRE(process_cpu_tick_micros(1000, 2000, 1000) == 3000000);
  REQUIRE(process_cpu_tick_micros(0x100000000ULL, 0, 1000000) == 0x100000000ULL);
}

TEST_CASE("Process CPU tick conversion rejects invalid frequency and checked scalar overflow") {
  constexpr auto maximum = 9007199254740991ULL;
  REQUIRE_FALSE(process_cpu_tick_micros(1, 0, 0));
  REQUIRE(process_cpu_tick_micros(maximum, 0, 1000000) == maximum);
  REQUIRE_FALSE(process_cpu_tick_micros(maximum, 1, 1000000));
  REQUIRE_FALSE(process_cpu_tick_micros((std::numeric_limits<std::uint64_t>::max)(), 1, 100));
  REQUIRE_FALSE(process_cpu_tick_micros((std::numeric_limits<std::uint64_t>::max)(), 0, 1));
  REQUIRE(process_cpu_tick_micros(0xffffffffULL, 0, 0xffffffffU) == 1000000);
}

namespace {
std::string stat_line(std::string_view name = "worker", std::string_view user = "11",
                      std::string_view kernel = "12") {
  return "42 (" + std::string(name) + ") S 1 2 3 -1 5 6 7 8 9 10 " + std::string(user) + " " +
         std::string(kernel) + " 99 100\n";
}
} // namespace

TEST_CASE("Process CPU stat parser extracts only own counters past arbitrary bounded comm") {
  for (const auto name : {"worker", "name with space", "name ) ( tail", "name\n) tail"}) {
    const auto value = process_stat_cpu(stat_line(name), 42);
    REQUIRE(value.has_value());
    REQUIRE(value->user == 11);
    REQUIRE(value->kernel == 12);
  }
  const auto zero = process_stat_cpu(stat_line("worker", "0", "0"), 42);
  REQUIRE(zero.has_value());
  REQUIRE(zero->user == 0);
  REQUIRE(zero->kernel == 0);
  const auto maximum = process_stat_cpu(stat_line("worker", "18446744073709551615", "1"), 42);
  REQUIRE(maximum.has_value());
  REQUIRE(maximum->user == (std::numeric_limits<std::uint64_t>::max)());
}

TEST_CASE("Process CPU stat parser refuses missing malformed oversized and foreign inputs") {
  REQUIRE_FALSE(process_stat_cpu(stat_line(), 0));
  REQUIRE_FALSE(process_stat_cpu(stat_line(), 0x80000000U));
  REQUIRE_FALSE(process_stat_cpu(stat_line(), 43));
  REQUIRE_FALSE(process_stat_cpu(std::string(8193, 'x'), 42));
  auto nul = stat_line();
  nul[10] = '\0';
  REQUIRE_FALSE(process_stat_cpu(nul, 42));
  for (const auto invalid : {"-1", "+1", "1x", "18446744073709551616"}) {
    REQUIRE_FALSE(process_stat_cpu(stat_line("worker", invalid, "0"), 42));
    REQUIRE_FALSE(process_stat_cpu(stat_line("worker", "0", invalid), 42));
  }
  for (const auto invalid :
       {"", "42 (worker", "42 (worker) ", "42 (worker) SS 1 2 3 4 5 6 7 8 9 10 11 12",
        "42 (worker) S 1 2 3 4 5 6 7 8 9 10 11", "42 (worker) S 1 2 3 4 5 x 7 8 9 10 11 12",
        "+42 (worker) S 1 2 3 4 5 6 7 8 9 10 11 12"})
    REQUIRE_FALSE(process_stat_cpu(invalid, 42));
}
