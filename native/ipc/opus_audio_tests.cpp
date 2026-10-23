#include "../compat/ranges.hpp"
#include "../compat/span.hpp"
#include "opus_audio.hpp"
#include "output_queue.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <vector>

namespace opus = bridge::ipc::audio::opus;
using bridge::ipc::ProtocolError;
namespace {
const std::array<std::uint8_t, 20> config{1, 1,    2, 0, 0, 0, 0xbb, 0x80, 3, 0xc0,
                                          1, 0x38, 0, 0, 0, 0, 0,    0,    0, 1};
const std::array<std::uint8_t, 27> packet{1, 2, 0, 2,    3,    0xbe, 0,    0,    0,
                                          0, 0, 0, 0,    0,    0,    1,    0,    0,
                                          0, 0, 0, 0x0f, 0x42, 0x40, 0xfc, 0xff, 0xfe};
} // namespace

TEST_CASE("Opus IPC profile bounds every TOC before a decoder sees its bytes") {
  const std::array<std::uint8_t, 9> allowed{0x0c, 0x2c, 0x4c, 0x6c, 0x7c, 0x9c, 0xbc, 0xdc, 0xfc};
  for (unsigned toc = 0; toc < 256; ++toc) {
    const std::array<std::uint8_t, 3> bytes{static_cast<std::uint8_t>(toc), 0xff, 0xfe};
    if (::bridge::compat::ranges::find(allowed, bytes[0]) != allowed.end())
      REQUIRE_NOTHROW(opus::validate_payload(bytes));
    else
      REQUIRE_THROWS_AS(opus::validate_payload(bytes), ProtocolError);
  }
  for (const auto size : {0U, 1U, 1276U, 4096U}) {
    const std::vector<std::uint8_t> bytes(size, 0xfc);
    REQUIRE_THROWS_AS(opus::validate_payload(bytes), ProtocolError);
  }
  for (const auto size : {2U, 1275U}) {
    const std::vector<std::uint8_t> bytes(size, 0xfc);
    REQUIRE_NOTHROW(opus::validate_payload(bytes));
  }
}

TEST_CASE("Opus IPC config golden vector bounds queried lookahead and separates PCM") {
  const auto decoded = opus::decode_config(config);
  REQUIRE(decoded.epoch == 1);
  REQUIRE(decoded.lookahead_frames == 312);
  REQUIRE(opus::encode_config(decoded) == config);
  REQUIRE_THROWS_AS(bridge::ipc::audio::decode_config(config), ProtocolError);
  for (std::size_t size = 0; size < config.size(); ++size)
    REQUIRE_THROWS_AS(opus::decode_config(::bridge::compat::span(config).first(size)), ProtocolError);
  std::vector<std::uint8_t> extra(config.begin(), config.end());
  extra.push_back(0);
  REQUIRE_THROWS_AS(opus::decode_config(extra), ProtocolError);
  for (const auto at : {0U, 1U, 2U, 3U, 4U, 7U, 8U, 9U}) {
    auto bad = config;
    bad[at] ^= 255;
    REQUIRE_THROWS_AS(opus::decode_config(bad), ProtocolError);
  }
  for (const auto lookahead : {0U, 960U})
    REQUIRE(opus::decode_config(opus::encode_config({1, static_cast<std::uint16_t>(lookahead)}))
                .lookahead_frames == lookahead);
  for (const auto lookahead : {961U, 65535U})
    REQUIRE_THROWS_AS(opus::encode_config({1, static_cast<std::uint16_t>(lookahead)}),
                      ProtocolError);
  REQUIRE_THROWS_AS(opus::encode_config({0, 312}), ProtocolError);
  REQUIRE(opus::decode_config(opus::encode_config({UINT64_MAX, 312})).epoch == UINT64_MAX);
  auto bad = config;
  std::fill(bad.begin() + 12, bad.end(), 0);
  REQUIRE_THROWS_AS(opus::decode_config(bad), ProtocolError);
  bad = config;
  bad[10] = 3;
  bad[11] = 0xc1;
  REQUIRE_THROWS_AS(opus::decode_config(bad), ProtocolError);
}

