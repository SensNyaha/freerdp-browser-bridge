#include "cursor_convert.hpp"
#include <catch2/catch_test_macros.hpp>
TEST_CASE("Pinned pointer converter preserves RGB, alpha, row orientation and hotspot") {
  std::vector<BYTE> colors{0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 0};
  rdpPointer p{};
  p.width = p.height = 2;
  p.xPos = 1;
  p.yPos = 0;
  p.xorBpp = 24;
  p.xorMaskData = colors.data();
  p.lengthXorMask = static_cast<UINT32>(colors.size());
  const auto result = bridge::cursor::convert(p, 1, nullptr);
  REQUIRE(result.hot_x == 1);
  REQUIRE(result.hot_y == 0);
  REQUIRE(result.rgba ==
          std::vector<BYTE>{0, 0, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255});
  colors = {0, 0, 255, 128};
  p.width = p.height = 1;
  p.xPos = 0;
  p.xorBpp = 32;
  p.xorMaskData = colors.data();
  p.lengthXorMask = 4;
  REQUIRE(bridge::cursor::convert(p, 2, nullptr).rgba == std::vector<BYTE>{255, 0, 0, 128});
  p.lengthXorMask = 3;
  REQUIRE_THROWS_AS(bridge::cursor::convert(p, 2, nullptr), bridge::ipc::ProtocolError);
  p.width = 385;
  REQUIRE_THROWS_AS(bridge::cursor::convert(p, 2, nullptr), bridge::ipc::ProtocolError);
}
TEST_CASE(
    "Monochrome pointer handles black white transparent and upstream inverted-pixel fallback") {
  std::array<BYTE, 2> xor_mask{0x50, 0}, and_mask{0x30, 0};
  rdpPointer p{};
  p.width = 4;
  p.height = 1;
  p.xorBpp = 1;
  p.xorMaskData = xor_mask.data();
  p.andMaskData = and_mask.data();
  p.lengthXorMask = p.lengthAndMask = 2;
  const auto image = bridge::cursor::convert(p, 3, nullptr).rgba;
  REQUIRE(std::vector<BYTE>(image.begin(), image.begin() + 8) ==
          std::vector<BYTE>{0, 0, 0, 255, 255, 255, 255, 255});
  REQUIRE(image[11] == 0);
  REQUIRE(image[15] == 255);
  REQUIRE(image[12] == image[13]);
  REQUIRE(image[13] == image[14]);
}
