#include "../compat/span.hpp"
#include "text.hpp"
#include <algorithm>
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <string_view>
#include <vector>

using namespace bridge::clipboard;
namespace {
::bridge::compat::span<const std::uint8_t> bytes(std::string_view value) {
  return {reinterpret_cast<const std::uint8_t *>(value.data()), value.size()};
}
} // namespace
TEST_CASE("Clipboard Unicode text uses independent UTF8 UTF16LE and CRLF vectors") {
  const std::string_view text = "A\n\xd0\x96\xe4\xb8\xad\xf0\x9f\x98\x80";
  const std::vector<std::uint8_t> wire{0x41, 0,    13,   0,    10, 0,    0x16, 4,
                                       0x2d, 0x4e, 0x3d, 0xd8, 0,  0xde, 0,    0};
  std::array<std::uint8_t, 64> encoded{}, decoded{};
  const auto a = encode_unicode_text(bytes(text), encoded, 64);
  REQUIRE(a.status == TextStatus::ok);
  REQUIRE(a.bytes == wire.size());
  REQUIRE(std::equal(wire.begin(), wire.end(), encoded.begin()));
  const auto b = decode_unicode_text(wire, decoded, 64);
  REQUIRE(b.status == TextStatus::ok);
  REQUIRE(b.bytes == text.size());
  REQUIRE(std::equal(text.begin(), text.end(), reinterpret_cast<const char *>(decoded.data())));
  const auto measured = encode_unicode_text(bytes(text), {}, 64);
  REQUIRE(measured.status == TextStatus::capacity);
  REQUIRE(measured.bytes == wire.size());
}
TEST_CASE("Clipboard line endings padding empty text and Unicode noncharacters remain explicit") {
  std::array<std::uint8_t, 64> out{};
  const auto a = encode_unicode_text(bytes("a\rb\r\nc\nd"), out, 64);
  const std::vector<std::uint8_t> expected{97, 0,  13, 0,  10, 0,  98, 0,   13, 0, 10,
                                           0,  99, 0,  13, 0,  10, 0,  100, 0,  0, 0};
  REQUIRE(a.status == TextStatus::ok);
  REQUIRE(a.bytes == expected.size());
  REQUIRE(std::equal(expected.begin(), expected.end(), out.begin()));
  const std::vector<std::uint8_t> padded{97, 0, 13, 0, 10,  0, 98, 0, 13, 0,
                                         99, 0, 10, 0, 100, 0, 0,  0, 0,  0};
  const auto b = decode_unicode_text(padded, out, 64);
  REQUIRE(b.status == TextStatus::ok);
  REQUIRE(b.bytes == 7);
  REQUIRE(std::equal(out.begin(), out.begin() + 7, bytes("a\nb\nc\nd").begin()));
  REQUIRE(encode_unicode_text({}, out, 2).bytes == 2);
  REQUIRE(out[0] == 0);
  REQUIRE(out[1] == 0);
  REQUIRE(decode_unicode_text(std::array<std::uint8_t, 4>{}, {}, 4).status == TextStatus::ok);
  const std::vector<std::uint8_t> extremes{0xff, 0xfe, 0xff, 0xff, 0xff, 0xdb, 0xff, 0xdf, 0, 0};
  const auto c = decode_unicode_text(extremes, out, 64);
  const std::vector<std::uint8_t> utf8{0xef, 0xbb, 0xbf, 0xef, 0xbf, 0xbf, 0xf4, 0x8f, 0xbf, 0xbf};
  REQUIRE(c.status == TextStatus::ok);
  REQUIRE(c.bytes == utf8.size());
  REQUIRE(std::equal(utf8.begin(), utf8.end(), out.begin()));
}
TEST_CASE("Clipboard invalid encodings and hidden trailing data never partially mutate output") {
  const std::vector<std::vector<std::uint8_t>> invalid_utf8{{0},
                                                            {0x80},
                                                            {0xc0, 0xaf},
                                                            {0xc1, 0xbf},
                                                            {0xe0, 0x80, 0x80},
                                                            {0xed, 0xa0, 0x80},
                                                            {0xf0, 0x80, 0x80, 0x80},
                                                            {0xf4, 0x90, 0x80, 0x80},
                                                            {0xf5, 0x80, 0x80, 0x80},
                                                            {0xc2},
                                                            {0xe1, 0x80},
                                                            {0xf1, 0x80, 0x80},
                                                            {0xe2, 0x28, 0xa1},
                                                            {65, 0xff}};
  const std::vector<std::vector<std::uint8_t>> invalid_utf16{{},
                                                             {65},
                                                             {65, 0},
                                                             {0, 0xd8, 0, 0},
                                                             {0, 0xdc, 0, 0},
                                                             {0, 0xd8, 65, 0, 0, 0},
                                                             {0xff, 0xdb},
                                                             {0, 0, 65, 0},
                                                             {65, 0, 0, 0, 0, 0xd8},
                                                             {65, 0, 0, 0, 0}};
  for (const bool encode : {false, true})
    for (const auto &input : encode ? invalid_utf8 : invalid_utf16) {
      std::array<std::uint8_t, 64> output;
      output.fill(0x5a);
      const auto result =
          encode ? encode_unicode_text(input, output, 64) : decode_unicode_text(input, output, 64);
      REQUIRE(result.status == TextStatus::invalid);
      REQUIRE(result.bytes == 0);
      REQUIRE(std::all_of(output.begin(), output.end(), [](auto value) { return value == 0x5a; }));
    }
}
TEST_CASE(
    "Clipboard byte policy output capacity and overlap refuse atomically at exact boundaries") {
  std::array<std::uint8_t, 16> out;
  out.fill(0x5a);
  REQUIRE(encode_unicode_text(bytes("A\n"), out, 8).status == TextStatus::ok);
  out.fill(0x5a);
  REQUIRE(encode_unicode_text(bytes("A\n"), out, 7).status == TextStatus::too_large);
  REQUIRE(std::all_of(out.begin(), out.end(), [](auto value) { return value == 0x5a; }));
  const auto limited = encode_unicode_text(bytes("A\n"), ::bridge::compat::span(out).first(7), 8);
  REQUIRE(limited.status == TextStatus::capacity);
  REQUIRE(limited.bytes == 8);
  REQUIRE(std::all_of(out.begin(), out.end(), [](auto value) { return value == 0x5a; }));
  REQUIRE(encode_unicode_text({}, out, 0).status == TextStatus::invalid);
  REQUIRE(encode_unicode_text({}, out, max_item_bytes + 1).status == TextStatus::invalid);
  std::vector<std::uint8_t> oversized(max_item_bytes + 1, 65);
  REQUIRE(encode_unicode_text(oversized, out, max_item_bytes).status == TextStatus::too_large);
  const std::array<std::uint8_t, 8> wire{65, 0, 13, 0, 10, 0, 0, 0};
  REQUIRE(decode_unicode_text(wire, ::bridge::compat::span(out).first(1), 8).status == TextStatus::capacity);
  REQUIRE(decode_unicode_text(wire, out, 7).status == TextStatus::too_large);
  std::array<std::uint8_t, 8> overlap{65, 66, 67};
  const auto original = overlap;
  REQUIRE(encode_unicode_text(::bridge::compat::span(overlap).first(3), overlap, 8).status ==
          TextStatus::invalid);
  REQUIRE(overlap == original);
  REQUIRE(decode_unicode_text(overlap, overlap, 8).status == TextStatus::invalid);
  REQUIRE(overlap == original);
}
