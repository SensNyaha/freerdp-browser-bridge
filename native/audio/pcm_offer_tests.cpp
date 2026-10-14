#include "pcm_offer.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <vector>

using namespace bridge::audio;
namespace {
constexpr std::array<std::uint8_t, 18> stereo48{1,   0, 2, 0, 128, 187, 0, 0, 0,
                                                238, 2, 0, 4, 0,   16,  0, 0, 0};
constexpr std::array<std::uint8_t, 18> mono8{1,  0, 1, 0, 64, 31, 0, 0, 64,
                                             31, 0, 0, 1, 0,  8,  0, 0, 0};
void header(std::vector<std::uint8_t> &bytes, std::size_t count) {
  bytes[0] = 7;
  bytes[2] = static_cast<std::uint8_t>(bytes.size() - 4);
  bytes[3] = static_cast<std::uint8_t>((bytes.size() - 4) >> 8);
  bytes[18] = static_cast<std::uint8_t>(count);
  bytes[19] = static_cast<std::uint8_t>(count >> 8);
}
std::vector<std::uint8_t> packet(std::span<const std::uint8_t> descriptor, std::size_t count = 1) {
  std::vector<std::uint8_t> bytes(24 + count * descriptor.size());
  for (std::size_t i = 0; i < count; ++i)
    std::copy(descriptor.begin(), descriptor.end(), bytes.data() + 24 + i * descriptor.size());
  header(bytes, count);
  return bytes;
}
} // namespace

TEST_CASE("PCM offer selection preserves supported source descriptors and metadata") {
  auto input = packet(stereo48, 2);
  std::copy(mono8.begin(), mono8.end(), input.data() + 24 + stereo48.size());
  header(input, 2);
  input[4] = 3;
  input[8] = 42;
  input[20] = 9;
  input[21] = 6;
  const auto original = input;
  std::array<std::uint8_t, max_pcm_offer_bytes> output{};
  const auto selected = select_pcm_offers(input, output);
  REQUIRE(selected);
  REQUIRE(selected->count == 2);
  REQUIRE(std::vector(selected->bytes.begin(), selected->bytes.end()) == original);
  REQUIRE(input == original);
}

TEST_CASE("PCM offer filtering removes unsupported and compressed entries in stable order") {
  auto compressed = stereo48, wide = stereo48;
  compressed[0] = 2;
  wide[14] = 24;
  std::vector<std::uint8_t> input(24 + 5 * stereo48.size());
  std::size_t offset = 24;
  for (const auto &descriptor : {compressed, wide, mono8, compressed, stereo48}) {
    std::copy(descriptor.begin(), descriptor.end(), input.data() + offset);
    offset += descriptor.size();
  }
  header(input, 5);
  const auto original = input;
  auto expected = packet(mono8, 2);
  std::copy(stereo48.begin(), stereo48.end(), expected.data() + 24 + mono8.size());
  header(expected, 2);
  std::array<std::uint8_t, max_pcm_offer_bytes> output{};
  const auto selected = select_pcm_offers(input, output);
  REQUIRE(selected);
  REQUIRE(selected->count == 2);
  REQUIRE(std::vector(selected->bytes.begin(), selected->bytes.end()) == expected);
  REQUIRE(input == original);
}

TEST_CASE("PCM offers require supported widths rates channels alignment averages and no extras") {
  auto descriptor = stereo48;
  SECTION("width") { descriptor[14] = 24; }
  SECTION("zero rate") { descriptor[4] = descriptor[5] = 0; }
  SECTION("above rate ceiling") { descriptor[4] = 129; }
  SECTION("below rate floor") {
    descriptor[4] = 63;
    descriptor[5] = 31;
  }
  SECTION("wide rate") { descriptor[7] = 255; }
  SECTION("zero channels") { descriptor[2] = 0; }
  SECTION("multichannel") { descriptor[2] = 6; }
  SECTION("wide channels") { descriptor[3] = 1; }
  SECTION("alignment") { descriptor[12] = 2; }
  SECTION("average rate") { descriptor[8] = 1; }
  SECTION("extra data") { descriptor[16] = 1; }
  auto input = packet(descriptor);
  if (descriptor[16]) {
    input.push_back(42);
    header(input, 1);
  }
  std::array<std::uint8_t, max_pcm_offer_bytes> output{};
  const auto selected = select_pcm_offers(input, output);
  REQUIRE(selected);
  REQUIRE(selected->count == 0);
  REQUIRE(selected->bytes.size() == 24);
  REQUIRE(selected->bytes[2] == 20);
  REQUIRE(selected->bytes[18] == 0);
}

TEST_CASE("PCM offers accept 64 descriptors and validate complete output capacity before copying") {
  const auto input = packet(stereo48, 64);
  std::array<std::uint8_t, max_pcm_offer_bytes> output{};
  output.fill(77);
  REQUIRE_FALSE(select_pcm_offers(input, std::span(output).first(output.size() - 1)));
  REQUIRE(std::all_of(output.begin(), output.end(), [](auto value) { return value == 77; }));
  const auto result = select_pcm_offers(input, output);
  REQUIRE(result);
  REQUIRE(result->count == 64);
  REQUIRE(result->bytes.size() == 1176);
  REQUIRE(std::vector(result->bytes.begin(), result->bytes.end()) == input);
}

TEST_CASE("Malformed PCM offer records leave destination unchanged") {
  auto input = packet(stereo48);
  SECTION("count ceiling") { input = packet(stereo48, 65); }
  SECTION("huge count") { input[18] = input[19] = 255; }
  SECTION("short descriptor") {
    input.pop_back();
    header(input, 1);
  }
  SECTION("body mismatch") { input[2] = 0; }
  SECTION("wrong PDU") { input[0] = 3; }
  SECTION("size ceiling") { input.resize(65537); }
  std::array<std::uint8_t, max_pcm_offer_bytes> output{};
  output.fill(77);
  REQUIRE_FALSE(select_pcm_offers(input, output));
  REQUIRE(std::all_of(output.begin(), output.end(), [](auto value) { return value == 77; }));
}

TEST_CASE("Empty PCM offer lists retain a bounded valid no-common-format response") {
  const auto input = packet(stereo48, 0);
  std::array<std::uint8_t, 24> output{};
  const auto result = select_pcm_offers(input, output);
  REQUIRE(result);
  REQUIRE(result->count == 0);
  REQUIRE(result->bytes.size() == 24);
  REQUIRE(std::vector(result->bytes.begin(), result->bytes.end()) == input);
  output.fill(77);
  REQUIRE_FALSE(select_pcm_offers(input, std::span(output).first(23)));
  REQUIRE(std::all_of(output.begin(), output.end(), [](auto value) { return value == 77; }));
}
