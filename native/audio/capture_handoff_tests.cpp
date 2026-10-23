#include "../compat/span.hpp"
#include "capture_handoff.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <stdexcept>
#include <vector>

using namespace bridge::audio;
using bridge::ipc::microphone::Result;
namespace {
auto encoded(std::uint64_t timestamp = 0) {
  std::vector<std::uint8_t> pcm(3840, 42);
  return bridge::ipc::microphone::encode_pcm({4, timestamp, timestamp == 0, pcm});
}
struct Sink {
  unsigned calls = 0;
  bool valid = true, throws = false, reenter = false, retired = true;
  bool owned_during_callback = false, nested_service = true;
  const std::uint8_t *first_address = nullptr;
  Result status = Result::accepted;
  CaptureHandoff *handoff = nullptr;
  ::bridge::compat::span<const std::uint8_t> input;
  std::optional<Result> nested_enqueue;
  static Result submit(void *owner, const bridge::ipc::microphone::PcmPacket &packet) {
    auto &sink = *static_cast<Sink *>(owner);
    ++sink.calls;
    sink.valid &=
        packet.epoch == 4 && packet.pcm.size() == 3840 &&
        std::all_of(packet.pcm.begin(), packet.pcm.end(), [](auto value) { return value == 42; });
    if (!sink.first_address)
      sink.first_address = packet.pcm.data();
    sink.valid &= sink.first_address == packet.pcm.data();
    if (sink.reenter) {
      sink.owned_during_callback = sink.handoff->stats().owned_bytes == 3840;
      sink.nested_enqueue = sink.handoff->enqueue(2, sink.input, 101, 4, true);
      sink.nested_service = sink.handoff->service(101, 4, true, submit, owner).has_value();
      sink.retired = sink.handoff->retire();
      sink.valid &=
          std::all_of(packet.pcm.begin(), packet.pcm.end(), [](auto value) { return value == 42; });
    }
    if (sink.throws)
      throw std::runtime_error("synthetic handoff callback failure");
    return sink.status;
  }
};
} // namespace

TEST_CASE("Microphone handoff owns one copied PCM request and preserves it through refusal") {
  CaptureHandoff handoff;
  auto input = encoded();
  Sink sink;
  REQUIRE_FALSE(handoff.enqueue(1, input, 100, 4, true));
  REQUIRE(handoff.pending());
  REQUIRE(handoff.stats().owned_bytes == 3840);
  REQUIRE(handoff.enqueue(2, input, 101, 4, true) == Result::busy);
  REQUIRE_FALSE(handoff.retire());
  REQUIRE_THROWS_AS(handoff.enqueue(0, input, 101, 4, true), bridge::ipc::ProtocolError);
  REQUIRE_THROWS_AS(handoff.enqueue(2, ::bridge::compat::span(input).first(3863), 101, 4, true),
                    bridge::ipc::ProtocolError);
  std::fill(input.begin() + 24, input.end(), 99); // Producer storage is independent.
  const auto completed = handoff.service(19999, 4, true, Sink::submit, &sink);
  REQUIRE(completed);
  REQUIRE(completed->request_id == 1);
  REQUIRE(completed->result == Result::accepted);
  REQUIRE(sink.valid);
  REQUIRE(sink.calls == 1);
  REQUIRE_FALSE(handoff.pending());
  REQUIRE(handoff.stats().owned_bytes == 0);
  REQUIRE(handoff.stats().queued == 1);
  REQUIRE(handoff.stats().accepted == 1);
  REQUIRE(handoff.stats().busy == 1);
  REQUIRE_FALSE(handoff.service(20000, 4, true, Sink::submit, &sink));
  REQUIRE(handoff.retire());
  REQUIRE(handoff.enqueue(3, input, 20000, 4, true) == Result::unavailable);
}