TEST_CASE("Opus IPC packet golden vector bounds metadata and borrows encoded storage") {
  const auto decoded = opus::decode_packet(packet);
  REQUIRE(decoded.epoch == 1);
  REQUIRE(decoded.timestamp_us == 1000000);
  REQUIRE(decoded.frames == 2);
  REQUIRE(decoded.silence_frames == 958);
  REQUIRE(decoded.discontinuity);
  REQUIRE(decoded.encoded.data() == packet.data() + 24);
  const auto encoded = opus::encode_packet(decoded);
  REQUIRE(encoded.size == packet.size());
  REQUIRE(::bridge::compat::ranges::equal(encoded.bytes(), packet));
  REQUIRE_THROWS_AS(bridge::ipc::audio::decode_packet(packet), ProtocolError);
  for (std::size_t size = 0; size < opus::min_packet_bytes; ++size)
    REQUIRE_THROWS_AS(opus::decode_packet(::bridge::compat::span(packet).first(size)), ProtocolError);
  for (const auto at : {0U, 1U, 2U, 3U, 4U, 5U, 6U, 7U, 24U}) {
    auto bad = packet;
    bad[at] ^= 255;
    REQUIRE_THROWS_AS(opus::decode_packet(bad), ProtocolError);
  }
  for (const auto size : {2U, 1275U}) {
    const std::vector<std::uint8_t> bytes(size, 0xfc);
    auto bounded = decoded;
    bounded.encoded = bytes;
    const auto output = opus::encode_packet(bounded);
    REQUIRE(output.size == 24 + size);
    REQUIRE(::bridge::compat::ranges::equal(opus::decode_packet(output.bytes()).encoded, bytes));
  }
  for (const auto size : {0U, 1U, 1276U}) {
    const std::vector<std::uint8_t> bytes(size, 0xfc);
    auto bad = decoded;
    bad.encoded = bytes;
    REQUIRE_THROWS_AS(opus::encode_packet(bad), ProtocolError);
  }
  auto bad = decoded;
  bad.epoch = 0;
  REQUIRE_THROWS_AS(opus::encode_packet(bad), ProtocolError);
  bad = decoded;
  bad.timestamp_us = UINT64_MAX - 19999;
  REQUIRE_THROWS_AS(opus::encode_packet(bad), ProtocolError);
  bad = decoded;
  bad.frames = 1;
  REQUIRE_THROWS_AS(opus::encode_packet(bad), ProtocolError);
  bad = decoded;
  bad.silence_frames = 961;
  REQUIRE_THROWS_AS(opus::encode_packet(bad), ProtocolError);
  bad = decoded;
  bad.epoch = UINT64_MAX;
  bad.timestamp_us = UINT64_MAX - 20000;
  bad.frames = 0;
  bad.silence_frames = 960;
  const auto boundary_owner = opus::encode_packet(bad);
  const auto boundary = opus::decode_packet(boundary_owner.bytes());
  REQUIRE(boundary.epoch == UINT64_MAX);
  REQUIRE(boundary.timestamp_us == UINT64_MAX - 20000);
  std::vector<std::uint8_t> oversized(opus::max_packet_bytes + 1);
  ::bridge::compat::ranges::copy(packet, oversized.begin());
  REQUIRE_THROWS_AS(opus::decode_packet(oversized), ProtocolError);
}

TEST_CASE("Opus IPC envelope refuses length and correlation claims before body allocation") {
  using namespace bridge::ipc;
  const auto header =
      encode_header({Kind::audio_opus, 0, static_cast<std::uint32_t>(packet.size())});
  REQUIRE(header[6] == 0);
  REQUIRE(header[7] == 36);
  REQUIRE(decode_header(header).length == packet.size());
  for (const auto size : {0U, 1U, 24U, 25U, 1300U, 0xffffffffU}) {
    auto bad = header;
    for (unsigned i = 0; i < 4; ++i)
      bad[20 + i] = static_cast<std::uint8_t>(size >> ((3 - i) * 8));
    REQUIRE_THROWS_AS(decode_header(bad), ProtocolError);
  }
  for (const auto size : {26U, 1299U})
    REQUIRE(decode_header(encode_header({Kind::audio_opus, 0, size})).length == size);
  auto correlated = header;
  correlated[19] = 1;
  REQUIRE_THROWS_AS(decode_header(correlated), ProtocolError);
  REQUIRE_THROWS_AS(encode_header({Kind::audio_opus, 1, 27}), ProtocolError);
  OutputQueue output;
  REQUIRE(output.push(Kind::audio_config, 0, config) == EnqueueStatus::invalid);
  REQUIRE(output.push(Kind::audio_opus, 0, packet) == EnqueueStatus::invalid);
  REQUIRE_FALSE(output.take()); // Preparation does not activate a transport lane.
}

