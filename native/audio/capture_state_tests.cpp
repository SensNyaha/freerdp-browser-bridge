#include "capture_state.hpp"
#include "output_queue.hpp"
#include <catch2/catch_test_macros.hpp>
#include <memory>
#include <stdexcept>

using namespace bridge::audio;
using bridge::ipc::audio::Availability;
namespace {
struct Receiver {
  CaptureStatePublisher *publisher = nullptr;
  std::optional<bridge::ipc::microphone::State> state;
  unsigned calls = 0;
  bool accepted = true, throws = false, reenter = false, observed = true, retired = true;
  CapturePublication nested = CapturePublication::published;
  static bool send(void *owner, bridge::ipc::Kind kind, std::span<const std::uint8_t> bytes) {
    auto &self = *static_cast<Receiver *>(owner);
    REQUIRE(kind == bridge::ipc::Kind::microphone_state);
    self.state = bridge::ipc::microphone::decode_state(bytes);
    ++self.calls;
    if (self.reenter) {
      self.observed = self.publisher->observe(Availability::closed, 4, 999);
      self.nested = self.publisher->publish(send, owner);
      self.retired = self.publisher->retire();
    }
    if (self.throws)
      throw std::runtime_error("synthetic state publication fault");
    return self.accepted;
  }
};
} // namespace

TEST_CASE("Microphone state codec fixes input profile and zero-ID preallocation boundaries") {
  using namespace bridge::ipc;
  const microphone::State state{true, Availability::ready, 1, 4, 100};
  const std::array<std::uint8_t, 40> golden{0, 1, 1, 2, 0, 0, 0,    0,    0, 0,    0, 1, 0, 0,
                                            0, 0, 0, 0, 0, 4, 0,    0,    0, 0,    0, 0, 0, 100,
                                            2, 2, 1, 0, 0, 0, 0xbb, 0x80, 3, 0xc0, 0, 0};
  REQUIRE(microphone::encode_state(state) == golden);
  REQUIRE(microphone::decode_state(golden).epoch == 4);
  for (std::size_t n = 0; n < golden.size(); ++n)
    REQUIRE_THROWS_AS(microphone::decode_state(std::span(golden).first(n)), ProtocolError);
  REQUIRE_THROWS_AS(microphone::decode_state(std::array<std::uint8_t, 41>{}), ProtocolError);
  for (const auto at :
       {0U, 1U, 2U, 3U, 28U, 29U, 30U, 31U, 32U, 33U, 34U, 35U, 36U, 37U, 38U, 39U}) {
    auto bytes = golden;
    bytes[at] = 255;
    REQUIRE_THROWS_AS(microphone::decode_state(bytes), ProtocolError);
  }
  REQUIRE(decode_header(encode_header({Kind::microphone_state, 0, 40})).length == 40);
  REQUIRE_THROWS_AS(encode_header({Kind::microphone_state, 1, 40}), ProtocolError);
  for (const auto length : {0U, 39U, 41U, UINT32_MAX})
    REQUIRE_THROWS_AS(validate_header({Kind::microphone_state, 0, length}), ProtocolError);
  auto queue = std::make_unique<OutputQueue>();
  REQUIRE(queue->push(Kind::microphone_state, 0, golden) == EnqueueStatus::accepted);
  REQUIRE(queue->select_audio_codec(OutputAudioCodec::opus));
  queue->discard_audio();
  REQUIRE(queue->take()->kind == Kind::microphone_state);
  REQUIRE(queue->stats().bytes == 0);
}

