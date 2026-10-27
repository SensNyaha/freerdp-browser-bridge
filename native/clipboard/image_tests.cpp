#include "image.hpp"
#include <algorithm>
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <vector>

using namespace bridge::clipboard;
namespace {
using Bytes = ::bridge::compat::span<const std::uint8_t>;
void field(std::vector<std::uint8_t> &bytes, std::size_t at, std::uint32_t value) {
  REQUIRE(at + 4 <= bytes.size());
  for (unsigned i = 0; i < 4; ++i)
    bytes[at + i] = static_cast<std::uint8_t>(value >> (8 * i));
}
std::vector<std::uint8_t> dib(std::size_t header, std::uint32_t width, std::uint32_t height,
                              std::uint16_t bits, std::size_t body, std::uint32_t compression = 0) {
  std::vector<std::uint8_t> bytes(header + body);
  field(bytes, 0, static_cast<std::uint32_t>(header));
  field(bytes, 4, width);
  field(bytes, 8, height);
  bytes[12] = 1;
  bytes[14] = static_cast<std::uint8_t>(bits);
  field(bytes, 16, compression);
  field(bytes, 20, static_cast<std::uint32_t>(body));
  if (header >= 108)
    field(bytes, 56, 0x73524742);
  return bytes;
}
void no_metadata(const ImageInspection &view, ImageStatus status) {
  REQUIRE(view.status == status);
  REQUIRE(view.width == 0);
  REQUIRE(view.height == 0);
  REQUIRE(view.pixel_offset == 0);
  REQUIRE(view.row_bytes == 0);
  REQUIRE(view.pixel_bytes == 0);
  REQUIRE(view.rgba_bytes == 0);
  REQUIRE(view.bits == 0);
  REQUIRE(view.shifts == std::array<std::uint8_t, 4>{});
  REQUIRE_FALSE(view.bottom_up);
  REQUIRE_FALSE(view.alpha);
}
void refused(Bytes input, std::size_t maximum, ImageStatus status) {
  no_metadata(inspect_dib_clipboard(input, maximum), status);
  std::array<std::uint8_t, 256> output;
  output.fill(0xa5);
  const auto result = decode_dib_clipboard(input, output, maximum);
  REQUIRE(result.status == status);
  REQUIRE(result.bytes == 0);
  REQUIRE(result.width == 0);
  REQUIRE(result.height == 0);
  REQUIRE(std::all_of(output.begin(), output.end(), [](auto value) { return value == 0xa5; }));
}
} // namespace

TEST_CASE("image clipboard canonical DIBV5 has independent complete header and alpha bytes") {
  const std::array<std::uint8_t, 8> rgba{0x12, 0x34, 0x56, 0x78, 0xfe, 0xdc, 0xba, 0x98};
  auto expected = dib(124, 1, 0xfffffffeU, 32, 8, 3);
  field(expected, 40, 0x00ff0000);
  field(expected, 44, 0x0000ff00);
  field(expected, 48, 0x000000ff);
  field(expected, 52, 0xff000000);
  field(expected, 108, 4);
  const std::array<std::uint8_t, 8> bgra{0x56, 0x34, 0x12, 0x78, 0xba, 0xdc, 0xfe, 0x98};
  std::copy(bgra.begin(), bgra.end(), expected.begin() + 124);
  std::array<std::uint8_t, 140> encoded;
  encoded.fill(0xa5);
  const auto written = encode_dibv5_clipboard(rgba, 1, 2, encoded, 132);
  REQUIRE(written.status == ImageStatus::ok);
  REQUIRE(written.bytes == expected.size());
  REQUIRE(std::equal(expected.begin(), expected.end(), encoded.begin()));
  REQUIRE(
      std::all_of(encoded.begin() + 132, encoded.end(), [](auto value) { return value == 0xa5; }));
  const auto view = inspect_dib_clipboard(expected, 132);
  REQUIRE(view.status == ImageStatus::ok);
  REQUIRE(view.width == 1);
  REQUIRE(view.height == 2);
  REQUIRE(view.row_bytes == 4);
  REQUIRE(view.pixel_bytes == 8);
  REQUIRE_FALSE(view.bottom_up);
  REQUIRE(view.alpha);
  std::array<std::uint8_t, 12> decoded;
  decoded.fill(0xa5);
  const auto result = decode_dib_clipboard(expected, decoded, 132);
  REQUIRE(result.status == ImageStatus::ok);
  REQUIRE(result.bytes == rgba.size());
  REQUIRE(std::equal(rgba.begin(), rgba.end(), decoded.begin()));
  REQUIRE(
      std::all_of(decoded.begin() + 8, decoded.end(), [](auto value) { return value == 0xa5; }));
}

