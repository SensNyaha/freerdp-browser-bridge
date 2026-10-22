#include "../compat/span.hpp"
#include "pipeline_stats.hpp"
#include "protocol.hpp"
#include <catch2/catch_test_macros.hpp>
TEST_CASE("Pipeline timing uses a bounded recent p95 window and lifetime totals") {
  bridge::PipelineStats stats;
  REQUIRE(stats.snapshot() == std::array<std::uint64_t, 8>{});
  stats.paint();
  stats.read(1, 30);
  stats.read(64, 3000);
  for (std::uint64_t i = 1; i <= 100; ++i)
    stats.encode(i);
  REQUIRE(stats.snapshot() == std::array<std::uint64_t, 8>{65, 1, 100, 50, 95, 100, 64, 3000});
  for (int i = 0; i < 128; ++i)
    stats.encode(20);
  const auto result = stats.snapshot();
  REQUIRE(result[2] == 228);
  REQUIRE(result[4] == 20);
  REQUIRE(result[5] == 100);
}
TEST_CASE("Pipeline diagnostic records require exact lengths before body allocation") {
  using namespace bridge::ipc;
  const auto request = encode({Kind::pipeline_stats, 1, {}});
  REQUIRE(decode_header(request).length == 0);
  const auto reply = encode({Kind::pipeline_stats_ack, 1, std::vector<std::uint8_t>(64)});
  REQUIRE(decode_header(::bridge::compat::span(reply).first(header_bytes)).length == 64);
  REQUIRE_THROWS_AS(encode({Kind::pipeline_stats, 1, {0}}), ProtocolError);
  REQUIRE_THROWS_AS(encode({Kind::pipeline_stats_ack, 1, std::vector<std::uint8_t>(63)}),
                    ProtocolError);
  REQUIRE_THROWS_AS(encode({Kind::pipeline_stats_ack, 1, std::vector<std::uint8_t>(65)}),
                    ProtocolError);
}
