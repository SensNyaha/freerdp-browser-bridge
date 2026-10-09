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
TEST_CASE("JPEG quality changes actual encoded output and rejects invalid values") {
  for (const int quality : {0, 101, -1})
    REQUIRE_THROWS_AS(bridge::media::JpegEncoder(quality), bridge::ipc::ProtocolError);
  std::vector<std::uint8_t> pixels(64 * 64 * 4);
  for (std::size_t i = 0; i < pixels.size(); ++i)
    pixels[i] = static_cast<std::uint8_t>((i * 73 + i / 257) % 256);
  bridge::media::JpegEncoder low(60), high(90);
  const auto smaller = low.encode(pixels, 64, 64, 256);
  const auto larger = high.encode(pixels, 64, 64, 256);
  REQUIRE(larger.size() > smaller.size());
  const std::unique_ptr<void, decltype(&tj3Destroy)> decoder(tj3Init(TJINIT_DECOMPRESS),
                                                             tj3Destroy);
  REQUIRE(decoder != nullptr);
  std::vector<std::uint8_t> decoded(pixels.size());
  for (const auto jpeg : {smaller, larger}) {
    REQUIRE(tj3DecompressHeader(decoder.get(), jpeg.data(), jpeg.size()) == 0);
    REQUIRE(tj3Get(decoder.get(), TJPARAM_JPEGWIDTH) == 64);
    REQUIRE(tj3Get(decoder.get(), TJPARAM_JPEGHEIGHT) == 64);
    REQUIRE(tj3Decompress8(decoder.get(), jpeg.data(), jpeg.size(), decoded.data(), 256,
                           TJPF_BGRA) == 0);
  }
}
