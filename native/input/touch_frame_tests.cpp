#include "touch_frame.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <vector>
using namespace bridge::touch;
namespace {
std::vector<std::uint8_t> packet(std::span<const std::uint8_t> contacts, std::uint8_t count = 1) {
  const std::array<std::uint8_t, 10> header{3, 0, 0, 0, 0, 0, 0, 1, count, 0};
  std::vector<std::uint8_t> bytes(header.size() + contacts.size());
  std::copy(header.begin(), header.end(), bytes.begin());
  std::copy(contacts.begin(), contacts.end(), bytes.data() + header.size());
  for (unsigned i = 0; i < 4; ++i)
    bytes[2 + i] = static_cast<std::uint8_t>(bytes.size() >> (i * 8));
  return bytes;
}
TerminalRecord record(std::span<const std::uint8_t> bytes) {
  TerminalRecord result;
  REQUIRE(bytes.size() <= result.bytes.size());
  result.size = bytes.size();
  std::copy(bytes.begin(), bytes.end(), result.bytes.begin());
  return result;
}
} // namespace
TEST_CASE("touch frame decoder reads signed native records and optional bounded fields") {
  const std::array<std::uint8_t, 15> encoded{7, 7, 0x21, 0x42, 0x58, 36, 0x41, 0x41,
                                             1, 1, 0x41, 0x67, 0x44, 0,  0};
  // All three optional fields: rectangle -1,-1,+1,+1, orientation 359, pressure 1024.
  const auto bytes = packet(std::span(encoded).first(14));
  const auto parsed = read_touch_frame(bytes);
  REQUIRE(parsed);
  REQUIRE(parsed->count == 1);
  REQUIRE(parsed->contacts[0].id == 7);
  REQUIRE(parsed->contacts[0].x == -1);
  REQUIRE(parsed->contacts[0].y == 600);
  REQUIRE(parsed->contacts[0].flags == 36);
  REQUIRE(parsed->contacts[0].encoded.size() == 14);
  REQUIRE(std::equal(parsed->contacts[0].encoded.begin(), parsed->contacts[0].encoded.end(),
                     encoded.begin()));
}
TEST_CASE("touch decoder validates complete records before reporting truncated input") {
  const std::array<std::uint8_t, 9> contact{0, 1, 1, 2, 36, 0, 0, 2, 2};
  const auto valid = packet(contact);
  REQUIRE(read_touch_frame(valid));
  for (std::size_t size = 0; size < valid.size(); ++size) {
    auto bytes = valid;
    bytes.resize(size);
    if (size >= 6)
      for (unsigned i = 0; i < 4; ++i)
        bytes[2 + i] = static_cast<std::uint8_t>(size >> (i * 8));
    REQUIRE_FALSE(read_touch_frame(bytes));
  }
  auto extra = valid;
  extra.push_back(0);
  extra[2]++;
  REQUIRE_FALSE(read_touch_frame(extra));
}
TEST_CASE("touch frame decoder bounds counts and rejects duplicate IDs and unknown fields") {
  std::vector<std::uint8_t> contacts;
  for (std::uint8_t id = 0; id < 64; ++id)
    contacts.insert(contacts.end(), {id, 0, 1, 2, 36});
  auto bytes = packet(contacts, 64);
  const auto parsed = read_touch_frame(bytes);
  REQUIRE(parsed);
  REQUIRE(parsed->count == 64);
  bytes[8] = 65;
  REQUIRE_FALSE(read_touch_frame(bytes));
  bytes[8] = 0;
  REQUIRE_FALSE(read_touch_frame(bytes));
  bytes[8] = 64;
  bytes[15] = 0;
  REQUIRE_FALSE(read_touch_frame(bytes));
  const std::array<std::uint8_t, 5> unknown{0, 8, 1, 2, 36};
  REQUIRE_FALSE(read_touch_frame(packet(unknown)));
  const std::array<std::uint8_t, 5> bad_flags{0, 0, 1, 2, 63};
  REQUIRE_FALSE(read_touch_frame(packet(bad_flags)));
  const std::array<std::uint8_t, 7> bad_orientation{0, 2, 1, 2, 36, 0x41, 0x68};
  REQUIRE_FALSE(read_touch_frame(packet(bad_orientation)));
  const std::array<std::uint8_t, 7> bad_pressure{0, 4, 1, 2, 36, 0x44, 1};
  REQUIRE_FALSE(read_touch_frame(packet(bad_pressure)));
}
TEST_CASE("touch frame framing rejects every altered header byte before body processing") {
  const std::array<std::uint8_t, 5> contact{0, 0, 1, 2, 36};
  const auto original = packet(contact);
  for (std::size_t index = 0; index < 6; ++index)
    for (unsigned value = 0; value < 256; ++value) {
      auto bytes = original;
      bytes[index] = static_cast<std::uint8_t>(value);
      REQUIRE(bool(read_touch_frame(bytes)) == (bytes[index] == original[index]));
    }
  auto bytes = original;
  bytes[7] = 2;
  REQUIRE_FALSE(read_touch_frame(bytes));
  bytes.resize(8193);
  REQUIRE_FALSE(read_touch_frame(bytes));
}
TEST_CASE("terminal packet preserves native UP fields without replaying active contacts") {
  const std::array<std::uint8_t, 5> up{0, 0, 1, 2, 4}, canceled{1, 0, 3, 4, 36};
  const std::array<TerminalRecord, 2> records{record(up), record(canceled)};
  const auto result = terminal_packet(records);
  REQUIRE(result);
  REQUIRE(result->size == 20);
  const auto parsed = read_touch_frame(std::span(result->bytes).first(result->size));
  REQUIRE(parsed);
  REQUIRE(parsed->count == 2);
  REQUIRE(parsed->contacts[0].flags == 4);
  REQUIRE(parsed->contacts[1].flags == 36);
  REQUIRE(std::equal(up.begin(), up.end(), parsed->contacts[0].encoded.begin()));
  REQUIRE(std::equal(canceled.begin(), canceled.end(), parsed->contacts[1].encoded.begin()));
}
TEST_CASE("terminal packet rejects active, duplicate, truncated and excessive terminal records") {
  const std::array<std::uint8_t, 5> active{0, 0, 1, 2, 25}, up{0, 0, 1, 2, 4};
  std::array<TerminalRecord, 2> records{record(active), record(up)};
  REQUIRE_FALSE(terminal_packet(records));
  records[0] = records[1];
  REQUIRE_FALSE(terminal_packet(records));
  records[0].size = 32;
  REQUIRE_FALSE(terminal_packet(std::span(records).first(1)));
  records[0].size = 0;
  REQUIRE_FALSE(terminal_packet(std::span(records).first(1)));
  REQUIRE_FALSE(terminal_packet({}));
  std::array<TerminalRecord, 11> too_many{};
  REQUIRE_FALSE(terminal_packet(too_many));
}
TEST_CASE("touch decoder accepts full signed widths and rejects incomplete variable integers") {
  const std::array<std::uint8_t, 11> contact{0,    0,    0xdf, 0xff, 0xff, 0xff,
                                             0xff, 0xff, 0xff, 0xff, 4};
  const auto parsed_bytes = packet(contact);
  const auto parsed = read_touch_frame(parsed_bytes);
  REQUIRE(parsed);
  REQUIRE(parsed->contacts[0].x == 0x1fffffff);
  REQUIRE(parsed->contacts[0].y == -0x1fffffff);
  for (unsigned prefix = 0; prefix < 256; ++prefix) {
    const std::array<std::uint8_t, 3> truncated{0, 0, static_cast<std::uint8_t>(prefix)};
    REQUIRE_FALSE(read_touch_frame(packet(truncated)));
  }
}
