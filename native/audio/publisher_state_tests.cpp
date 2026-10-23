#include "output_queue.hpp"
#include "publisher.hpp"
#include <catch2/catch_test_macros.hpp>
#include <stdexcept>
#include <vector>

using namespace bridge::audio;
namespace {
namespace ipc = bridge::ipc;
struct Fixture {
  RdpsndSink sink;
  bool reset_credit = true, state_credit = true;
  std::size_t resets = 0;
  PcmPublisher publisher{sink,
                         [this] {
                           if (!reset_credit)
                             return false;
                           ++resets;
                           return true;
                         },
                         0, 0};
  std::vector<ipc::Packet> records;
  PcmPublisher::TrySend send = [this](auto kind, auto bytes) {
    if (kind == ipc::Kind::audio_state && !state_credit)
      return false;
    records.push_back({kind, 0, {bytes.begin(), bytes.end()}});
    return true;
  };
  void open() {
    AUDIO_FORMAT format{};
    format.wFormatTag = WAVE_FORMAT_PCM;
    format.nChannels = 2;
    format.nSamplesPerSec = 48000;
    format.nAvgBytesPerSec = 192000;
    format.nBlockAlign = 4;
    format.wBitsPerSample = 16;
    REQUIRE(sink.device().Open(&sink.device(), &format, 0));
  }
  void play(std::size_t frames = 960) {
    const std::vector<std::uint8_t> bytes(frames * 4, 42);
    REQUIRE(sink.device().Play(&sink.device(), bytes.data(), bytes.size()) > 0);
  }
  ipc::audio::State state(std::size_t at, ipc::audio::Availability availability,
                          std::uint64_t revision, std::uint64_t epoch, std::uint64_t now) {
    REQUIRE(records.size() > at);
    REQUIRE(records[at].kind == ipc::Kind::audio_state);
    const auto value = ipc::audio::decode_state(records[at].payload);
    REQUIRE(value.enabled);
    REQUIRE(value.availability == availability);
    REQUIRE(value.revision == revision);
    REQUIRE(value.epoch == epoch);
    REQUIRE(value.timestamp_us == now);
    return value;
  }
};
} // namespace

TEST_CASE("PCM source status reserves an epoch and reports Close without fresh samples") {
  Fixture f;
  using A = ipc::audio::Availability;
  REQUIRE(f.publisher.pump(0, f.send) == PublishStatus::sent);
  f.state(0, A::waiting, 1, 1, 0);
  REQUIRE(f.publisher.pump(1, f.send) == PublishStatus::idle);
  f.open();
  REQUIRE(f.publisher.pump(2, f.send) == PublishStatus::sent);
  f.state(1, A::waiting, 2, 1, 2);
  f.play();
  REQUIRE(f.publisher.pump(1000, f.send) == PublishStatus::sent);
  f.state(2, A::ready, 3, 1, 1000);
  REQUIRE(f.records[3].kind == ipc::Kind::audio_config);
  REQUIRE(ipc::audio::decode_config(f.records[3].payload).epoch == 1);
  REQUIRE(ipc::audio::decode_packet(f.records[4].payload).epoch == 1);
  REQUIRE(f.sink.reset_stream(SourceAvailability::closed));
  REQUIRE(f.publisher.pump(2000, f.send) == PublishStatus::sent);
  f.state(5, A::closed, 4, 2, 2000);
  REQUIRE(f.sink.ready()); // Source stop is independent of retained device ownership.
  REQUIRE(f.publisher.pump(3000, f.send) == PublishStatus::idle);
  REQUIRE(f.sink.reset_stream(SourceAvailability::closed));
  REQUIRE(f.publisher.pump(4000, f.send) == PublishStatus::sent);
  f.state(6, A::closed, 5, 2, 4000); // Multiple resets do not consume reserved epochs.
  f.play();
  REQUIRE(f.publisher.pump(21000, f.send) == PublishStatus::sent);
  f.state(7, A::ready, 6, 2, 21000);
  REQUIRE(ipc::audio::decode_config(f.records[8].payload).epoch == 2);
  REQUIRE(ipc::audio::decode_packet(f.records[9].payload).epoch == 2);
  REQUIRE(f.publisher.stats()->sent_states == 6);
  REQUIRE_FALSE(f.publisher.stats()->state_pending);
  REQUIRE(f.sink.retire());
  REQUIRE(f.publisher.pump(22000, f.send) == PublishStatus::sent);
  f.state(10, A::closed, 7, 3, 22000);
  REQUIRE(f.records.size() == 11);
}

