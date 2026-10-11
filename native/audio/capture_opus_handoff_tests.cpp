#include "capture_handoff.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <stdexcept>
#include <vector>
using namespace bridge::audio;
namespace ipc = bridge::ipc;
using ipc::microphone::Result;
namespace {
auto payload(std::size_t length = 3) {
  const std::vector<std::uint8_t> bytes(length, 0xfc);
  return ipc::microphone::opus::encode_packet({4, 1000000, 312, true, bytes});
}
struct OpusSink {
  unsigned calls = 0;
  bool valid = true, reenter = false, owned = false, retired = true, nested_service = true,
       throws = false;
  Result result = Result::accepted;
  CaptureHandoff *handoff = nullptr;
  std::span<const std::uint8_t> source, borrowed;
  std::optional<Result> nested_enqueue;
  static Result submit(void *owner, const ipc::microphone::opus::Packet &packet) {
    auto &s = *static_cast<OpusSink *>(owner);
    ++s.calls;
    s.valid &= packet.epoch == 4 && packet.timestamp_us == 1000000 &&
               packet.lookahead_frames == 312 && packet.discontinuity;
    s.valid &= std::ranges::all_of(packet.encoded, [](auto byte) { return byte == 0xfc; });
    s.borrowed = packet.encoded;
    if (s.reenter) {
      s.owned = s.handoff->stats().owned_bytes == 1275;
      s.nested_enqueue = s.handoff->enqueue(2, s.source, 101, 4, true);
      s.nested_service = s.handoff->service_opus(101, 4, true, submit, owner).has_value();
      s.retired = s.handoff->retire();
      s.valid &= std::ranges::all_of(packet.encoded, [](auto byte) { return byte == 0xfc; });
    }
    if (s.throws)
      throw std::runtime_error("Synthetic Opus handoff callback failure");
    return s.result;
  }
};
} // namespace
TEST_CASE("Opus microphone handoff owns one bounded compressed slot and wipes only after callback "
          "returns") {
  for (const auto length : {2U, 1275U}) {
    CaptureHandoff handoff(CaptureCodec::opus);
    auto input = payload(length);
    OpusSink sink;
    sink.handoff = &handoff;
    sink.source = input.bytes();
    sink.reenter = true;
    const auto saved = input;
    REQUIRE_FALSE(handoff.enqueue(1, input.bytes(), 100, 4, true));
    REQUIRE(handoff.stats().owned_bytes == 1275);
    REQUIRE(handoff.enqueue(2, input.bytes(), 101, 4, true) == Result::busy);
    REQUIRE_FALSE(handoff.retire());
    const auto completion = handoff.service_opus(101, 4, true, OpusSink::submit, &sink);
    REQUIRE(completion);
    REQUIRE(completion->request_id == 1);
    REQUIRE(completion->result == Result::accepted);
    REQUIRE(sink.calls == 1);
    REQUIRE(sink.valid);
    REQUIRE(sink.owned);
    REQUIRE(sink.nested_enqueue == Result::busy);
    REQUIRE_FALSE(sink.nested_service);
    REQUIRE_FALSE(sink.retired);
    REQUIRE(std::ranges::equal(input.bytes(), saved.bytes()));
    REQUIRE(std::ranges::all_of(sink.borrowed, [](auto byte) { return byte == 0; }));
    REQUIRE(handoff.stats().owned_bytes == 0);
    REQUIRE(handoff.retire());
    REQUIRE(handoff.enqueue(3, input.bytes(), 102, 4, true) == Result::unavailable);
  }
}
TEST_CASE("Opus microphone handoff rechecks current epoch readiness expiry clock and callback "
          "without decoding or retry") {
  for (unsigned mode = 0; mode < 12; ++mode) {
    CaptureHandoff handoff(CaptureCodec::opus);
    const auto input = payload();
    OpusSink sink;
    REQUIRE_FALSE(handoff.enqueue(9, input.bytes(), 100, 4, true));
    auto now = std::uint64_t{101}, epoch = std::uint64_t{4};
    bool ready = true;
    auto submit = OpusSink::submit;
    void *owner = &sink;
    Result expected = Result::accepted;
    if (mode == 0) {
      epoch = 5;
      expected = Result::stale;
    }
    if (mode == 1) {
      ready = false;
      expected = Result::unavailable;
    }
    if (mode == 2) {
      now = 20100;
      expected = Result::busy;
    }
    if (mode == 3) {
      now = 99;
      expected = Result::busy;
    }
    if (mode == 4) {
      submit = nullptr;
      expected = Result::unavailable;
    }
    if (mode == 5) {
      owner = nullptr;
      expected = Result::unavailable;
    }
    if (mode >= 6 && mode <= 9) {
      sink.result = static_cast<Result>(mode - 5);
      expected = sink.result;
    }
    if (mode == 10) {
      sink.result = static_cast<Result>(255);
      expected = Result::invalid;
    }
    if (mode == 11) {
      sink.throws = true;
      expected = Result::unavailable;
    }
    const auto completion = handoff.service_opus(now, epoch, ready, submit, owner);
    REQUIRE(completion);
    REQUIRE(completion->request_id == 9);
    REQUIRE(completion->result == expected);
    REQUIRE(sink.calls == (mode >= 6 ? 1U : 0U));
    REQUIRE(handoff.stats().expired == (mode == 2 ? 1U : 0U));
    REQUIRE(handoff.stats().owned_bytes == 0);
    REQUIRE_FALSE(handoff.pending());
    REQUIRE_FALSE(handoff.service_opus(now + 1, 4, true, submit, owner));
    REQUIRE(handoff.retire());
  }
}
TEST_CASE("Opus microphone handoff validates only its selected grammar and preserves pending "
          "storage after malformed input") {
  CaptureHandoff opus(CaptureCodec::opus), pcm;
  auto input = payload();
  REQUIRE_THROWS_AS(CaptureHandoff(static_cast<CaptureCodec>(9)), ipc::ProtocolError);
  REQUIRE_THROWS_AS(pcm.enqueue(1, input.bytes(), 0, 4, true), ipc::ProtocolError);
  const std::vector<std::uint8_t> samples(3840);
  const auto raw = ipc::microphone::encode_pcm({4, 0, true, samples});
  REQUIRE_THROWS_AS(opus.enqueue(1, raw, 0, 4, true), ipc::ProtocolError);
  REQUIRE(opus.enqueue(1, input.bytes(), 0, 4, false) == Result::unavailable);
  REQUIRE(opus.enqueue(1, input.bytes(), 0, 5, true) == Result::stale);
  REQUIRE(opus.enqueue(1, input.bytes(), UINT64_MAX - 19999, 4, true) == Result::busy);
  REQUIRE_FALSE(opus.enqueue(1, input.bytes(), 100, 4, true));
  REQUIRE_THROWS_AS(opus.enqueue(0, input.bytes(), 100, 4, true), ipc::ProtocolError);
  auto bad = input;
  bad.storage[6] = 255;
  REQUIRE_THROWS_AS(opus.enqueue(2, bad.bytes(), 101, 4, true), ipc::ProtocolError);
  REQUIRE(opus.stats().queued == 1);
  std::fill(input.storage.begin() + 24, input.storage.end(), 0);
  OpusSink sink;
  REQUIRE(opus.service_opus(101, 4, true, OpusSink::submit, &sink)->result == Result::accepted);
  REQUIRE(sink.valid);
  const auto fresh = payload();
  REQUIRE_FALSE(opus.enqueue(3, fresh.bytes(), 200, 4, true));
  REQUIRE(opus.service(201, 4, true, nullptr, nullptr)->result ==
          Result::unavailable); // Wrong callback profile cannot dispatch.
  REQUIRE_FALSE(opus.pending());
  REQUIRE(opus.retire());
}
TEST_CASE("Opus microphone handoff reuses a fixed slot under burst and drains unserved input on "
          "shutdown") {
  CaptureHandoff handoff(CaptureCodec::opus);
  OpusSink sink;
  const std::uint8_t *address = nullptr;
  for (std::uint64_t i = 0; i < 1000; ++i) {
    const auto input = payload((i % 2) != 0 ? 2U : 1275U);
    REQUIRE_FALSE(handoff.enqueue(i + 1, input.bytes(), i * 20000, 4, true));
    REQUIRE(handoff.service_opus(i * 20000 + 1, 4, true, OpusSink::submit, &sink)->result ==
            Result::accepted);
    if (!address)
      address = sink.borrowed.data();
    REQUIRE(sink.borrowed.data() == address);
    REQUIRE(handoff.stats().owned_bytes == 0);
  }
  REQUIRE(sink.calls == 1000);
  REQUIRE(sink.valid);
  const auto input = payload();
  REQUIRE_FALSE(handoff.enqueue(1001, input.bytes(), 20000000, 4, true));
  REQUIRE(handoff.service_opus(20000001, 4, false, OpusSink::submit, &sink)->result ==
          Result::unavailable);
  REQUIRE(sink.calls == 1000);
  REQUIRE(handoff.retire());
}
