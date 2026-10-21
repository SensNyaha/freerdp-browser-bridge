#include "../compat/span.hpp"
#include "audio.hpp"
#include "output_queue.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
using namespace bridge::ipc;
namespace {
const std::array<std::uint8_t, 40> ready{0, 1, 1, 2, 0, 0, 0,   0,   0, 0,   0, 1,  0,  0,
                                         0, 0, 0, 0, 0, 9, 0,   0,   0, 0,   0, 15, 66, 64,
                                         2, 2, 1, 0, 0, 0, 187, 128, 3, 192, 0, 0};
}
TEST_CASE(
    "PCM state codec matches independent descriptor and represents stop without PCM samples") {
  const auto state = audio::decode_state(ready);
  REQUIRE(state.enabled);
  REQUIRE(state.availability == audio::Availability::ready);
  REQUIRE(state.revision == 1);
  REQUIRE(state.epoch == 9);
  REQUIRE(state.timestamp_us == 1000000);
  REQUIRE(audio::encode_state(state) == ready);
  const auto closed = audio::encode_state({true, audio::Availability::closed, 2, 9, 1020000});
  REQUIRE(audio::decode_state(closed).availability == audio::Availability::closed);
  const auto disabled = audio::encode_state({false, audio::Availability::unavailable, 1, 0, 0});
  REQUIRE_FALSE(audio::decode_state(disabled).enabled);
  REQUIRE(std::all_of(disabled.begin() + 28, disabled.end(), [](auto b) { return b == 0; }));
}
TEST_CASE(
    "PCM state rejects all malformed flags modes descriptors truncations and scalar boundaries") {
  for (std::size_t length = 0; length < ready.size(); ++length)
    REQUIRE_THROWS_AS(audio::decode_state(::bridge::compat::span(ready).first(length)), ProtocolError);
  std::vector<std::uint8_t> longer(ready.begin(), ready.end());
  longer.push_back(0);
  REQUIRE_THROWS_AS(audio::decode_state(longer), ProtocolError);
  for (unsigned value = 2; value <= 255; ++value) {
    auto bytes = ready;
    bytes[2] = static_cast<std::uint8_t>(value);
    REQUIRE_THROWS_AS(audio::decode_state(bytes), ProtocolError);
  }
  for (unsigned value = 6; value <= 255; ++value) {
    auto bytes = ready;
    bytes[3] = static_cast<std::uint8_t>(value);
    REQUIRE_THROWS_AS(audio::decode_state(bytes), ProtocolError);
  }
  for (const auto index : {0U, 1U, 28U, 29U, 30U, 31U, 32U, 33U, 34U, 35U, 36U, 37U, 38U, 39U}) {
    auto bytes = ready;
    bytes[index] ^= 1;
    REQUIRE_THROWS_AS(audio::decode_state(bytes), ProtocolError);
  }
  REQUIRE_THROWS_AS(audio::encode_state({true, audio::Availability::ready, 0, 9, 0}),
                    ProtocolError);
  REQUIRE_THROWS_AS(audio::encode_state({true, audio::Availability::ready, 1, 0, 0}),
                    ProtocolError);
  REQUIRE_THROWS_AS(audio::encode_state({false, audio::Availability::ready, 1, 9, 0}),
                    ProtocolError);
  REQUIRE_THROWS_AS(audio::encode_state({false, audio::Availability::unavailable, 1, 1, 0}),
                    ProtocolError);
  REQUIRE_THROWS_AS(audio::encode_state({true, audio::Availability::waiting, 1, 0, UINT64_MAX}),
                    ProtocolError);
  REQUIRE_NOTHROW(audio::encode_state({true, audio::Availability::failed, UINT64_MAX, UINT64_MAX,
                                       UINT64_MAX - audio::interval_us}));
}
TEST_CASE(
    "PCM state envelope limits precede allocation and status has validated control priority") {
  const auto header = encode_header({Kind::audio_state, 0, 40});
  REQUIRE(decode_header(header).length == 40);
  for (const auto length : {0U, 39U, 41U, UINT32_MAX})
    REQUIRE_THROWS_AS(encode_header({Kind::audio_state, 0, length}), ProtocolError);
  OutputQueue queue;
  REQUIRE(queue.push(Kind::frame, 1, std::array<std::uint8_t, 24>{}) == EnqueueStatus::accepted);
  REQUIRE(queue.push(Kind::audio_state, 1, ready) == EnqueueStatus::invalid);
  REQUIRE(queue.push(Kind::audio_state, 0, std::array<std::uint8_t, 40>{}) ==
          EnqueueStatus::invalid);
  REQUIRE(queue.push(Kind::audio_state, 0, ready) == EnqueueStatus::accepted);
  REQUIRE(queue.take()->kind == Kind::audio_state);
  REQUIRE(queue.take()->kind == Kind::frame);
}