TEST_CASE("Microphone handoff rechecks epoch readiness clocks and checked callback without retry") {
  for (unsigned mode = 0; mode < 10; ++mode) {
    CaptureHandoff handoff;
    const auto input = encoded();
    Sink sink;
    REQUIRE_FALSE(handoff.enqueue(9, input, 100, 4, true));
    auto now = std::uint64_t{101};
    auto epoch = std::uint64_t{4};
    bool ready = true;
    auto submit = Sink::submit;
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
      sink.throws = true;
      expected = Result::unavailable;
    }
    if (mode == 6) {
      sink.status = static_cast<Result>(255);
      expected = Result::invalid;
    }
    if (mode == 7) {
      sink.status = Result::busy;
      expected = Result::busy;
    }
    if (mode == 8) {
      sink.status = Result::stale;
      expected = Result::stale;
    }
    const auto completion = handoff.service(now, epoch, ready, submit, &sink);
    REQUIRE(completion);
    REQUIRE(completion->request_id == 9);
    REQUIRE(completion->result == expected);
    REQUIRE(sink.calls == (mode >= 5 ? 1U : 0U));
    REQUIRE(handoff.stats().expired == (mode == 2 ? 1U : 0U));
    REQUIRE(handoff.stats().owned_bytes == 0);
    REQUIRE_FALSE(handoff.service(now + 1, 4, true, Sink::submit, &sink));
    REQUIRE_FALSE(handoff.pending());
    REQUIRE(handoff.retire());
  }
}

TEST_CASE("Microphone handoff refuses reentrant mutation while the source borrows PCM") {
  CaptureHandoff handoff;
  const auto input = encoded();
  Sink sink;
  sink.handoff = &handoff;
  sink.input = input;
  sink.reenter = true;
  REQUIRE_FALSE(handoff.enqueue(1, input, 100, 4, true));
  const auto completion = handoff.service(101, 4, true, Sink::submit, &sink);
  REQUIRE(completion->result == Result::accepted);
  REQUIRE(sink.nested_enqueue == Result::busy);
  REQUIRE_FALSE(sink.nested_service);
  REQUIRE_FALSE(sink.retired);
  REQUIRE(sink.owned_during_callback);
  REQUIRE(sink.valid);
  REQUIRE(sink.calls == 1);
  REQUIRE(handoff.stats().busy == 1);
  REQUIRE(handoff.stats().owned_bytes == 0);
  REQUIRE(handoff.retire());
}

TEST_CASE(
    "Microphone handoff bounds deadlines drains shutdown and reuses fixed storage under load") {
  CaptureHandoff handoff;
  const auto input = encoded();
  REQUIRE(handoff.enqueue(1, input, 0, 4, false) == Result::unavailable);
  REQUIRE(handoff.enqueue(1, input, 0, 0, true) == Result::unavailable);
  REQUIRE(handoff.enqueue(1, input, 0, 5, true) == Result::stale);
  REQUIRE(handoff.enqueue(1, input, UINT64_MAX - 19999, 4, true) == Result::busy);
  REQUIRE_FALSE(handoff.pending());
  REQUIRE_FALSE(handoff.enqueue(UINT64_MAX, input, UINT64_MAX - 20000, 4, true));
  Sink sink;
  REQUIRE(handoff.service(UINT64_MAX - 1, 4, true, Sink::submit, &sink)->result ==
          Result::accepted);
  for (std::uint64_t packet = 0; packet < 1000; ++packet) {
    const auto bytes = encoded(packet * 20000);
    REQUIRE_FALSE(handoff.enqueue(packet + 1, bytes, packet * 20000, 4, true));
    REQUIRE(handoff.stats().owned_bytes == 3840);
    REQUIRE(handoff.service(packet * 20000 + 1, 4, true, Sink::submit, &sink)->result ==
            Result::accepted);
    REQUIRE(handoff.stats().owned_bytes == 0);
  }
  REQUIRE(sink.valid);
  REQUIRE(sink.calls == 1001);
  REQUIRE_FALSE(handoff.enqueue(1001, input, 0, 4, true));
  REQUIRE(handoff.service(1, 4, false, nullptr, nullptr)->result == Result::unavailable);
  REQUIRE(sink.calls == 1001);
  REQUIRE(handoff.retire());
  REQUIRE(handoff.stats().owned_bytes == 0);
}
