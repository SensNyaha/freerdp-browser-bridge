#include "../compat/span.hpp"
#include "audio_reset.hpp"
#include "output_queue.hpp"
#include <catch2/catch_test_macros.hpp>
#include <memory>
using namespace bridge::ipc;

TEST_CASE("Audio reset request validates schema reserved bytes epoch and exact length") {
  const std::array<std::uint8_t, 12> golden{1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8};
  REQUIRE(audio::encode_reset(0x0102030405060708ULL) == golden);
  REQUIRE(audio::decode_reset(golden) == 0x0102030405060708ULL);
  REQUIRE(audio::decode_reset(audio::encode_reset(UINT64_MAX)) == UINT64_MAX);
  REQUIRE_THROWS_AS(audio::encode_reset(0), ProtocolError);
  for (std::size_t n = 0; n < golden.size(); ++n)
    REQUIRE_THROWS_AS(audio::decode_reset(::bridge::compat::span(golden).first(n)), ProtocolError);
  auto extra = std::vector<std::uint8_t>(golden.begin(), golden.end());
  extra.push_back(0);
  REQUIRE_THROWS_AS(audio::decode_reset(extra), ProtocolError);
  REQUIRE_THROWS_AS(audio::decode_reset(std::array<std::uint8_t, 12>{1}), ProtocolError);
  for (std::size_t i = 0; i < 4; ++i) {
    auto bytes = golden;
    for (unsigned value = 0; value < 256; ++value) {
      bytes[i] = static_cast<std::uint8_t>(value);
      if (bytes == golden)
        REQUIRE_NOTHROW(audio::decode_reset(bytes));
      else
        REQUIRE_THROWS_AS(audio::decode_reset(bytes), ProtocolError);
    }
  }
}
TEST_CASE("Audio reset results and envelopes require typed status and correlated bounded bodies") {
  for (unsigned code = 0; code < 256; ++code) {
    const std::array<std::uint8_t, 4> bytes{1, static_cast<std::uint8_t>(code), 0, 0};
    if (code < 4) {
      REQUIRE(audio::encode_reset_result(audio::decode_reset_result(bytes)) == bytes);
    } else {
      REQUIRE_THROWS_AS(audio::decode_reset_result(bytes), ProtocolError);
      REQUIRE_THROWS_AS(audio::encode_reset_result(static_cast<audio::ResetResult>(code)),
                        ProtocolError);
    }
  }
  const auto result = audio::encode_reset_result(audio::ResetResult::unavailable);
  for (std::size_t n = 0; n < result.size(); ++n)
    REQUIRE_THROWS_AS(audio::decode_reset_result(::bridge::compat::span(result).first(n)), ProtocolError);
  REQUIRE_THROWS_AS(audio::decode_reset_result(std::array<std::uint8_t, 5>{1, 2}), ProtocolError);
  for (const auto i : {0U, 2U, 3U}) {
    auto bad = result;
    bad[i] = 255;
    REQUIRE_THROWS_AS(audio::decode_reset_result(bad), ProtocolError);
  }
  for (const auto kind : {Kind::audio_reset, Kind::audio_reset_result}) {
    const std::uint32_t length = kind == Kind::audio_reset ? 12 : 4;
    REQUIRE(decode_header(encode_header({kind, UINT64_MAX, length})).request_id == UINT64_MAX);
    REQUIRE_THROWS_AS(encode_header({kind, 0, length}), ProtocolError);
    for (const auto n : {0U, length - 1, length + 1, UINT32_MAX})
      REQUIRE_THROWS_AS(validate_header({kind, 1, n}), ProtocolError);
  }
}
TEST_CASE("Audio reset result uses existing bounded control FIFO without locking audio profile") {
  auto queue = std::make_unique<OutputQueue>();
  auto bytes = audio::encode_reset_result(audio::ResetResult::unavailable);
  REQUIRE(queue->push(Kind::audio_reset_result, 0, bytes) == EnqueueStatus::invalid);
  REQUIRE(queue->push(Kind::audio_reset, 1, audio::encode_reset(1)) == EnqueueStatus::invalid);
  auto invalid = bytes;
  invalid[1] = 4;
  REQUIRE(queue->push(Kind::audio_reset_result, 1, invalid) == EnqueueStatus::invalid);
  for (std::uint64_t id = 1; id <= OutputQueue::control_capacity; ++id)
    REQUIRE(queue->push(Kind::audio_reset_result, id, bytes) == EnqueueStatus::accepted);
  REQUIRE(queue->push(Kind::audio_reset_result, 65, bytes) == EnqueueStatus::full);
  REQUIRE(queue->select_audio_codec(OutputAudioCodec::opus));
  bytes[1] = 0;
  queue->discard_audio();
  for (std::uint64_t id = 1; id <= OutputQueue::control_capacity; ++id) {
    const auto record = queue->take();
    REQUIRE(record.has_value());
    REQUIRE(record->kind == Kind::audio_reset_result);
    REQUIRE(record->request_id == id);
    REQUIRE(audio::decode_reset_result(record->payload) == audio::ResetResult::unavailable);
  }
  REQUIRE_FALSE(queue->take());
  REQUIRE(queue->stats().bytes == 0);
}
