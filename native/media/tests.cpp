#include "jpeg.hpp"
#include <catch2/catch_test_macros.hpp>
#include <turbojpeg.h>

TEST_CASE("native JPEG encodes padded BGRA and decodes dimensions and colour") {
  bridge::media::JpegEncoder encoder;
  constexpr int width = 32, height = 16, stride = width * 4 + 16;
  std::vector<std::uint8_t> source(stride * height, 0);
  for (int y = 0; y < height; ++y)
    for (int x = 0; x < width; ++x) {
      const auto offset = static_cast<std::size_t>(y * stride + x * 4);
      source[offset + 2] = 240;
      source[offset + 3] = 255;
    }
  const auto jpeg = encoder.encode(source, width, height, stride);
  REQUIRE(jpeg.size() < source.size());
  const auto decoder = tj3Init(TJINIT_DECOMPRESS);
  REQUIRE(decoder != nullptr);
  const std::unique_ptr<void, decltype(&tj3Destroy)> guard(decoder, tj3Destroy);
  REQUIRE(tj3DecompressHeader(decoder, jpeg.data(), jpeg.size()) == 0);
  REQUIRE(tj3Get(decoder, TJPARAM_JPEGWIDTH) == width);
  REQUIRE(tj3Get(decoder, TJPARAM_JPEGHEIGHT) == height);
  std::vector<std::uint8_t> rgb(width * height * 3);
  REQUIRE(tj3Decompress8(decoder, jpeg.data(), jpeg.size(), rgb.data(), width * 3, TJPF_RGB) == 0);
  REQUIRE(rgb[0] > 230);
  REQUIRE(rgb[1] < 10);
  REQUIRE(rgb[2] < 10);
  REQUIRE_NOTHROW(encoder.encode(source, width, height, stride));
  REQUIRE_THROWS_AS(encoder.encode(source, 0, height, stride), bridge::ipc::ProtocolError);
  REQUIRE_THROWS_AS(encoder.encode(source, width, height, width * 4 - 1),
                    bridge::ipc::ProtocolError);
  REQUIRE_THROWS_AS(encoder.encode(std::span(source).first(3), width, height, stride),
                    bridge::ipc::ProtocolError);
}
