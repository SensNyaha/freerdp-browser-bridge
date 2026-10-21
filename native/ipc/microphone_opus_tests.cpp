#include "../compat/ranges.hpp"
#include "../compat/span.hpp"
#include "microphone_opus.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <vector>
namespace mic = bridge::ipc::microphone::opus;
using bridge::ipc::ProtocolError;
namespace {
const std::array<std::uint8_t, 27> golden{1, 2, 3, 0xc0, 0,    0,    1,    0x38, 1,
                                          2, 3, 4, 5,    6,    7,    8,    0,    0,
                                          0, 0, 0, 0x0f, 0x42, 0x40, 0xfc, 0xff, 0xfe};
}
TEST_CASE(
    "Microphone Opus envelope bounds correlation and compressed lengths before body allocation") {
  using namespace bridge::ipc;
  for (const auto length : {26U, 1299U}) {
    const auto header = encode_header({Kind::microphone_opus, UINT64_MAX, length});
    REQUIRE(header[7] == 44);
    REQUIRE(decode_header(header).length == length);
    REQUIRE(decode_header(header).request_id == UINT64_MAX);
    REQUIRE_THROWS_AS(encode_header({Kind::microphone_opus, 0, length}), ProtocolError);
  }
  for (const auto length : {0U, 1U, 24U, 25U, 1300U, UINT32_MAX})
    REQUIRE_THROWS_AS(encode_header({Kind::microphone_opus, 1, length}), ProtocolError);
}
TEST_CASE(
    "Microphone Opus payload preserves golden delay epoch capture clock and borrowed storage") {
  const auto p = mic::decode_packet(golden);
  REQUIRE(p.epoch == 0x0102030405060708ULL);
  REQUIRE(p.timestamp_us == 1000000);
  REQUIRE(p.lookahead_frames == 312);
  REQUIRE(p.discontinuity);
  REQUIRE(p.encoded.data() == golden.data() + 24);
  REQUIRE(::bridge::compat::ranges::equal(mic::encode_packet(p).bytes(), golden));
  REQUIRE_THROWS_AS(bridge::ipc::audio::opus::decode_packet(golden), ProtocolError);
  auto owner = golden;
  auto borrowed = mic::decode_packet(owner);
  owner[25] = 17;
  REQUIRE(borrowed.encoded[1] == 17);
}
TEST_CASE("Microphone Opus payload bounds lengths fixed metadata and all TOC profiles") {
  for (std::size_t n = 0; n < 26; ++n)
    REQUIRE_THROWS_AS(mic::decode_packet(::bridge::compat::span(golden).first(n)), ProtocolError);
  std::vector<std::uint8_t> over(1300);
  ::bridge::compat::ranges::copy(golden, over.begin());
  REQUIRE_THROWS_AS(mic::decode_packet(over), ProtocolError);
  for (const auto at : {0U, 1U, 2U, 3U, 4U, 5U}) {
    auto b = golden;
    b[at] ^= 255;
    REQUIRE_THROWS_AS(mic::decode_packet(b), ProtocolError);
  }
  const std::array<std::uint8_t, 9> allowed{0x0c, 0x2c, 0x4c, 0x6c, 0x7c, 0x9c, 0xbc, 0xdc, 0xfc};
  for (unsigned toc = 0; toc < 256; ++toc) {
    auto b = golden;
    b[24] = static_cast<std::uint8_t>(toc);
    if (::bridge::compat::ranges::find(allowed, b[24]) != allowed.end())
      REQUIRE_NOTHROW(mic::decode_packet(b));
    else
      REQUIRE_THROWS_AS(mic::decode_packet(b), ProtocolError);
  }
  auto zero = golden;
  std::fill(zero.begin() + 8, zero.begin() + 16, 0);
  REQUIRE_THROWS_AS(mic::decode_packet(zero), ProtocolError);
  auto bad = golden;
  bad[6] = 3;
  bad[7] = 0xc1;
  REQUIRE_THROWS_AS(mic::decode_packet(bad), ProtocolError);
}
TEST_CASE("Microphone Opus payload accepts extrema and rejects invalid fields before output "
          "construction") {
  auto p = mic::decode_packet(golden);
  for (const auto length : {2U, 1275U})
    for (const auto delay : {0U, 960U}) {
      std::vector<std::uint8_t> encoded(length, 0xfc);
      p = {UINT64_MAX, UINT64_MAX - 20000, static_cast<std::uint16_t>(delay), false, encoded};
      const auto output = mic::encode_packet(p);
      const auto decoded = mic::decode_packet(output.bytes());
      REQUIRE(output.size == 24 + length);
      REQUIRE(decoded.epoch == UINT64_MAX);
      REQUIRE(decoded.timestamp_us == UINT64_MAX - 20000);
      REQUIRE(decoded.lookahead_frames == delay);
      REQUIRE_FALSE(decoded.discontinuity);
      REQUIRE(::bridge::compat::ranges::equal(decoded.encoded, encoded));
      REQUIRE(encoded[0] == 0xfc);
    }
  p = mic::decode_packet(golden);
  p.epoch = 0;
  REQUIRE_THROWS_AS(mic::encode_packet(p), ProtocolError);
  p = mic::decode_packet(golden);
  p.timestamp_us = UINT64_MAX - 19999;
  REQUIRE_THROWS_AS(mic::encode_packet(p), ProtocolError);
  p = mic::decode_packet(golden);
  p.lookahead_frames = 961;
  REQUIRE_THROWS_AS(mic::encode_packet(p), ProtocolError);
  for (const auto length : {0U, 1U, 1276U}) {
    std::vector<std::uint8_t> encoded(length, 0xfc);
    p = mic::decode_packet(golden);
    p.encoded = encoded;
    REQUIRE_THROWS_AS(mic::encode_packet(p), ProtocolError);
  }
  mic::EncodedPacket corrupt;
  corrupt.size = 1300;
  REQUIRE_THROWS_AS(corrupt.bytes(), ProtocolError);
}
