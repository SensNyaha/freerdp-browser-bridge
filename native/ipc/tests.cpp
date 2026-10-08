#include "connection_config.hpp"
#include "protocol.hpp"
#include <catch2/catch_test_macros.hpp>
using namespace bridge::ipc;
static const std::vector<std::uint8_t> connection{
    0,    1, 0, 9, 'l', 'o', 'c', 'a', 'l', 'h', 'o', 's', 't', 0,    1,    'u', 0, 0, 0x0d,
    0x3d, 4, 0, 3, 0,   0,   32,  2,   1,   2,   0,   0,   0,   0x13, 0x88, 0,   0, 3, 0xe8};
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
TEST_CASE("connection settings independently encoded vector, truncation and policy boundaries") {
  const auto c = decode_connection_config(connection);
  REQUIRE(c.host == "localhost");
  REQUIRE(c.username == "u");
  REQUIRE(c.port == 3389);
  REQUIRE(c.connect_ms == 5000);
  for (std::size_t i = 0; i < connection.size(); ++i)
    REQUIRE_THROWS_AS(decode_connection_config(std::span(connection).first(i)), ProtocolError);
  auto extra = connection;
  extra.push_back(0);
  REQUIRE_THROWS_AS(decode_connection_config(extra), ProtocolError);
  for (const auto offset : {0, 3, 13, 15, 20, 22, 26, 27, 28, 29, 30}) {
    auto bad = connection;
    bad[static_cast<std::size_t>(offset)] = 0xff;
    REQUIRE_THROWS_AS(decode_connection_config(bad), ProtocolError);
  }
}
TEST_CASE("secret class limits, canonical UTF-8, embedded NUL and overwrite") {
  REQUIRE_NOTHROW(validate_secret({}));
  REQUIRE_NOTHROW(validate_secret(std::vector<std::uint8_t>(4096, 'x')));
  REQUIRE_THROWS_AS(validate_secret(std::vector<std::uint8_t>(4097, 'x')), ProtocolError);
  for (const std::vector<std::uint8_t> bad : {std::vector<std::uint8_t>{'a', 0, 'b'},
                                              {0xc0, 0xaf},
                                              {0xed, 0xa0, 0x80},
                                              {0xf4, 0x90, 0x80, 0x80},
                                              {0xf0, 0x9f, 0x98},
                                              {0x80}})
    REQUIRE_THROWS_AS(validate_secret(bad), ProtocolError);
  std::vector<std::uint8_t> secret{0xf0, 0x9f, 0x98, 0x80};
  REQUIRE_NOTHROW(validate_secret(secret));
  wipe(secret);
  REQUIRE(secret == std::vector<std::uint8_t>(4, 0));
}
