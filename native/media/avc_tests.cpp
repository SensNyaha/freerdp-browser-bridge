#include "avc.hpp"
#include <catch2/catch_test_macros.hpp>

TEST_CASE("AVC packetizer creates deterministic config and length-prefixed access units") {
  bridge::media::AvcPacketizer packetizer;
  packetizer.begin();
  packetizer.append(std::array<std::uint8_t, 8>{0, 0, 0, 1, 0x67, 0x42, 0xc0, 0x1e});
  packetizer.append(std::array<std::uint8_t, 7>{0, 0, 1, 0x68, 0xce, 0x3c, 0x80});
  packetizer.append(std::array<std::uint8_t, 6>{0, 0, 0, 1, 0x65, 0x88});
  const auto unit = packetizer.finish();
  const std::vector<std::uint8_t> expected{1, 0x42, 0xc0, 0x1e, 0xff, 0xe1, 0,
                                           4, 0x67, 0x42, 0xc0, 0x1e, 1,    0,
                                           4, 0x68, 0xce, 0x3c, 0x80};
  REQUIRE(std::vector(unit.config.begin(), unit.config.end()) == expected);
  REQUIRE(std::vector(unit.bytes.begin(), unit.bytes.end()) ==
          std::vector<std::uint8_t>{0, 0, 0, 2, 0x65, 0x88});
  REQUIRE(unit.keyframe);
  packetizer.begin();
  packetizer.append(std::array<std::uint8_t, 5>{0, 0, 1, 0x41, 0x9a});
  const auto following = packetizer.finish();
  REQUIRE_FALSE(following.keyframe);
  REQUIRE(std::vector(following.config.begin(), following.config.end()) == expected);
}
TEST_CASE("AVC packetizer rejects missing configs, wrong NALs and oversized output") {
  bridge::media::AvcPacketizer packetizer;
  REQUIRE_THROWS_AS(packetizer.finish(), bridge::ipc::ProtocolError);
  for (const std::vector<std::uint8_t> bad : {std::vector<std::uint8_t>{},
                                              {0, 0, 1},
                                              {0, 0, 1, 0x65},
                                              {0, 1, 0x65, 0x88},
                                              {0, 0, 1, 0xe5, 0x88},
                                              {0, 0, 1, 0x74, 0x88},
                                              {0, 0, 1, 0x67, 0x42},
                                              {0, 0, 1, 0x65, 0x88, 0, 0, 1, 0x41, 0x9a}})
    REQUIRE_THROWS_AS(packetizer.append(bad), bridge::ipc::ProtocolError);
  std::vector<std::uint8_t> oversized(bridge::media::max_access_unit_bytes + 4, 1);
  oversized[0] = oversized[1] = oversized[2] = 0;
  oversized[3] = 1;
  oversized[4] = 0x65;
  REQUIRE_THROWS_AS(packetizer.append(oversized), bridge::ipc::ProtocolError);
  oversized.resize(1029);
  oversized[4] = 0x67;
  REQUIRE_THROWS_AS(packetizer.append(oversized), bridge::ipc::ProtocolError);
  std::vector<std::uint8_t> at_limit(bridge::media::max_access_unit_bytes, 1);
  at_limit[0] = at_limit[1] = at_limit[2] = 0;
  at_limit[3] = 1;
  at_limit[4] = 0x65;
  REQUIRE_NOTHROW(packetizer.append(at_limit));
  REQUIRE_THROWS_AS(packetizer.append(std::array<std::uint8_t, 6>{0, 0, 0, 1, 0x65, 0x88}),
                    bridge::ipc::ProtocolError);
  packetizer.begin();
  packetizer.append(std::array<std::uint8_t, 6>{0, 0, 0, 1, 0x65, 0x88});
  REQUIRE_THROWS_AS(packetizer.finish(), bridge::ipc::ProtocolError);
}