TEST_CASE("PCM blocked source status keeps one latest state ahead of config and samples") {
  Fixture f;
  f.open();
  f.play();
  f.reset_credit = false;
  REQUIRE(f.publisher.pump(0, f.send) == PublishStatus::blocked);
  REQUIRE(f.sink.stats()->queue.queued_frames == 960);
  REQUIRE(f.records.empty());
  f.reset_credit = true;
  f.state_credit = false;
  REQUIRE(f.publisher.pump(1, f.send) == PublishStatus::blocked);
  REQUIRE(f.publisher.stats()->pending);
  REQUIRE(f.publisher.stats()->state_pending);
  REQUIRE(f.records.empty());
  REQUIRE(f.sink.reset_stream(SourceAvailability::suspended));
  REQUIRE(f.publisher.pump(2, f.send) == PublishStatus::blocked);
  REQUIRE_FALSE(f.publisher.stats()->pending);
  REQUIRE(f.records.empty());
  f.state_credit = true;
  REQUIRE(f.publisher.pump(3, f.send) == PublishStatus::sent);
  f.state(0, ipc::audio::Availability::suspended, 1, 2, 3);
  REQUIRE(f.sink.reset_stream(SourceAvailability::closed));
  REQUIRE(f.sink.reset_stream(SourceAvailability::waiting));
  REQUIRE(f.publisher.pump(4, f.send) == PublishStatus::sent);
  f.state(1, ipc::audio::Availability::waiting, 2, 2, 4);
  f.play();
  REQUIRE(f.publisher.pump(20001, f.send) == PublishStatus::sent);
  f.state(2, ipc::audio::Availability::ready, 3, 2, 20001);
  REQUIRE(ipc::audio::decode_config(f.records[3].payload).epoch == 2);
  REQUIRE(ipc::audio::decode_packet(f.records[4].payload).epoch == 2);
  REQUIRE(f.records.size() == 5);
  REQUIRE(f.publisher.stats()->reset_discarded_packets == 1);
}

TEST_CASE("PCM packetizer skip clears older unsent PCM before the next status epoch") {
  Fixture f;
  ipc::OutputQueue output;
  PcmPublisher publisher(
      f.sink,
      [&] {
        output.discard_audio();
        return true;
      },
      0, 0);
  const PcmPublisher::TrySend send = [&](auto kind, auto bytes) {
    return output.push(kind, 0, bytes) == ipc::EnqueueStatus::accepted;
  };
  f.open();
  f.play(2880);
  REQUIRE(publisher.pump(0, send) == PublishStatus::sent);
  const auto first_state = output.take();
  REQUIRE(first_state->kind == ipc::Kind::audio_state);
  REQUIRE(ipc::audio::decode_state(first_state->payload).epoch == 1);
  REQUIRE(output.stats().records == 2);
  const auto source_revision = f.sink.stream_revision();
  REQUIRE(publisher.pump(60000, send) == PublishStatus::sent);
  REQUIRE(f.sink.stream_revision() == source_revision);
  REQUIRE(output.stats().discarded_audio == 1);
  REQUIRE(output.stats().records == 3);
  const auto state = output.take();
  REQUIRE(state->kind == ipc::Kind::audio_state);
  REQUIRE(ipc::audio::decode_state(state->payload).epoch == 2);
  REQUIRE(ipc::audio::decode_state(state->payload).revision == 2);
  REQUIRE(ipc::audio::decode_config(output.take()->payload).epoch == 2);
  const auto packet = output.take();
  const auto pcm = ipc::audio::decode_packet(packet->payload);
  REQUIRE(pcm.epoch == 2);
  REQUIRE(pcm.timestamp_us == 60000);
  REQUIRE(pcm.discontinuity);
  REQUIRE(pcm.silence_frames == 960);
  REQUIRE_FALSE(output.take());
  REQUIRE(publisher.stats()->consumer_resets == 2);
}

