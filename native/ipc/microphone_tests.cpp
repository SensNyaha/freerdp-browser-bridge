#include "microphone.hpp"
#include "output_queue.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <memory>

using namespace bridge::ipc;
namespace {
std::vector<std::uint8_t> golden() {
  std::vector<std::uint8_t> bytes(microphone::packet_bytes);
  constexpr std::array<std::uint8_t, 28> prefix{1, 2,    3,    0xc0, 0, 0,    0,    0,   1, 2,
                                                3, 4,    5,    6,    7, 8,    0,    0,   0, 0,
                                                0, 0x0f, 0x42, 0x40, 0, 0x80, 0xff, 0x7f};
  std::copy(prefix.begin(), prefix.end(), bytes.begin());
  return bytes;
}
} // namespace
TEST_CASE("Microphone reset reply is validated and admitted on bounded control lane") {
  auto output = std::make_unique<OutputQueue>();
  const auto unavailable = microphone::encode_reset_result(microphone::ResetResult::unavailable);
  REQUIRE(output->push(Kind::microphone_reset_result, 9, unavailable) == EnqueueStatus::accepted);
  const auto reply = output->take();
  REQUIRE(reply);
  REQUIRE(reply->kind == Kind::microphone_reset_result);
  REQUIRE(reply->request_id == 9);
  auto malformed = unavailable;
  malformed[1] = 4;
  REQUIRE(output->push(Kind::microphone_reset_result, 10, malformed) == EnqueueStatus::invalid);
  REQUIRE_FALSE(output->take());
  REQUIRE(output->push(Kind::microphone_reset, 10, microphone::encode_reset(1)) ==
          EnqueueStatus::invalid);
}
TEST_CASE(
    "Microphone reset codec uses independent epoch correlation and fixed preallocation bounds") {
  constexpr std::array<std::uint8_t, 12> expected{1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8};
  REQUIRE(microphone::encode_reset(0x0102030405060708ULL) == expected);
  REQUIRE(microphone::decode_reset(expected) == 0x0102030405060708ULL);
  REQUIRE(microphone::decode_reset(microphone::encode_reset(UINT64_MAX)) == UINT64_MAX);
  REQUIRE_THROWS_AS(microphone::encode_reset(0), ProtocolError);
  for (std::size_t length = 0; length < expected.size(); ++length)
    REQUIRE_THROWS_AS(microphone::decode_reset(std::span(expected).first(length)), ProtocolError);
  for (std::size_t at = 0; at < 4; ++at) {
    auto bad = expected;
    bad[at] ^= 1;
    REQUIRE_THROWS_AS(microphone::decode_reset(bad), ProtocolError);
  }
  const std::array<std::uint8_t, 12> zero_epoch{1};
  REQUIRE_THROWS_AS(microphone::decode_reset(zero_epoch), ProtocolError);
  for (unsigned code = 0; code < 256; ++code) {
    const std::array<std::uint8_t, 4> bytes{1, static_cast<std::uint8_t>(code), 0, 0};
    if (code < 4) {
      const auto result = static_cast<microphone::ResetResult>(code);
      REQUIRE(microphone::decode_reset_result(bytes) == result);
      REQUIRE(microphone::encode_reset_result(result) == bytes);
    } else {
      REQUIRE_THROWS_AS(microphone::decode_reset_result(bytes), ProtocolError);
      REQUIRE_THROWS_AS(microphone::encode_reset_result(static_cast<microphone::ResetResult>(code)),
                        ProtocolError);
    }
  }
  for (const auto [kind, length] : {std::pair{Kind::microphone_reset, std::size_t{12}},
                                    {Kind::microphone_reset_result, std::size_t{4}}}) {
    auto bytes = encode({kind, UINT64_MAX, std::vector<std::uint8_t>(length)});
    bytes.resize(header_bytes);
    REQUIRE(decode_header(bytes).request_id == UINT64_MAX);
    REQUIRE(decode_header(bytes).length == length);
    for (const auto invalid : {std::uint64_t{0}, std::uint64_t{length - 1},
                               std::uint64_t{length + 1}, std::uint64_t{UINT32_MAX}}) {
      auto header = bytes;
      header.resize(20);
      append_be(header, invalid, 4);
      REQUIRE_THROWS_AS(decode_header(header), ProtocolError);
    }
    std::fill(bytes.begin() + 12, bytes.begin() + 20, 0);
    REQUIRE_THROWS_AS(decode_header(bytes), ProtocolError);
  }
}
TEST_CASE("Microphone PCM codec validates independent golden fixed profile and borrowed samples") {
  const auto original_bytes = golden();
  auto bytes = original_bytes;
  const auto packet = microphone::decode_pcm(original_bytes);
  REQUIRE(packet.epoch == 0x0102030405060708ULL);
  REQUIRE(packet.timestamp_us == 1000000);
  REQUIRE(packet.discontinuity);
  REQUIRE(packet.pcm.data() == original_bytes.data() + 24);
  REQUIRE(packet.pcm.size() == 3840);
  const auto encoded = microphone::encode_pcm(packet);
  REQUIRE(std::equal(encoded.begin(), encoded.end(), bytes.begin()));
  for (std::size_t length = 0; length < bytes.size(); ++length)
    REQUIRE_THROWS_AS(microphone::decode_pcm(std::span(bytes).first(length)), ProtocolError);
  bytes.push_back(0);
  REQUIRE_THROWS_AS(microphone::decode_pcm(bytes), ProtocolError);
  bytes = golden();
  for (const auto at : {0U, 1U, 2U, 3U, 4U, 5U, 6U, 7U}) {
    const auto original = bytes[at];
    for (unsigned value = 0; value < 256; ++value) {
      bytes[at] = static_cast<std::uint8_t>(value);
      if (bytes[at] == original || (at == 1 && value == 0))
        REQUIRE_NOTHROW(microphone::decode_pcm(bytes));
      else
        REQUIRE_THROWS_AS(microphone::decode_pcm(bytes), ProtocolError);
    }
    bytes[at] = original;
  }
  auto bad = packet;
  bad.epoch = 0;
  REQUIRE_THROWS_AS(microphone::encode_pcm(bad), ProtocolError);
  bad = packet;
  bad.timestamp_us = UINT64_MAX - 19999;
  REQUIRE_THROWS_AS(microphone::encode_pcm(bad), ProtocolError);
  bad.timestamp_us = UINT64_MAX - 20000;
  bad.epoch = UINT64_MAX;
  REQUIRE_NOTHROW(microphone::encode_pcm(bad));
  bad.pcm = {};
  REQUIRE_THROWS_AS(microphone::encode_pcm(bad), ProtocolError);
  // An output silence packet is not captured input, even when all bytes are zero.
  std::vector<std::uint8_t> silence(3840);
  const auto output = audio::encode_packet({1, 0, 0, 960, true, silence});
  REQUIRE_THROWS_AS(microphone::decode_pcm(output), ProtocolError);
}
TEST_CASE(
    "Microphone result and framing reject uncorrelated or oversized claims before allocation") {
  for (unsigned code = 0; code < 256; ++code) {
    const std::array<std::uint8_t, 4> bytes{1, static_cast<std::uint8_t>(code), 0, 0};
    if (code < 5)
      REQUIRE(microphone::encode_result(microphone::decode_result(bytes)) == bytes);
    else {
      REQUIRE_THROWS_AS(microphone::decode_result(bytes), ProtocolError);
      REQUIRE_THROWS_AS(microphone::encode_result(static_cast<microphone::Result>(code)),
                        ProtocolError);
    }
  }
  const auto result = microphone::encode_result(microphone::Result::unavailable);
  for (std::size_t n = 0; n < 4; ++n)
    REQUIRE_THROWS_AS(microphone::decode_result(std::span(result).first(n)), ProtocolError);
  REQUIRE_THROWS_AS(microphone::decode_result(std::array<std::uint8_t, 5>{1, 2}), ProtocolError);
  for (const auto at : {0U, 2U, 3U}) {
    auto bad = result;
    bad[at] = 255;
    REQUIRE_THROWS_AS(microphone::decode_result(bad), ProtocolError);
  }
  for (const auto kind : {Kind::microphone_pcm, Kind::microphone_result}) {
    const auto length = static_cast<std::uint32_t>(
        kind == Kind::microphone_pcm ? microphone::packet_bytes : microphone::result_bytes);
    REQUIRE(decode_header(encode_header({kind, UINT64_MAX, length})).request_id == UINT64_MAX);
    REQUIRE_THROWS_AS(encode_header({kind, 0, length}), ProtocolError);
    for (const auto size : {0U, length - 1, length + 1, UINT32_MAX})
      REQUIRE_THROWS_AS(validate_header({kind, 1, size}), ProtocolError);
  }
}
TEST_CASE("Microphone replies use bounded control FIFO without retaining PCM requests") {
  auto queue = std::make_unique<OutputQueue>();
  const auto bytes = microphone::encode_result(microphone::Result::unavailable);
  REQUIRE(queue->push(Kind::microphone_pcm, 1, golden()) == EnqueueStatus::invalid);
  REQUIRE(queue->push(Kind::microphone_result, 0, bytes) == EnqueueStatus::invalid);
  auto bad = bytes;
  bad[1] = 5;
  REQUIRE(queue->push(Kind::microphone_result, 1, bad) == EnqueueStatus::invalid);
  for (std::uint64_t id = 1; id <= OutputQueue::control_capacity; ++id)
    REQUIRE(queue->push(Kind::microphone_result, id, bytes) == EnqueueStatus::accepted);
  REQUIRE(queue->push(Kind::microphone_result, 65, bytes) == EnqueueStatus::full);
  REQUIRE(queue->select_audio_codec(OutputAudioCodec::opus));
  queue->discard_audio();
  for (std::uint64_t id = 1; id <= OutputQueue::control_capacity; ++id) {
    const auto item = queue->take();
    REQUIRE(item);
    REQUIRE(item->kind == Kind::microphone_result);
    REQUIRE(item->request_id == id);
    REQUIRE(microphone::decode_result(item->payload) == microphone::Result::unavailable);
  }
  REQUIRE_FALSE(queue->take());
  REQUIRE(queue->stats().bytes == 0);
}