TEST_CASE("image clipboard BGR24 honors bottom-up and top-down rows and ignores padding") {
  auto bytes = dib(40, 1, 2, 24, 8);
  const std::array<std::uint8_t, 8> pixels{0x66, 0x55, 0x44, 0xee, 0x33, 0x22, 0x11, 0xdd};
  std::copy(pixels.begin(), pixels.end(), bytes.begin() + 40);
  std::array<std::uint8_t, 8> decoded{};
  REQUIRE(decode_dib_clipboard(bytes, decoded, bytes.size()).status == ImageStatus::ok);
  REQUIRE(decoded == std::array<std::uint8_t, 8>{0x11, 0x22, 0x33, 0xff, 0x44, 0x55, 0x66, 0xff});
  field(bytes, 8, 0xfffffffeU);
  REQUIRE(decode_dib_clipboard(bytes, decoded, bytes.size()).status == ImageStatus::ok);
  REQUIRE(decoded == std::array<std::uint8_t, 8>{0x44, 0x55, 0x66, 0xff, 0x11, 0x22, 0x33, 0xff});
  for (std::uint32_t width = 1; width <= 9; ++width) {
    const auto stride = ((width * 3 + 3) / 4) * 4;
    auto padded = dib(40, width, 1, 24, stride);
    std::fill(padded.begin() + 40, padded.end(), 0xec);
    for (std::size_t x = 0; x < width; ++x) {
      padded[40 + x * 3] = 3;
      padded[41 + x * 3] = 2;
      padded[42 + x * 3] = 1;
    }
    std::vector<std::uint8_t> output(width * 4);
    REQUIRE(decode_dib_clipboard(padded, output, padded.size()).status == ImageStatus::ok);
    for (std::size_t x = 0; x < width; ++x)
      REQUIRE(std::equal(output.begin() + x * 4, output.begin() + x * 4 + 4,
                         std::array<std::uint8_t, 4>{1, 2, 3, 0xff}.begin()));
  }
}

TEST_CASE("image clipboard opaque BGRX and explicit byte masks remain distinct") {
  auto opaque = dib(40, 1, 1, 32, 4);
  field(opaque, 40, 0x00332211);
  std::array<std::uint8_t, 4> output{};
  REQUIRE(decode_dib_clipboard(opaque, output, opaque.size()).status == ImageStatus::ok);
  REQUIRE(output == std::array<std::uint8_t, 4>{0x33, 0x22, 0x11, 0xff});
  for (const auto header : {108U, 124U}) {
    auto bytes = dib(header, 1, 1, 32, 4, 3);
    field(bytes, 40, 0x000000ff);
    field(bytes, 44, 0xff000000);
    field(bytes, 48, 0x0000ff00);
    field(bytes, 52, 0x00ff0000);
    field(bytes, header, 0x40302010);
    REQUIRE(decode_dib_clipboard(bytes, output, bytes.size()).status == ImageStatus::ok);
    REQUIRE(output == std::array<std::uint8_t, 4>{0x10, 0x40, 0x20, 0x30});
    field(bytes, 56, 0x57696e20);
    REQUIRE(inspect_dib_clipboard(bytes, bytes.size()).status == ImageStatus::ok);
    field(bytes, 52, 0);
    REQUIRE(decode_dib_clipboard(bytes, output, bytes.size()).status == ImageStatus::ok);
    REQUIRE(output == std::array<std::uint8_t, 4>{0x10, 0x40, 0x20, 0xff});
  }
  auto external = dib(40, 1, 1, 32, 16, 3);
  field(external, 40, 0x000000ff);
  field(external, 44, 0x0000ff00);
  field(external, 48, 0x00ff0000);
  field(external, 52, 0x00332211);
  field(external, 20, 4);
  REQUIRE(decode_dib_clipboard(external, output, external.size()).status == ImageStatus::ok);
  REQUIRE(output == std::array<std::uint8_t, 4>{0x11, 0x22, 0x33, 0xff});
}

TEST_CASE("image clipboard refuses malformed lengths and dimensions with no partial output") {
  const std::array<std::uint8_t, 4> rgba{1, 2, 3, 4};
  std::array<std::uint8_t, 128> encoded{};
  REQUIRE(encode_dibv5_clipboard(rgba, 1, 1, encoded, encoded.size()).status == ImageStatus::ok);
  for (std::size_t size = 0; size < encoded.size(); ++size)
    refused(Bytes(encoded).first(size), encoded.size(), ImageStatus::invalid);
  for (const auto at : {4U, 8U}) {
    for (const auto value : {0U, 0x80000000U}) {
      auto bytes = std::vector<std::uint8_t>(encoded.begin(), encoded.end());
      field(bytes, at, value);
      refused(bytes, bytes.size(), ImageStatus::invalid);
    }
  }
  for (const auto at : {0U, 12U, 20U, 120U}) {
    auto bytes = std::vector<std::uint8_t>(encoded.begin(), encoded.end());
    field(bytes, at, 2);
    refused(bytes, bytes.size(), ImageStatus::invalid);
  }
  auto extra = std::vector<std::uint8_t>(encoded.begin(), encoded.end());
  extra.push_back(0);
  refused(extra, extra.size(), ImageStatus::invalid);
  auto absent_masks = dib(40, 1, 1, 32, 8, 3);
  refused(absent_masks, absent_masks.size(), ImageStatus::invalid);
}