TEST_CASE("PCM full control lane refuses status without admitting config or stale PCM") {
  Fixture f;
  ipc::OutputQueue output;
  PcmPublisher publisher(
      f.sink,
      [&] {
        output.discard_audio();
        return true;
      },
      0, 0);
  std::size_t sample_attempts = 0;
  const PcmPublisher::TrySend send = [&](auto kind, auto bytes) {
    if (kind != ipc::Kind::audio_state)
      ++sample_attempts;
    return output.push(kind, 0, bytes) == ipc::EnqueueStatus::accepted;
  };
  for (std::size_t at = 0; at < ipc::OutputQueue::control_capacity; ++at)
    REQUIRE(output.push(ipc::Kind::heartbeat_ack, at + 1, {}) == ipc::EnqueueStatus::accepted);
  f.open();
  f.play();
  REQUIRE(publisher.pump(0, send) == PublishStatus::blocked);
  REQUIRE(publisher.stats()->pending);
  REQUIRE(sample_attempts == 0);
  REQUIRE(f.sink.reset_stream(SourceAvailability::closed));
  REQUIRE(publisher.pump(1000, send) == PublishStatus::blocked);
  REQUIRE_FALSE(publisher.stats()->pending);
  REQUIRE(sample_attempts == 0);
  for (std::size_t at = 0; at < ipc::OutputQueue::control_capacity; ++at)
    REQUIRE(output.take()->request_id == at + 1);
  REQUIRE(publisher.pump(2000, send) == PublishStatus::sent);
  const auto state = output.take();
  REQUIRE(state->kind == ipc::Kind::audio_state);
  const auto value = ipc::audio::decode_state(state->payload);
  REQUIRE(value.availability == ipc::audio::Availability::closed);
  REQUIRE(value.revision == 1);
  REQUIRE(value.epoch == 2);
  REQUIRE_FALSE(output.take());
}

TEST_CASE("PCM late epoch cannot publish a new status before consumer reset credit") {
  Fixture f;
  f.open();
  f.play(3840);
  REQUIRE(f.publisher.pump(0, f.send) == PublishStatus::sent);
  f.reset_credit = false;
  REQUIRE(f.publisher.pump(40000, f.send) == PublishStatus::blocked);
  REQUIRE(f.publisher.stats()->reset_pending);
  REQUIRE(f.publisher.stats()->pending);
  REQUIRE(f.records.size() == 3);
  REQUIRE(f.sink.stats()->packets.packets == 2);
  const auto queued = f.sink.stats()->queue.queued_frames;
  REQUIRE(f.publisher.pump(41000, f.send) == PublishStatus::blocked);
  REQUIRE(f.sink.stats()->queue.queued_frames == queued);
  REQUIRE(f.sink.stats()->packets.packets == 2);
  f.reset_credit = true;
  REQUIRE(f.publisher.pump(42000, f.send) == PublishStatus::sent);
  f.state(3, ipc::audio::Availability::ready, 2, 2, 42000);
  REQUIRE(ipc::audio::decode_config(f.records[4].payload).epoch == 2);
  REQUIRE(ipc::audio::decode_packet(f.records[5].payload).timestamp_us == 40000);
  REQUIRE(f.records.size() == 6);
}

TEST_CASE("PCM metadata-only states preserve all source reasons and one reserved epoch") {
  Fixture f;
  using A = ipc::audio::Availability;
  const std::array<std::pair<SourceAvailability, A>, 5> states{
      {{SourceAvailability::waiting, A::waiting},
       {SourceAvailability::suspended, A::suspended},
       {SourceAvailability::closed, A::closed},
       {SourceAvailability::failed, A::failed},
       {SourceAvailability::unavailable, A::unavailable}}};
  for (std::size_t at = 0; at < states.size(); ++at) {
    REQUIRE(f.sink.reset_stream(states[at].first));
    REQUIRE(f.publisher.pump(at, f.send) == PublishStatus::sent);
    f.state(at, states[at].second, at + 1, 1, at);
  }
  REQUIRE(f.records.size() == states.size());
  REQUIRE(f.publisher.stats()->captured_packets == 0);
  REQUIRE(f.publisher.stats()->sent_configs == 0);
}

