#include "../compat/span.hpp"
#include "audio.hpp"
#include "packetizer.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <limits>

using namespace bridge::ipc;
static_assert(audio::pcm_bytes == bridge::audio::PcmPacketizer::packet_bytes);
static_assert(audio::interval_us == bridge::audio::PcmPacketizer::interval_us);
namespace {
const std::vector<std::uint8_t> config{1, 2, 2, 1, 0, 0, 187, 128, 3, 192,
                                       0, 0, 0, 0, 0, 0, 0,   0,   0, 1};
std::vector<std::uint8_t> packet() {
  std::vector<std::uint8_t> bytes{1, 2, 0, 2, 3, 190, 0,  0,  0, 0,   0,   0,   0,   0,   0, 1,
                                  0, 0, 0, 0, 0, 15,  66, 64, 0, 128, 255, 127, 255, 255, 0, 0};
  bytes.resize(3864);
  return bytes;
}
} // namespace
TEST_CASE("PCM audio config schema matches independent network-order vector") {
  REQUIRE(audio::decode_config(config).epoch == 1);
  const auto encoded = audio::encode_config({1});
  REQUIRE(std::equal(encoded.begin(), encoded.end(), config.begin(), config.end()));
  for (std::size_t size = 0; size < config.size(); ++size)
    REQUIRE_THROWS_AS(audio::decode_config(::bridge::compat::span(config).first(size)), ProtocolError);
  auto extra = config;
  extra.push_back(0);
  REQUIRE_THROWS_AS(audio::decode_config(extra), ProtocolError);
  for (const auto at : {0U, 1U, 2U, 3U, 4U, 7U, 8U, 9U, 10U, 11U}) {
    auto bad = config;
    bad[at] ^= 255;
    REQUIRE_THROWS_AS(audio::decode_config(bad), ProtocolError);
  }
  extra = config;
  std::fill(extra.begin() + 12, extra.end(), 0);
  REQUIRE_THROWS_AS(audio::decode_config(extra), ProtocolError);
  REQUIRE_THROWS_AS(audio::encode_config({0}), ProtocolError);
  REQUIRE(audio::decode_config(audio::encode_config({UINT64_MAX})).epoch == UINT64_MAX);
}
TEST_CASE("PCM audio packet validates fixed frames silence and borrowed sample endian") {
  const auto bytes = packet();
  const auto decoded = audio::decode_packet(bytes);
  REQUIRE(decoded.epoch == 1);
  REQUIRE(decoded.timestamp_us == 1000000);
  REQUIRE(decoded.frames == 2);
  REQUIRE(decoded.silence_frames == 958);
  REQUIRE(decoded.discontinuity);
  REQUIRE(decoded.pcm.data() == bytes.data() + 24);
  const auto encoded = audio::encode_packet(decoded);
  REQUIRE(std::equal(encoded.begin(), encoded.end(), bytes.begin(), bytes.end()));
  for (std::size_t size = 0; size < bytes.size(); ++size)
    REQUIRE_THROWS_AS(audio::decode_packet(::bridge::compat::span(bytes).first(size)), ProtocolError);
  for (const auto at : {0U, 1U, 2U, 3U, 4U, 5U, 6U, 7U, 3863U}) {
    auto bad = bytes;
    bad[at] ^= 255;
    REQUIRE_THROWS_AS(audio::decode_packet(bad), ProtocolError);
  }
  auto bad = bytes;
  bad.push_back(0);
  REQUIRE_THROWS_AS(audio::decode_packet(bad), ProtocolError);
  bad = bytes;
  std::fill(bad.begin() + 8, bad.begin() + 16, 0);
  REQUIRE_THROWS_AS(audio::decode_packet(bad), ProtocolError);
  bad = bytes;
  std::fill(bad.begin() + 16, bad.begin() + 24, 255);
  REQUIRE_THROWS_AS(audio::decode_packet(bad), ProtocolError);
}
TEST_CASE("PCM audio encoding rejects metadata and silence claims before copying") {
  auto bytes = packet();
  const auto original = audio::decode_packet(bytes);
  for (unsigned choice = 0; choice < 7; ++choice) {
    auto value = original;
    switch (choice) {
    case 0:
      value.epoch = 0;
      break;
    case 1:
      value.timestamp_us = UINT64_MAX;
      break;
    case 2:
      value.frames = 961;
      break;
    case 3:
      value.silence_frames = 961;
      break;
    case 4:
      value.frames = 0;
      break;
    case 5:
      value.pcm = original.pcm.first(3839);
      break;
    case 6:
      bytes.back() = 1;
      break;
    }
    REQUIRE_THROWS_AS(audio::encode_packet(value), ProtocolError);
  }
  std::vector<std::uint8_t> full(3840, 255), silence(3840);
  const auto edge_bytes =
      audio::encode_packet({UINT64_MAX, UINT64_MAX - 20000, 960, 0, false, full});
  const auto edge = audio::decode_packet(edge_bytes);
  REQUIRE(edge.epoch == UINT64_MAX);
  REQUIRE(edge.timestamp_us == UINT64_MAX - 20000);
  REQUIRE_FALSE(edge.discontinuity);
  const auto silent = audio::encode_packet({1, 0, 0, 960, true, silence});
  REQUIRE(audio::decode_packet(silent).silence_frames == 960);
}
TEST_CASE("PCM audio envelope rejects incorrect exact sizes before payload allocation") {
  for (const auto kind : {Kind::audio_config, Kind::audio_pcm}) {
    const auto body = kind == Kind::audio_config ? config : packet();
    const auto encoded = encode({kind, 0, body});
    const auto header = ::bridge::compat::span(encoded).first(header_bytes);
    REQUIRE(decode_header(header).kind == kind);
    REQUIRE(decode_header(header).length == body.size());
    for (const auto size : {0U, 19U, 21U, 3863U, 3865U, 0xffffffffU}) {
      auto bad = std::vector<std::uint8_t>(header.begin(), header.end());
      for (unsigned i = 0; i < 4; ++i)
        bad[20 + i] = static_cast<std::uint8_t>(size >> ((3 - i) * 8));
      REQUIRE_THROWS_AS(decode_header(bad), ProtocolError);
    }
  }
}
TEST_CASE("Paced native PCM converts to the bounded audio IPC layout without sample conversion") {
  bridge::audio::PcmQueue queue;
  bridge::audio::PcmPacketizer timeline;
  const auto original = packet();
  REQUIRE(queue.push(::bridge::compat::span(original).subspan(24, 8)) == bridge::audio::QueueStatus::accepted);
  const auto paced = timeline.read(queue, 1000000);
  const auto encoded = audio::encode_packet(
      {1, paced.timestamp_us, static_cast<std::uint16_t>(paced.frames),
       static_cast<std::uint16_t>(paced.silence_frames), paced.discontinuity, paced.bytes});
  REQUIRE(std::equal(encoded.begin(), encoded.end(), original.begin(), original.end()));
}
