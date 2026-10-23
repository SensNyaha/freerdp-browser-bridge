#include "../compat/span.hpp"
#include "avc_decode_probe.hpp"
#include "video_encoder.hpp"
#include <catch2/catch_test_macros.hpp>
#include <cstdlib>

namespace {
std::vector<std::uint8_t> solid(int width, int height, int stride, bool red) {
  std::vector<std::uint8_t> pixels(static_cast<std::size_t>(stride * height), 0xee);
  for (int y = 0; y < height; ++y)
    for (int x = 0; x < width; ++x) {
      const auto i = static_cast<std::size_t>(y * stride + x * 4);
      pixels[i] = pixels[i + 1] = red ? 0 : 240;
      pixels[i + 2] = red ? 255 : 240;
      pixels[i + 3] = 255;
    }
  return pixels;
}
void verify(bridge::diagnostics::AvcDecodeProbe &decoder, const bridge::media::AvcUnit &unit,
            int width, int height, bool red) {
  REQUIRE(unit.config.size() >= 11);
  REQUIRE(unit.bytes.size() <= bridge::media::max_access_unit_bytes);
  const auto decoded = decoder.decode(unit);
  REQUIRE(decoded.width == width);
  REQUIRE(decoded.height == height);
  const std::array<int, 3> expected =
      red ? std::array<int, 3>{82, 90, 240} : std::array<int, 3>{222, 128, 128};
  for (std::size_t i = 0; i < 3; ++i)
    REQUIRE(std::abs(static_cast<int>(decoded.yuv[i]) - expected[i]) <= 4);
}
} // namespace
TEST_CASE(
    "OpenH264 produces decodable AVC with padded BGRA, deltas, forced IDR and time-based GOP") {
  bridge::media::SoftwareH264Encoder encoder;
  bridge::diagnostics::AvcDecodeProbe decoder;
  const auto pixels = solid(128, 64, 128 * 4 + 20, true);
  bridge::media::VideoFrame frame{pixels, 128, 64, 128 * 4 + 20, 1000000};
  auto unit = encoder.encode(frame, false);
  REQUIRE(unit.keyframe);
  const std::vector<std::uint8_t> initial_config(unit.config.begin(), unit.config.end());
  verify(decoder, unit, 128, 64, true);
  auto changed = pixels;
  // Change one macroblock: a full scene replacement may legitimately trigger an extra IDR.
  for (int y = 0; y < 16; ++y)
    for (int x = 0; x < 16; ++x) {
      const auto i = static_cast<std::size_t>(y * frame.stride + x * 4);
      changed[i] = changed[i + 1] = changed[i + 2] = 240;
    }
  frame.bgra = changed;
  frame.timestamp_us += 33333;
  unit = encoder.encode(frame, false);
  REQUIRE_FALSE(unit.keyframe);
  REQUIRE(std::vector(unit.config.begin(), unit.config.end()) == initial_config);
  verify(decoder, unit, 128, 64, false);
  frame.timestamp_us += 33333;
  unit = encoder.encode(frame, true);
  REQUIRE(unit.keyframe);
  verify(decoder, unit, 128, 64, false);
  frame.timestamp_us += 2000000;
  unit = encoder.encode(frame, false);
  REQUIRE(unit.keyframe);
  verify(decoder, unit, 128, 64, false);
  const auto resized = solid(1920, 1080, 1920 * 4, false);
  unit = encoder.encode({resized, 1920, 1080, 1920 * 4, frame.timestamp_us + 33333}, false);
  REQUIRE(unit.keyframe);
  REQUIRE(std::vector(unit.config.begin(), unit.config.end()) != initial_config);
  verify(decoder, unit, 1920, 1080, false);
  bridge::diagnostics::AvcDecodeProbe new_attachment;
  verify(new_attachment, unit, 1920, 1080, false);
}
TEST_CASE("OpenH264 rejects invalid options, source dimensions, buffer bounds and timestamps") {
  for (const auto options : {bridge::media::EncoderOptions{0, 4000000, 2000},
                             {61, 4000000, 2000},
                             {30, 99999, 2000},
                             {30, 20000001, 2000},
                             {30, 4000000, 999},
                             {30, 4000000, 2001},
                             {30, 4000000, 2000, 0},
                             {30, 4000000, 2000, 5}})
    REQUIRE_THROWS_AS(bridge::media::SoftwareH264Encoder(options), bridge::ipc::ProtocolError);
  bridge::media::SoftwareH264Encoder encoder;
  const auto pixels = solid(128, 64, 512, true);
  for (const auto frame : {bridge::media::VideoFrame{pixels, 129, 64, 516, 1},
                           {pixels, 128, 63, 512, 1},
                           {pixels, 8, 64, 512, 1},
                           {pixels, 3842, 64, 15368, 1},
                           {pixels, 128, 2162, 512, 1},
                           {pixels, 128, 64, 511, 1},
                           {pixels, 128, 64, -1, 1},
                           {::bridge::compat::span<const std::uint8_t>{}, 128, 64, 512, 1}})
    REQUIRE_THROWS_AS(encoder.encode(frame, false), bridge::ipc::ProtocolError);
  REQUIRE(encoder.encode({pixels, 128, 64, 512, 1000}, false).keyframe);
  REQUIRE_THROWS_AS(encoder.encode({pixels, 128, 64, 512, 1000}, false),
                    bridge::ipc::ProtocolError);
  REQUIRE_THROWS_AS(encoder.encode({pixels, 128, 64, 512, 999}, true), bridge::ipc::ProtocolError);
  for (const int maximum : {-1, 3999999, 20000001}) {
    bridge::media::EncoderOptions options;
    options.max_bitrate = maximum;
    REQUIRE_THROWS_AS(bridge::media::SoftwareH264Encoder(options), bridge::ipc::ProtocolError);
  }
}
TEST_CASE("OpenH264 custom low FPS and distinct target/maximum rates remain decodable") {
  bridge::media::EncoderOptions options;
  options.fps = 1;
  options.bitrate = 100000;
  options.max_bitrate = 200000;
  bridge::media::SoftwareH264Encoder encoder(options);
  bridge::diagnostics::AvcDecodeProbe decoder;
  const auto pixels = solid(128, 64, 512, false);
  const auto unit = encoder.encode({pixels, 128, 64, 512, 1000}, true);
  REQUIRE(unit.keyframe);
  verify(decoder, unit, 128, 64, false);
  verify(decoder, encoder.encode({pixels, 128, 64, 512, 1001000}, false), 128, 64, false);
}
TEST_CASE("Predictive frames erase previous windows through rapid scene changes") {
  for (const int threads : {1, 2, 4}) {
    bridge::media::EncoderOptions options;
    options.threads = threads;
    bridge::media::SoftwareH264Encoder encoder(options);
    bridge::diagnostics::AvcDecodeProbe decoder;
    constexpr int width = 320, height = 192, stride = width * 4;
    auto pixels = solid(width, height, stride, false);
    for (int frame = 0; frame < 30; ++frame) {
      const bool bright_background = (frame / 5) % 2 == 0;
      const int window_x = (frame % 4) * 64;
      for (int y = 0; y < height; ++y)
        for (int x = 0; x < width; ++x) {
          const bool window = x >= window_x && x < window_x + 48 && y >= 64 && y < 128;
          const std::uint8_t shade = window ? 120 : (bright_background ? 240 : 16);
          const auto offset = static_cast<std::size_t>(y * stride + x * 4);
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = shade;
        }
      const auto unit = encoder.encode(
          {pixels, width, height, stride, 1000000 + static_cast<std::uint64_t>(frame) * 33333},
          false);
      // Sample the preceding window's centre: it must be completely repainted, not retained.
      const int old_x = ((frame + 3) % 4) * 64 + 24;
      const auto decoded = decoder.decode(unit, old_x, 96);
      const int shade = bright_background ? 240 : 16;
      const int expected_y = ((220 * shade + 128) >> 8) + 16;
      REQUIRE(std::abs(static_cast<int>(decoded.yuv[0]) - expected_y) <= 8);
    }
  }
}
TEST_CASE("SIMD provider preserves small diagnostic surfaces") {
  for (const auto dimensions :
       {std::array<int, 2>{16, 16}, {32, 16}, {64, 32}, {128, 64}, {320, 194}, {640, 194}}) {
    const auto width = dimensions[0], height = dimensions[1];
    INFO("width=" << width << " height=" << height);
    bridge::media::SoftwareH264Encoder encoder;
    bridge::diagnostics::AvcDecodeProbe decoder;
    const auto pixels = solid(width, height, width * 4, false);
    bridge::media::AvcUnit unit{};
    REQUIRE_NOTHROW(unit = encoder.encode({pixels, width, height, width * 4, 1000}, true));
    verify(decoder, unit, width, height, false);
  }
}
