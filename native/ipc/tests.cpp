#include "connection_config.hpp"
#include "display.hpp"
#include "protocol.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <utility>
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
TEST_CASE("connection v7 private microphone input is independent of the exclusive output codec") {
  auto bytes = connection;
  bytes[1] = 7;
  bytes.insert(bytes.end(), {30, 20, 80, 0, 0, 0x3d, 9, 0, 0, 0x3d, 9, 0, 0, 0, 0, 16});
  for (unsigned flags = 0; flags < 32; ++flags) {
    bytes.back() = static_cast<std::uint8_t>(flags);
    if ((flags & 12U) == 12U) {
      REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
      continue;
    }
    const auto config = decode_connection_config(bytes);
    REQUIRE(config.pcm_input == ((flags & 16U) != 0));
    REQUIRE(config.opus_output == ((flags & 8U) != 0));
    REQUIRE(config.pcm_output == ((flags & 4U) != 0));
    REQUIRE(config.touch == ((flags & 2U) != 0));
    REQUIRE(config.dynamic_resolution == ((flags & 1U) != 0));
  }
  bytes.back() = 16;
  for (std::size_t size = 0; size < bytes.size(); ++size)
    REQUIRE_THROWS_AS(decode_connection_config(std::span(bytes).first(size)), ProtocolError);
  for (unsigned schema = 1; schema <= 6; ++schema) {
    bytes[1] = static_cast<std::uint8_t>(schema);
    REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
  }
  bytes[1] = 7;
  for (const unsigned mask : {32U, 128U, 255U}) {
    bytes.back() = static_cast<std::uint8_t>(mask);
    REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
  }
  bytes.back() = 16;
  auto high = bytes;
  high[high.size() - 2] = 1;
  REQUIRE_THROWS_AS(decode_connection_config(high), ProtocolError);
  bytes.push_back(0);
  REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
  REQUIRE_FALSE(decode_connection_config(connection).pcm_input);
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
TEST_CASE("frame payload bounds are checked before allocation") {
  auto bytes = encode({Kind::capture, 1, std::vector<std::uint8_t>(8)});
  REQUIRE(decode_header(std::span(bytes).first(header_bytes)).length == 8);
  REQUIRE_THROWS_AS(encode({Kind::capture, 1, {}}), ProtocolError);
  bytes = encode({Kind::frame, 1, std::vector<std::uint8_t>(frame_metadata_bytes)});
  REQUIRE(decode_header(std::span(bytes).first(header_bytes)).kind == Kind::frame);
  bytes[20] = 0xff;
  REQUIRE_THROWS_AS(decode_header(std::span(bytes).first(header_bytes)), ProtocolError);
  REQUIRE_THROWS_AS(encode({Kind::frame, 1, std::vector<std::uint8_t>(23)}), ProtocolError);
}
TEST_CASE("connection settings independently encoded vector, truncation and policy boundaries") {
  const auto c = decode_connection_config(connection);
  REQUIRE(c.host == "localhost");
  REQUIRE(c.username == "u");
  REQUIRE(c.port == 3389);
  REQUIRE(c.connect_ms == 5000);
  REQUIRE(c.h264_fps == 30);
  REQUIRE(c.jpeg_fps == 20);
  REQUIRE(c.jpeg_quality == 80);
  REQUIRE(c.target_bitrate == 4000000);
  REQUIRE(c.max_bitrate == 4000000);
  REQUIRE_FALSE(c.dynamic_resolution);
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
TEST_CASE("connection settings v2 independently encoded quality and rejection boundaries") {
  auto bytes = connection;
  bytes[1] = 2;
  bytes.insert(bytes.end(), {10, 10, 60, 0, 0, 0x0f, 0x42, 0x40, 0, 0x1e, 0x84, 0x80});
  const auto config = decode_connection_config(bytes);
  REQUIRE(config.h264_fps == 10);
  REQUIRE(config.jpeg_fps == 10);
  REQUIRE(config.jpeg_quality == 60);
  REQUIRE(config.target_bitrate == 1000000);
  REQUIRE(config.max_bitrate == 2000000);
  for (std::size_t i = 0; i < bytes.size(); ++i)
    REQUIRE_THROWS_AS(decode_connection_config(std::span(bytes).first(i)), ProtocolError);
  for (const auto [index, value] : {std::pair<std::size_t, std::uint8_t>{38, 0},
                                    {38, 31},
                                    {39, 0},
                                    {39, 21},
                                    {40, 0},
                                    {40, 101},
                                    {41, 1},
                                    {42, 255},
                                    {46, 255}}) {
    auto invalid = bytes;
    invalid[index] = value;
    REQUIRE_THROWS_AS(decode_connection_config(invalid), ProtocolError);
  }
  auto invalid = bytes;
  std::fill(invalid.begin() + 46, invalid.end(), 0);
  REQUIRE_THROWS_AS(decode_connection_config(invalid), ProtocolError);
  bytes.push_back(0);
  REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
}
TEST_CASE("AVC IPC class bounds are checked before body allocation") {
  REQUIRE_NOTHROW(encode({Kind::capture_avc, 1, std::vector<std::uint8_t>(12)}));
  REQUIRE_THROWS_AS(encode({Kind::capture_avc, 1, std::vector<std::uint8_t>(11)}), ProtocolError);
  REQUIRE_THROWS_AS(encode({Kind::frame_avc, 1, std::vector<std::uint8_t>(27)}), ProtocolError);
  auto bytes = encode({Kind::frame_avc, 1, std::vector<std::uint8_t>(28)});
  REQUIRE(decode_header(std::span(bytes).first(header_bytes)).kind == Kind::frame_avc);
  const auto maximum = max_jpeg_bytes + avc_metadata_bytes + max_avc_config_bytes;
  bytes.resize(20);
  append_be(bytes, maximum, 4);
  REQUIRE(decode_header(bytes).length == maximum);
  bytes.resize(20);
  append_be(bytes, maximum + 1, 4);
  REQUIRE_THROWS_AS(decode_header(bytes), ProtocolError);
}
TEST_CASE("connection v3 explicit dynamic-resolution flag with strict legacy compatibility") {
  auto bytes = connection;
  bytes[1] = 3;
  bytes.insert(bytes.end(), {30, 20, 80, 0, 0, 0x3d, 9, 0, 0, 0x3d, 9, 0, 0, 0, 0, 1});
  REQUIRE(decode_connection_config(bytes).dynamic_resolution);
  REQUIRE(decode_connection_config(bytes).max_bitrate == 4000000);
  bytes.back() = 0;
  REQUIRE_FALSE(decode_connection_config(bytes).dynamic_resolution);
  for (std::size_t length = 0; length < bytes.size(); ++length)
    REQUIRE_THROWS_AS(decode_connection_config(std::span(bytes).first(length)), ProtocolError);
  for (std::size_t offset = bytes.size() - 4; offset < bytes.size(); ++offset) {
    auto invalid = bytes;
    invalid[offset] = 2;
    REQUIRE_THROWS_AS(decode_connection_config(invalid), ProtocolError);
  }
  bytes.push_back(0);
  REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
}
TEST_CASE("connection v4 explicit touch opt-in preserves legacy flags and rejects unknown bits") {
  auto bytes = connection;
  bytes[1] = 4;
  bytes.insert(bytes.end(), {30, 20, 80, 0, 0, 0x3d, 9, 0, 0, 0x3d, 9, 0, 0, 0, 0, 2});
  REQUIRE(decode_connection_config(bytes).touch);
  REQUIRE_FALSE(decode_connection_config(bytes).dynamic_resolution);
  bytes.back() = 3;
  REQUIRE(decode_connection_config(bytes).dynamic_resolution);
  bytes.back() = 4;
  REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
  bytes.back() = 2;
  bytes[1] = 3;
  REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
}
TEST_CASE("connection v5 PCM opt-in preserves flags and refuses truncated and legacy claims") {
  auto bytes = connection;
  bytes[1] = 5;
  bytes.insert(bytes.end(), {30, 20, 80, 0, 0, 0x3d, 9, 0, 0, 0x3d, 9, 0, 0, 0, 0, 4});
  for (unsigned flags = 0; flags < 8; ++flags) {
    bytes.back() = static_cast<std::uint8_t>(flags);
    const auto config = decode_connection_config(bytes);
    REQUIRE(config.pcm_output == ((flags & 4) != 0));
    REQUIRE(config.touch == ((flags & 2) != 0));
    REQUIRE(config.dynamic_resolution == ((flags & 1) != 0));
  }
  bytes.back() = 4;
  for (std::size_t length = 0; length < bytes.size(); ++length)
    REQUIRE_THROWS_AS(decode_connection_config(std::span(bytes).first(length)), ProtocolError);
  for (const unsigned flags : {8U, 128U, 255U}) {
    bytes.back() = static_cast<std::uint8_t>(flags);
    REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
  }
  bytes.back() = 4;
  bytes[1] = 4;
  REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
  bytes[1] = 5;
  bytes.push_back(0);
  REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
  REQUIRE_FALSE(decode_connection_config(connection).pcm_output);
}
TEST_CASE("connection v6 Opus opt-in refuses mixed audio modes and legacy masks") {
  auto bytes = connection;
  bytes[1] = 6;
  bytes.insert(bytes.end(), {30, 20, 80, 0, 0, 0x3d, 9, 0, 0, 0x3d, 9, 0, 0, 0, 0, 8});
  REQUIRE(decode_connection_config(bytes).opus_output);
  REQUIRE_FALSE(decode_connection_config(bytes).pcm_output);
  for (unsigned flags = 0; flags <= 255; ++flags) {
    bytes.back() = static_cast<std::uint8_t>(flags);
    if (flags > 15 || (flags & 12U) == 12U) {
      REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
    } else {
      const auto config = decode_connection_config(bytes);
      REQUIRE(config.opus_output == ((flags & 8U) != 0));
      REQUIRE(config.pcm_output == ((flags & 4U) != 0));
      REQUIRE(config.touch == ((flags & 2U) != 0));
      REQUIRE(config.dynamic_resolution == ((flags & 1U) != 0));
    }
  }
  bytes.back() = 8;
  for (std::size_t length = 0; length < bytes.size(); ++length)
    REQUIRE_THROWS_AS(decode_connection_config(std::span(bytes).first(length)), ProtocolError);
  for (unsigned schema = 1; schema <= 5; ++schema) {
    bytes[1] = static_cast<std::uint8_t>(schema);
    REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
  }
  bytes[1] = 6;
  for (std::size_t offset = bytes.size() - 4; offset < bytes.size() - 1; ++offset) {
    auto invalid = bytes;
    invalid[offset] = 1;
    REQUIRE_THROWS_AS(decode_connection_config(invalid), ProtocolError);
  }
  bytes.push_back(0);
  REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
  REQUIRE_FALSE(decode_connection_config(connection).opus_output);
}
TEST_CASE("display IPC independent vectors and exact class bounds before allocation") {
  const DisplayUpdate update{1, 2, {1920, 1080}, true, true, {3840, 2160}, 3840U * 2160U};
  const std::vector<std::uint8_t> expected{0,    0, 0, 0,    0, 0, 0,    1,    0,    0, 0,
                                           0,    0, 0, 0,    2, 7, 0x80, 4,    0x38, 3, 0,
                                           0x0f, 0, 8, 0x70, 0, 0, 0,    0x7e, 0x90, 0};
  REQUIRE(encode_display_update(update) == expected);
  const std::vector<std::uint8_t> resize{5, 0, 2, 0xd0};
  const auto size = decode_display_resize(resize);
  REQUIRE(size.width == 1280);
  REQUIRE(size.height == 720);
  REQUIRE(decode_display_resize(std::vector<std::uint8_t>(4)).width == 0);
  REQUIRE(encode_resize_result(ResizeResult::timeout) == std::vector<std::uint8_t>{0, 6, 0, 0});
  REQUIRE_THROWS_AS(encode_resize_result(static_cast<ResizeResult>(8)), ProtocolError);
  for (const auto [kind, length] : {std::pair{Kind::display_update, std::size_t{32}},
                                    {Kind::display_resize, 4},
                                    {Kind::display_resize_result, 4}}) {
    auto header = encode({kind, 1, std::vector<std::uint8_t>(length)});
    header.resize(header_bytes);
    REQUIRE(decode_header(header).length == length);
    for (const auto bad_length : {std::uint64_t{0}, std::uint64_t{length - 1},
                                  std::uint64_t{length + 1}, std::uint64_t{UINT32_MAX}}) {
      header.resize(20);
      append_be(header, bad_length, 4);
      REQUIRE_THROWS_AS(decode_header(header), ProtocolError);
    }
  }
  REQUIRE_THROWS_AS(decode_display_resize(std::span(resize).first(3)), ProtocolError);
  for (const auto index : {0, 1, 2, 3, 4, 5}) {
    auto bad = update;
    switch (index) {
    case 0:
      bad.generation = 0;
      break;
    case 1:
      bad.framebuffer_revision = 0;
      break;
    case 2:
      bad.actual.width = 7681;
      break;
    case 3:
      bad.negotiated = false;
      break;
    case 4:
      bad.max_area = 3840U * 2160U + 1;
      break;
    case 5:
      bad.maximum.height = 2161;
      break;
    }
    REQUIRE_THROWS_AS(encode_display_update(bad), ProtocolError);
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