TEST_CASE("PCM status ownership rejects clock reentry and foreign calls before mutation") {
  Fixture f;
  f.open();
  f.play(1920);
  PublishStatus nested = PublishStatus::sent;
  bool reset = true;
  const PcmPublisher::TrySend recursive = [&](auto kind, auto bytes) {
    if (kind == ipc::Kind::audio_state) {
      nested = f.publisher.pump(1000, f.send);
      reset = f.publisher.reset();
    }
    return f.send(kind, bytes);
  };
  REQUIRE(f.publisher.pump(1000, recursive) == PublishStatus::sent);
  REQUIRE(nested == PublishStatus::invalid);
  REQUIRE_FALSE(reset);
  REQUIRE(f.publisher.pump(999, f.send) == PublishStatus::invalid);
  REQUIRE(f.publisher.pump(UINT64_MAX, f.send) == PublishStatus::invalid);
  REQUIRE(f.publisher.pump(1001, {}) == PublishStatus::invalid);
  PublishStatus foreign = PublishStatus::sent;
  bool observed = true;
  std::thread other([&] {
    foreign = f.publisher.pump(1001, f.send);
    observed = f.publisher.stats().has_value();
  });
  other.join();
  REQUIRE(foreign == PublishStatus::invalid);
  REQUIRE_FALSE(observed);
  REQUIRE(f.records.size() == 3);
  REQUIRE(f.sink.stats()->queue.queued_frames == 960);
}

TEST_CASE("PCM status callback failure and exhausted revisions cannot replay or wrap") {
  Fixture f;
  f.open();
  f.play(1920);
  SECTION("status callback exception") {
    const PcmPublisher::TrySend fault = [](auto, auto) -> bool {
      throw std::runtime_error("fixture");
    };
    REQUIRE(f.publisher.pump(0, fault) == PublishStatus::failed);
    REQUIRE(f.publisher.stats()->failed);
    REQUIRE(f.publisher.stats()->reset_pending);
    REQUIRE_FALSE(f.publisher.stats()->pending);
    REQUIRE(f.publisher.pump(1, f.send) == PublishStatus::failed);
    REQUIRE(f.records.empty());
  }
  SECTION("status revision exhausted before capture") {
    PcmPublisher exhausted(f.sink, [] { return true; }, 0, UINT64_MAX);
    REQUIRE(exhausted.pump(0, f.send) == PublishStatus::failed);
    REQUIRE(f.sink.stats()->queue.queued_frames == 1920);
    REQUIRE(f.records.empty());
  }
  SECTION("last revision remains valid but cannot wrap on a later call") {
    PcmPublisher final(f.sink, [] { return true; }, 0, UINT64_MAX - 1);
    REQUIRE(final.pump(0, f.send) == PublishStatus::sent);
    f.state(0, ipc::audio::Availability::ready, UINT64_MAX, 1, 0);
    REQUIRE(final.pump(20000, f.send) == PublishStatus::failed);
    REQUIRE(f.sink.stats()->queue.queued_frames == 960);
    REQUIRE(f.records.size() == 3);
  }
  SECTION("reserved epoch is consumed exactly once at its final legal value") {
    PcmPublisher final(f.sink, [] { return true; }, UINT64_MAX - 1, 0);
    REQUIRE(final.pump(0, f.send) == PublishStatus::sent);
    f.state(0, ipc::audio::Availability::ready, 1, UINT64_MAX, 0);
    REQUIRE(ipc::audio::decode_config(f.records[1].payload).epoch == UINT64_MAX);
    REQUIRE(final.pump(20000, f.send) == PublishStatus::failed);
    REQUIRE(f.sink.stats()->queue.queued_frames == 960);
  }
}