TEST_CASE("Opus source state preserves common clocks and uses a separate encoded profile") {
  using namespace bridge::ipc;
  const std::array<std::uint8_t, 40> ready{
      0, 1, 1, 2, 0, 0,    0,    0,    0, 0, 0, 1, 0, 0, 0,    0,    0, 0,    0, 9,
      0, 0, 0, 0, 0, 0x0f, 0x42, 0x40, 1, 2, 0, 0, 0, 0, 0xbb, 0x80, 3, 0xc0, 0, 0};
  const auto original = ready;
  const auto state = opus::decode_state(ready);
  REQUIRE(state.enabled);
  REQUIRE(state.availability == audio::Availability::ready);
  REQUIRE(state.revision == 1);
  REQUIRE(state.epoch == 9);
  REQUIRE(state.timestamp_us == 1000000);
  REQUIRE(opus::encode_state(state) == ready);
  REQUIRE(ready == original);
  REQUIRE_THROWS_AS(audio::decode_state(ready), ProtocolError);
  for (const auto availability :
       {audio::Availability::unavailable, audio::Availability::waiting, audio::Availability::ready,
        audio::Availability::suspended, audio::Availability::closed, audio::Availability::failed}) {
    auto changed = state;
    changed.availability = availability;
    REQUIRE(opus::decode_state(opus::encode_state(changed)).availability == availability);
  }
  const audio::State disabled{false, audio::Availability::unavailable, 1, 0, 0};
  const auto bytes = opus::encode_state(disabled);
  REQUIRE_FALSE(opus::decode_state(bytes).enabled);
  REQUIRE_FALSE(audio::decode_state(bytes).enabled); // Disabled profile is shared zero metadata.
  OutputQueue output;
  REQUIRE(output.push(Kind::audio_state, 0, ready) == EnqueueStatus::invalid);
  REQUIRE_FALSE(output.take());
}

TEST_CASE("Opus source state rejects descriptor corruption before common semantic normalization") {
  using namespace bridge::ipc;
  const auto ready = opus::encode_state({true, audio::Availability::ready, 1, 9, 1000000});
  for (std::size_t size = 0; size < ready.size(); ++size)
    REQUIRE_THROWS_AS(opus::decode_state(::bridge::compat::span(ready).first(size)), ProtocolError);
  auto extra = std::vector<std::uint8_t>(ready.begin(), ready.end());
  extra.push_back(0);
  REQUIRE_THROWS_AS(opus::decode_state(extra), ProtocolError);
  for (const auto at : {0U, 1U, 28U, 29U, 30U, 31U, 32U, 33U, 34U, 35U, 36U, 37U, 38U, 39U}) {
    auto bad = ready;
    bad[at] ^= 1;
    REQUIRE_THROWS_AS(opus::decode_state(bad), ProtocolError);
  }
  for (unsigned enabled = 2; enabled <= 255; ++enabled) {
    auto bad = ready;
    bad[2] = static_cast<std::uint8_t>(enabled);
    REQUIRE_THROWS_AS(opus::decode_state(bad), ProtocolError);
  }
  for (unsigned availability = 6; availability <= 255; ++availability) {
    auto bad = ready;
    bad[3] = static_cast<std::uint8_t>(availability);
    REQUIRE_THROWS_AS(opus::decode_state(bad), ProtocolError);
  }
  REQUIRE_THROWS_AS(opus::encode_state({true, audio::Availability::ready, 0, 9, 0}), ProtocolError);
  REQUIRE_THROWS_AS(opus::encode_state({true, audio::Availability::ready, 1, 0, 0}), ProtocolError);
  REQUIRE_THROWS_AS(opus::encode_state({false, audio::Availability::ready, 1, 9, 0}),
                    ProtocolError);
  REQUIRE_THROWS_AS(opus::encode_state({false, audio::Availability::unavailable, 1, 1, 0}),
                    ProtocolError);
  REQUIRE_THROWS_AS(opus::encode_state({true, audio::Availability::waiting, 1, 0, UINT64_MAX}),
                    ProtocolError);
  REQUIRE_NOTHROW(opus::encode_state({true, audio::Availability::failed, UINT64_MAX, UINT64_MAX,
                                      UINT64_MAX - audio::interval_us}));
}
