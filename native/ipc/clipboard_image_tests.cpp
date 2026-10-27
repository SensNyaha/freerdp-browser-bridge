#include "../clipboard/image.hpp"
#include "clipboard_html.hpp"
#include "clipboard_image.hpp"
#include <algorithm>
#include <array>
#include <catch2/catch_test_macros.hpp>

using namespace bridge::ipc::clipboard;
using bridge::ipc::ProtocolError;
namespace {
using Bytes = ::bridge::compat::span<const std::uint8_t>;
const std::vector<std::uint8_t> golden{0, 1, 0, 0, 0,    0,    0,    2,    0,    0,    0,    1,
                                       0, 0, 0, 8, 0x12, 0x34, 0x56, 0x78, 0xfe, 0xdc, 0xba, 0x98};
void field(std::vector<std::uint8_t> &bytes, std::size_t at, std::uint32_t value) {
  for (std::size_t i = 0; i < 4; ++i)
    bytes[at + i] = static_cast<std::uint8_t>(value >> ((3 - i) * 8));
}
ImageItem item() { return {2, 1, Bytes(golden).subspan(16)}; }
} // namespace

TEST_CASE("Image private item matches independent big-endian golden and borrows pixels") {
  REQUIRE(encode_image_item(item()) == golden);
  const auto decoded = decode_image_item(golden);
  REQUIRE(decoded.width == 2);
  REQUIRE(decoded.height == 1);
  REQUIRE(decoded.rgba.size() == 8);
  REQUIRE(decoded.rgba.data() == golden.data() + 16);
  REQUIRE(encode_image_item(decoded) == golden);
  auto encoded = encode_image_item(decoded);
  encoded.back() = 0;
  REQUIRE(golden.back() == 0x98);
  REQUIRE_THROWS_AS(decode_command(golden), ProtocolError);
  REQUIRE_THROWS_AS(decode_html_item(golden), ProtocolError);
}

TEST_CASE("Image private item rejects truncation unknown flags geometry and trailing bytes") {
  for (std::size_t length = 0; length < golden.size(); ++length)
    REQUIRE_THROWS_AS(decode_image_item(Bytes(golden).first(length)), ProtocolError);
  for (const auto at : {0U, 1U, 2U, 3U}) {
    auto invalid = golden;
    invalid[at] = 0xff;
    REQUIRE_THROWS_AS(decode_image_item(invalid), ProtocolError);
  }
  for (const auto at : {4U, 8U, 12U}) {
    for (const auto value : {0U, 3U, 0x80000000U, 0xffffffffU}) {
      auto invalid = golden;
      field(invalid, at, value);
      REQUIRE_THROWS_AS(decode_image_item(invalid), ProtocolError);
    }
  }
  auto invalid = golden;
  invalid.push_back(0);
  REQUIRE_THROWS_AS(decode_image_item(invalid), ProtocolError);
  field(invalid, 12, 9);
  REQUIRE_THROWS_AS(decode_image_item(invalid), ProtocolError);
  field(invalid, 4, 0x7fffffff);
  field(invalid, 8, 0x7fffffff);
  REQUIRE_THROWS_AS(decode_image_item(invalid), ProtocolError);
}

TEST_CASE("Image private item admits raw quota separately from the fixed transport reservation") {
  REQUIRE(encode_image_item(item(), 8) == golden);
  REQUIRE(decode_image_item(golden, 8).rgba.size() == 8);
  REQUIRE_THROWS_AS(encode_image_item(item(), 7), ProtocolError);
  REQUIRE_THROWS_AS(decode_image_item(golden, 7), ProtocolError);
  for (const auto maximum : {std::size_t{0}, max_text_bytes + 1}) {
    REQUIRE_THROWS_AS(validate_image_item(item(), maximum), ProtocolError);
    REQUIRE_THROWS_AS(decode_image_item(golden, maximum), ProtocolError);
  }
  const std::vector<std::uint8_t> pixels(max_text_bytes - image_item_metadata_bytes, 0x7f);
  const ImageItem largest{static_cast<std::uint32_t>(pixels.size() / 4), 1, pixels};
  const auto encoded = encode_image_item(largest);
  REQUIRE(encoded.size() == max_text_bytes);
  REQUIRE(decode_image_item(encoded).rgba.size() == pixels.size());
  const std::vector<std::uint8_t> over(pixels.size() + 4);
  REQUIRE_THROWS_AS(encode_image_item({static_cast<std::uint32_t>(over.size() / 4), 1, over}),
                    ProtocolError);
}

TEST_CASE("Image private item refuses empty invalid and overflow dimensions before payload copy") {
  for (const auto value : {0U, 0x80000000U, 0xffffffffU}) {
    auto invalid = item();
    invalid.width = value;
    REQUIRE_THROWS_AS(encode_image_item(invalid), ProtocolError);
    invalid = item();
    invalid.height = value;
    REQUIRE_THROWS_AS(encode_image_item(invalid), ProtocolError);
  }
  REQUIRE_THROWS_AS(encode_image_item({0x7fffffffU, 0x7fffffffU, item().rgba}), ProtocolError);
  REQUIRE_THROWS_AS(encode_image_item({2, 1, {}}), ProtocolError);
  REQUIRE_THROWS_AS(encode_image_item({1, 1, item().rgba}), ProtocolError);
}

