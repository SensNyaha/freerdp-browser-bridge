#include "connection_config.hpp"
#include "../files/drive_descriptor.hpp"
#include <catch2/catch_test_macros.hpp>
using namespace bridge::ipc;
namespace {
std::vector<std::uint8_t> settings(unsigned count, std::string name = "Documents", std::string subdir = "users/inbox") {
  std::vector<std::uint8_t> bytes{0,15,0,9,'l','o','c','a','l','h','o','s','t',0,1,'u',0,0,
      0x0d,0x3d,4,0,3,0,0,32,2,1,2,0,0,0,0x13,0x88,0,0,3,0xe8,
      30,20,80,0,0,0x3d,9,0,0,0x3d,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0};
  append_be(bytes, count, 2);
  for (unsigned i = 0; i < count && i < 33; ++i) {
    const auto title = count == 1 ? name : std::to_string(i) + name;
    for (const auto &text : {title, subdir}) {
      append_be(bytes, text.size(), 2);bytes.insert(bytes.end(), text.begin(), text.end());
    }
    bytes.push_back(1);bytes.push_back(0);
  }
  return bytes;
}
}
TEST_CASE("Managed CONFIGURE v15 carries bounded session-relative shares independently of clipboard") {
  const auto bytes = settings(1);
  const auto decoded = decode_connection_config(bytes);
  REQUIRE(decoded.drives.size() == 1);
  REQUIRE(decoded.drives[0].name == "Documents");
  REQUIRE(decoded.drives[0].subdir == "users/inbox");
  REQUIRE(decoded.drives[0].read_only);
  REQUIRE_FALSE(decoded.clipboard_image);REQUIRE_FALSE(decoded.clipboard_html);
  for (std::size_t n = 0; n < bytes.size(); ++n)
    REQUIRE_THROWS_AS(decode_connection_config(::bridge::compat::span(bytes).first(n)), ProtocolError);
  auto extra = bytes;extra.push_back(0);
  REQUIRE_THROWS_AS(decode_connection_config(extra), ProtocolError);
  for (unsigned schema = 1; schema < 15; ++schema) {
    extra = bytes;extra[1] = static_cast<std::uint8_t>(schema);
    REQUIRE_THROWS_AS(decode_connection_config(extra), ProtocolError);
  }
  REQUIRE(decode_connection_config(settings(32, "files", std::string(253, 'a'))).drives.size() == 32);
  REQUIRE_THROWS_AS(decode_connection_config(settings(0)), ProtocolError);
  REQUIRE_THROWS_AS(decode_connection_config(settings(33)), ProtocolError);
  for (const auto offset : {bytes.size() - 1, bytes.size() - 2}) {
    extra = bytes;extra[offset] = 2;
    REQUIRE_THROWS_AS(decode_connection_config(extra), ProtocolError);
  }
  extra.resize(maximum_configure_bytes + 1);
  REQUIRE_THROWS_AS(decode_connection_config(extra), ProtocolError);
  REQUIRE_THROWS_AS(encode({Kind::configure, 1, extra}), ProtocolError);
}
TEST_CASE("Managed descriptors reject host paths, reserved names and DOS prefix collisions") {
  for (const auto *name : {"", "CON", "con.txt", "../x", "a/b", "a\\b", "C:", "bad.", "bad ", "first   tail", "123456 tail"})
    REQUIRE_THROWS_AS(decode_connection_config(settings(1, name)), ProtocolError);
  REQUIRE_THROWS_AS(decode_connection_config(settings(1, std::string(65, 'a'))), ProtocolError);
  for (const auto *path : {"", "/home", "C:/home", "../escape", "a/../b", "a//b", "a\\b", "CON", "a/NUL", "a/"})
    REQUIRE_THROWS_AS(decode_connection_config(settings(1, "FILES", path)), ProtocolError);
  REQUIRE_THROWS_AS(decode_connection_config(settings(1, "FILES", std::string(254, 'a'))), ProtocolError);
  auto bytes = settings(2, "ABCDEFGH-tail");
  // Distinct full names and eighth bytes still collide in the seven-byte DOS key.
  const auto at = bytes.size() - 2 * (14 + 11 + 6) + 2;
  REQUIRE(bytes[at] == '0');bytes[at] = 'A';
  const auto second = at + 2 + 14 + 2 + 11 + 2;
  REQUIRE(bytes[second] == '1');bytes[second] = 'a';
  bytes[at + 7] = '0';bytes[second + 7] = '1';
  REQUIRE_THROWS_AS(decode_connection_config(bytes), ProtocolError);
  REQUIRE(bridge::files::drive_dos_key("Documents-one") == "DOCUMEN");
}
