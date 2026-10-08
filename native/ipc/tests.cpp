#include "protocol.hpp"
#include <catch2/catch_test_macros.hpp>
using namespace bridge::ipc;
TEST_CASE("network-order envelope roundtrip and maximum request id") {
  const auto bytes = encode({Kind::heartbeat, UINT64_MAX, {}});
  REQUIRE(bytes.size() == 24);
  const auto header = decode_header(bytes);
  REQUIRE(header.kind == Kind::heartbeat);
  REQUIRE(header.request_id == UINT64_MAX);
  REQUIRE(header.length == 0);
}
TEST_CASE("reject malformed headers before allocation") {
  const auto valid = encode({Kind::heartbeat, 1, {}});
  for (const auto index : {0, 4, 7, 8, 20, 23}) {
    auto bytes = valid;
    bytes[static_cast<std::size_t>(index)] = 0xff;
    REQUIRE_THROWS_AS(decode_header(bytes), ProtocolError);
  }
  for (std::size_t length = 0; length < header_bytes; ++length)
    REQUIRE_THROWS_AS(decode_header(std::span(valid).first(length)), ProtocolError);
}
TEST_CASE("class limits and exact payload lengths") {
  REQUIRE_NOTHROW(encode({Kind::hello_ack, 1, std::vector<std::uint8_t>(4096)}));
  REQUIRE_THROWS_AS(encode({Kind::hello_ack, 1, std::vector<std::uint8_t>(4097)}), ProtocolError);
  REQUIRE_THROWS_AS(encode({Kind::hello, 1, std::vector<std::uint8_t>(7)}), ProtocolError);
  REQUIRE_THROWS_AS(encode({Kind::heartbeat, 1, {0}}), ProtocolError);
}
TEST_CASE("HELLO rejects incompatible version ranges and unknown required features") {
  const std::vector<std::uint8_t> valid{0, 1, 0, 1, 0, 0, 0, 0};
  REQUIRE_NOTHROW(validate_hello(valid));
  REQUIRE_THROWS_AS(validate_hello(std::span(valid).first(7)), ProtocolError);
  for (const auto index : {0, 2, 7}) {
    auto payload = valid;
    payload[static_cast<std::size_t>(index)] = 255;
    if (index == 2)
      payload[3] = 0;
    if (index == 2)
      payload[2] = 0;
    REQUIRE_THROWS_AS(validate_hello(payload), ProtocolError);
  }
}