TEST_CASE("image clipboard bounds decoded expansion and signed overflow before pixel access") {
  auto bytes = dib(40, 100, 100, 24, 0);
  refused(bytes, 31000, ImageStatus::too_large);
  field(bytes, 4, 0x7fffffff);
  field(bytes, 8, 0x7fffffff);
  refused(bytes, max_item_bytes, ImageStatus::too_large);
  refused(bytes, 0, ImageStatus::invalid);
  refused(bytes, max_item_bytes + 1, ImageStatus::invalid);
  refused(bytes, bytes.size() - 1, ImageStatus::too_large);
}

TEST_CASE("image clipboard refuses palette compression profiles and ambiguous masks") {
  for (const auto compression : {1U, 2U, 4U, 5U, 6U}) {
    auto bytes = dib(40, 1, 1, 32, 4, compression);
    refused(bytes, bytes.size(), ImageStatus::unsupported);
  }
  for (const auto bits : {1U, 4U, 8U, 16U}) {
    auto bytes = dib(40, 1, 1, static_cast<std::uint16_t>(bits), 4);
    refused(bytes, bytes.size(), ImageStatus::unsupported);
  }
  for (const auto at : {32U, 36U, 56U, 112U, 116U}) {
    auto bytes = dib(124, 1, 1, 32, 4);
    field(bytes, at, 1);
    refused(bytes, bytes.size(), ImageStatus::unsupported);
  }
  auto bytes = dib(124, 1, 1, 32, 4, 3);
  field(bytes, 40, 0x00ff0000);
  field(bytes, 44, 0x0000ff00);
  field(bytes, 48, 0x000000ff);
  field(bytes, 52, 0xff000000);
  for (const auto at : {40U, 44U, 48U, 52U}) {
    auto invalid = bytes;
    field(invalid, at, 0x000000ff);
    if (at != 48)
      refused(invalid, invalid.size(), ImageStatus::unsupported);
    field(invalid, at, 0x0000001f);
    refused(invalid, invalid.size(), ImageStatus::unsupported);
  }
  auto unknown = dib(64, 1, 1, 32, 4);
  refused(unknown, unknown.size(), ImageStatus::unsupported);
}

TEST_CASE("image clipboard probes exact capacities and refuses overlapping storage atomically") {
  const std::array<std::uint8_t, 4> rgba{1, 2, 3, 4};
  std::array<std::uint8_t, 128> output;
  output.fill(0xa5);
  auto result = encode_dibv5_clipboard(rgba, 1, 1, {}, 128);
  REQUIRE(result.status == ImageStatus::capacity);
  REQUIRE(result.bytes == 128);
  REQUIRE(result.width == 1);
  REQUIRE(result.height == 1);
  REQUIRE(encode_dibv5_clipboard(rgba, 1, 1, output, 127).status == ImageStatus::too_large);
  REQUIRE(encode_dibv5_clipboard(rgba, 2, 1, output, 256).status == ImageStatus::invalid);
  REQUIRE(encode_dibv5_clipboard(rgba, 0x80000000U, 1, output, 128).status == ImageStatus::invalid);
  REQUIRE(encode_dibv5_clipboard(rgba, 0x7fffffffU, 0x7fffffffU, output, 128).status ==
          ImageStatus::too_large);
  REQUIRE(encode_dibv5_clipboard(Bytes(output).first(4), 1, 1, output, 128).status ==
          ImageStatus::invalid);
  REQUIRE(std::all_of(output.begin(), output.end(), [](auto value) { return value == 0xa5; }));
  REQUIRE(encode_dibv5_clipboard(rgba, 1, 1, output, 128).status == ImageStatus::ok);
  std::array<std::uint8_t, 3> short_output{0xa5, 0xa5, 0xa5};
  result = decode_dib_clipboard(output, short_output, 128);
  REQUIRE(result.status == ImageStatus::capacity);
  REQUIRE(result.bytes == 4);
  REQUIRE(short_output == std::array<std::uint8_t, 3>{0xa5, 0xa5, 0xa5});
  const auto saved = output;
  REQUIRE(decode_dib_clipboard(output, output, 128).status == ImageStatus::invalid);
  REQUIRE(output == saved);
}