TEST_CASE("Microphone state publisher distinguishes desired from transport-admitted authority") {
  CaptureStatePublisher publisher(true);
  Receiver receiver;
  REQUIRE(publisher.publish(Receiver::send, &receiver) == CapturePublication::idle);
  REQUIRE_FALSE(publisher.published());
  REQUIRE(publisher.observe(Availability::waiting, 0, 0));
  REQUIRE(publisher.publish(Receiver::send, &receiver) == CapturePublication::published);
  REQUIRE(publisher.published()->revision == 1);
  REQUIRE(publisher.published()->availability == Availability::waiting);
  receiver.accepted = false;
  REQUIRE(publisher.observe(Availability::ready, 1, 100));
  REQUIRE(publisher.publish(Receiver::send, &receiver) == CapturePublication::busy);
  REQUIRE(publisher.published()->epoch == 0);
  REQUIRE(publisher.observe(Availability::ready, 2, 200));
  REQUIRE(publisher.publish(Receiver::send, &receiver) == CapturePublication::busy);
  REQUIRE(receiver.state->revision == 3);
  REQUIRE(publisher.published()->revision == 1);
  receiver.accepted = true;
  REQUIRE(publisher.publish(Receiver::send, &receiver) == CapturePublication::published);
  REQUIRE(publisher.published()->epoch == 2);
  REQUIRE(publisher.published()->revision == 3);
  REQUIRE(publisher.observe(Availability::ready, 2, 300));
  REQUIRE(publisher.publish(Receiver::send, &receiver) == CapturePublication::idle);
  REQUIRE(receiver.calls == 4);
  REQUIRE(publisher.stats().published == 2);
  REQUIRE(publisher.stats().backpressure == 2);
  REQUIRE(publisher.retire());
  REQUIRE_FALSE(publisher.published());
  REQUIRE(publisher.publish(Receiver::send, &receiver) == CapturePublication::inactive);
}

TEST_CASE(
    "Microphone state publisher rejects invalid or regressing source without changing candidate") {
  CaptureStatePublisher publisher(true);
  Receiver receiver;
  REQUIRE_FALSE(publisher.observe(Availability::ready, 0, 0));
  REQUIRE_FALSE(publisher.observe(static_cast<Availability>(255), 1, 0));
  REQUIRE_FALSE(publisher.observe(Availability::waiting, 0, UINT64_MAX));
  REQUIRE(publisher.observe(Availability::ready, 4, 100));
  REQUIRE(publisher.observe(Availability::ready, 4, 200));
  REQUIRE_FALSE(publisher.observe(Availability::ready, 4, 199));
  REQUIRE_FALSE(publisher.observe(Availability::closed, 3, 201));
  REQUIRE(publisher.publish(Receiver::send, &receiver) == CapturePublication::published);
  REQUIRE(receiver.state->timestamp_us == 100);
  REQUIRE(receiver.state->revision == 1);
  CaptureStatePublisher disabled(false);
  REQUIRE_FALSE(disabled.observe(Availability::ready, 1, 0));
  REQUIRE(disabled.observe(Availability::unavailable, 0, 0));
  REQUIRE(disabled.publish(Receiver::send, &receiver) == CapturePublication::published);
  REQUIRE_FALSE(receiver.state->enabled);
}

TEST_CASE(
    "Microphone state publisher prevents reentrant mutation and retires uncertain send faults") {
  for (const bool fault : {false, true}) {
    CaptureStatePublisher publisher(true);
    Receiver receiver;
    receiver.publisher = &publisher;
    receiver.reenter = true;
    receiver.throws = fault;
    REQUIRE(publisher.observe(Availability::ready, 4, 100));
    REQUIRE(publisher.publish(Receiver::send, &receiver) ==
            (fault ? CapturePublication::failed : CapturePublication::published));
    REQUIRE_FALSE(receiver.observed);
    REQUIRE_FALSE(receiver.retired);
    REQUIRE(receiver.nested == CapturePublication::busy);
    REQUIRE(receiver.calls == 1);
    if (fault) {
      REQUIRE_FALSE(publisher.published());
      REQUIRE_FALSE(publisher.observe(Availability::closed, 4, 200));
      REQUIRE(publisher.publish(Receiver::send, &receiver) == CapturePublication::failed);
      REQUIRE(receiver.calls == 1);
      REQUIRE(publisher.stats().failures == 1);
    } else {
      REQUIRE(publisher.published()->availability == Availability::ready);
      REQUIRE(publisher.published()->revision == 1);
    }
    REQUIRE(publisher.retire());
  }
  CaptureStatePublisher publisher(true);
  REQUIRE(publisher.observe(Availability::waiting, 0, 0));
  REQUIRE(publisher.publish(nullptr, nullptr) == CapturePublication::failed);
  REQUIRE_FALSE(publisher.published());
  REQUIRE(publisher.retire());
}