TEST_CASE("Image write admission agrees with the native canonical DIBV5 byte budget") {
  REQUIRE_NOTHROW(validate_image_write(item(), 132));
  REQUIRE_THROWS_AS(validate_image_write(item(), 131), ProtocolError);
  REQUIRE_THROWS_AS(validate_image_write(item(), 8), ProtocolError);
  const auto decoded = decode_image_item(golden);
  using bridge::clipboard::ImageStatus;
  const auto capacity = bridge::clipboard::encode_dibv5_clipboard(decoded.rgba, decoded.width,
                                                                  decoded.height, {}, 132);
  REQUIRE(capacity.status == ImageStatus::capacity);
  REQUIRE(capacity.bytes == 132);
  std::vector<std::uint8_t> dib(capacity.bytes);
  REQUIRE(bridge::clipboard::encode_dibv5_clipboard(decoded.rgba, decoded.width, decoded.height,
                                                    dib, 132)
              .status == ImageStatus::ok);
  std::array<std::uint8_t, 8> rgba{};
  REQUIRE(bridge::clipboard::decode_dib_clipboard(dib, rgba, 132).status == ImageStatus::ok);
  REQUIRE(std::equal(rgba.begin(), rgba.end(), decoded.rgba.begin()));
}

TEST_CASE("Image outer schema4 state has independent golden and retains legacy schemas") {
  const std::vector<std::uint8_t> bytes{0, 4, 13, 143, 0, 16, 0, 0, 0, 0, 0, 0,
                                        0, 0, 0,  1,   0, 0,  0, 0, 0, 0, 0, 2};
  const State state{1,     2,     1048576, true, true,  true, true, false,
                    false, false, true,    true, false, true, true, false};
  const auto encoded = encode_state(state);
  REQUIRE(std::equal(encoded.begin(), encoded.end(), bytes.begin(), bytes.end()));
  const auto decoded = decode_state(bytes);
  REQUIRE(decoded.html);
  REQUIRE(decoded.image);
  REQUIRE(decoded.remote_image);
  REQUIRE_FALSE(decoded.local_image_accepted);
  for (const auto version : {1U, 2U, 3U, 5U}) {
    auto invalid = bytes;
    invalid[1] = static_cast<std::uint8_t>(version);
    REQUIRE_THROWS_AS(decode_state(invalid), ProtocolError);
  }
  auto invalid = bytes;
  invalid[2] = 0x09;
  REQUIRE_THROWS_AS(decode_state(invalid), ProtocolError);
  invalid = bytes;
  invalid[2] |= 0x20;
  REQUIRE_THROWS_AS(decode_state(invalid), ProtocolError);
  for (unsigned mode = 0; mode < 6; ++mode) {
    auto bad = state;
    if (mode == 0)
      bad.ready = false;
    if (mode == 1)
      bad.from_server = false;
    if (mode == 2)
      bad.image = false;
    if (mode == 3)
      bad.revision = 0;
    if (mode == 4)
      bad.local_image_accepted = true;
    if (mode == 5) {
      bad.local_accepted = true;
      bad.local_image_accepted = true;
      bad.local_html_accepted = true;
    }
    REQUIRE_THROWS_AS(encode_state(bad), ProtocolError);
  }
}

TEST_CASE("Image outer read set and result use exact schema4 without textual reinterpretation") {
  const std::vector<std::uint8_t> read{0, 4, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0,
                                       0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2};
  auto set = read;
  set[3] = 7;
  set[23] = 0;
  set.insert(set.end(), golden.begin(), golden.end());
  REQUIRE(encode_command({Operation::read_image, 1, 2, {}}) == read);
  REQUIRE(encode_command({Operation::set_image, 1, 0, golden}) == set);
  auto result = read;
  result.insert(result.end(), golden.begin(), golden.end());
  REQUIRE(encode_result({Operation::read_image, Status::accepted, 1, 2, golden}) == result);
  REQUIRE(decode_command(set).operation == Operation::set_image);
  REQUIRE(decode_result(result).text.size() == golden.size());
  for (const auto version : {1U, 2U, 3U, 5U}) {
    auto invalid = set;
    invalid[1] = static_cast<std::uint8_t>(version);
    REQUIRE_THROWS_AS(decode_command(invalid), ProtocolError);
  }
  REQUIRE_THROWS_AS(encode_command({Operation::read_image, 1, 2, golden}), ProtocolError);
  REQUIRE_THROWS_AS(encode_command({Operation::set_image, 1, 1, golden}), ProtocolError);
  REQUIRE_THROWS_AS(encode_command({Operation::read_image, 1, 0, {}}), ProtocolError);
  for (const auto status : {Status::refused, Status::stale, Status::unavailable, Status::busy,
                            Status::invalid, Status::timeout, Status::disconnected}) {
    REQUIRE_THROWS_AS(encode_result({Operation::read_image, status, 1, 2, golden}), ProtocolError);
    REQUIRE(encode_result({Operation::read_image, status, 1, 2, {}}).size() == metadata_bytes);
  }
  REQUIRE_THROWS_AS(encode_result({Operation::set_image, Status::accepted, 1, 0, golden}),
                    ProtocolError);
  REQUIRE_THROWS_AS(encode_command({Operation::set_image, 1, 0, Bytes(golden).first(23)}),
                    ProtocolError);
}
