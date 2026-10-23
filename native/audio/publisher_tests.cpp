#include "output_queue.hpp"
#include "publisher.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <stdexcept>
#include <vector>

using namespace bridge::audio;
namespace {
struct Fixture {
  RdpsndSink sink;
  // Recorder consumes immediately; it owns no unsent consumer queue.
  PcmPublisher publisher{sink, [] { return true; }};
  std::vector<bridge::ipc::Packet> records;
  bool config_credit = true, packet_credit = true;
  PcmPublisher::TrySend send = [this](auto kind, auto bytes) {
    if ((kind == bridge::ipc::Kind::audio_config && !config_credit) ||
        (kind == bridge::ipc::Kind::audio_pcm && !packet_credit))
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
  void play(std::size_t frames = 960, std::uint8_t value = 1) {
    const std::vector<std::uint8_t> bytes(frames * 4, value);
    REQUIRE(sink.device().Play(&sink.device(), bytes.data(), bytes.size()) > 0);
  }
};
} // namespace
TEST_CASE("PCM publisher starts only with samples and sends config before fixed packet") {
  Fixture f;
  REQUIRE(f.publisher.pump(0, f.send) == PublishStatus::idle);
  f.open();
  REQUIRE(f.publisher.pump(0, f.send) == PublishStatus::idle);
  REQUIRE(f.records.empty());
  f.play(1920, 77);
  REQUIRE(f.publisher.pump(1000, f.send) == PublishStatus::sent);
  REQUIRE(f.records.size() == 2);
  REQUIRE(f.records[0].kind == bridge::ipc::Kind::audio_config);
  REQUIRE(bridge::ipc::audio::decode_config(f.records[0].payload).epoch == 1);
  const auto packet = bridge::ipc::audio::decode_packet(f.records[1].payload);
  REQUIRE(packet.epoch == 1);
  REQUIRE(packet.timestamp_us == 1000);
  REQUIRE(packet.frames == 960);
  REQUIRE(packet.discontinuity);
  REQUIRE(std::all_of(packet.pcm.begin(), packet.pcm.end(), [](auto byte) { return byte == 77; }));
  REQUIRE(f.publisher.pump(20999, f.send) == PublishStatus::idle);
  REQUIRE(f.records.size() == 2);
  REQUIRE(f.publisher.pump(21000, f.send) == PublishStatus::sent);
  REQUIRE(f.records.size() == 3);
  REQUIRE_FALSE(bridge::ipc::audio::decode_packet(f.records[2].payload).discontinuity);
  REQUIRE(f.publisher.stats()->sent_configs == 1);
  REQUIRE(f.publisher.stats()->sent_packets == 2);
}
TEST_CASE("PCM source trimming before packetization retains epoch and reports raw loss") {
  Fixture f;
  f.open();
  f.play();
  REQUIRE(f.publisher.pump(0, f.send) == PublishStatus::sent);
  const auto first = bridge::ipc::audio::decode_packet(f.records.back().payload);
  f.play(10000, 2);
  REQUIRE(f.sink.stats()->queue.playback_skipped_frames == 4240);
  REQUIRE(f.publisher.pump(20000, f.send) == PublishStatus::sent);
  const auto next = bridge::ipc::audio::decode_packet(f.records.back().payload);
  REQUIRE(next.epoch == first.epoch);
  REQUIRE(next.timestamp_us == first.timestamp_us + 20000);
  REQUIRE_FALSE(next.discontinuity);
  REQUIRE(f.publisher.stats()->sent_configs == 1);
  REQUIRE(std::all_of(next.pcm.begin(), next.pcm.end(), [](auto byte) { return byte == 2; }));
  REQUIRE(f.publisher.pump(80000, f.send) == PublishStatus::sent);
  REQUIRE(bridge::ipc::audio::decode_packet(f.records.back().payload).epoch > next.epoch);
  REQUIRE(f.publisher.stats()->sent_configs == 2);
}

TEST_CASE("PCM publisher replaces blocked data and never retries an accepted config") {
  Fixture f;
  f.open();
  f.play(960, 11);
  f.play(960, 22);
  f.config_credit = f.packet_credit = false;
  REQUIRE(f.publisher.pump(0, f.send) == PublishStatus::blocked);
  REQUIRE(f.records.empty());
  f.config_credit = true;
  REQUIRE(f.publisher.pump(1000, f.send) == PublishStatus::blocked);
  REQUIRE(f.records.size() == 1);
  f.packet_credit = true;
  REQUIRE(f.publisher.pump(20000, f.send) == PublishStatus::sent);
  REQUIRE(f.records.size() == 2);
  const auto packet = bridge::ipc::audio::decode_packet(f.records[1].payload);
  REQUIRE(packet.timestamp_us == 20000);
  REQUIRE(packet.epoch == 1);
  REQUIRE(packet.discontinuity);
  REQUIRE(std::all_of(packet.pcm.begin(), packet.pcm.end(), [](auto byte) { return byte == 22; }));
  REQUIRE(f.publisher.stats()->captured_packets == 2);
  REQUIRE(f.publisher.stats()->replaced_packets == 1);
  REQUIRE(f.publisher.stats()->blocked_calls == 2);
  REQUIRE_FALSE(f.publisher.stats()->pending);
}
TEST_CASE("PCM source reset discards prepared IPC even before fresh samples or device Close") {
  Fixture f;
  f.open();
  f.play();
  f.packet_credit = false;
  REQUIRE(f.publisher.pump(0, f.send) == PublishStatus::blocked);
  REQUIRE(f.publisher.stats()->pending);
  const auto revision = f.sink.stream_revision();
  REQUIRE(f.sink.reset_stream()); // Guarded RDPSND Close/loss retains Open.
  REQUIRE(f.sink.ready());
  REQUIRE(f.sink.stream_revision() > revision);
  f.packet_credit = true;
  REQUIRE(f.publisher.pump(1000, f.send) == PublishStatus::idle);
  REQUIRE(f.records.size() == 1);
  REQUIRE(f.publisher.stats()->reset_discarded_packets == 1);
  f.play(960, 33);
  REQUIRE(f.publisher.pump(20000, f.send) == PublishStatus::sent);
  REQUIRE(f.records.size() == 3);
  REQUIRE(bridge::ipc::audio::decode_config(f.records[1].payload).epoch == 2);
  REQUIRE(bridge::ipc::audio::decode_packet(f.records[2].payload).discontinuity);
  REQUIRE(f.publisher.reset());
  REQUIRE(f.publisher.pump(30000, f.send) == PublishStatus::idle);
  f.sink.device().Close(&f.sink.device());
  REQUIRE_FALSE(f.sink.ready());
  REQUIRE(f.publisher.pump(40000, f.send) == PublishStatus::idle);
}
TEST_CASE("PCM publisher rejects foreign reentrant and invalid clocks without consuming source") {
  Fixture f;
  f.open();
  f.play(1920);
  PublishStatus nested = PublishStatus::sent;
  bool reset = true;
  const PcmPublisher::TrySend recursive = [&](auto kind, auto bytes) {
    nested = f.publisher.pump(100001, f.send);
    reset = f.publisher.reset();
    return f.send(kind, bytes);
  };
  REQUIRE(f.publisher.pump(100000, recursive) == PublishStatus::sent);
  REQUIRE(nested == PublishStatus::invalid);
  REQUIRE_FALSE(reset);
  REQUIRE(f.publisher.pump(99999, f.send) == PublishStatus::invalid);
  REQUIRE(f.publisher.pump(UINT64_MAX, f.send) == PublishStatus::invalid);
  REQUIRE(f.publisher.pump(100001, {}) == PublishStatus::invalid);
  PublishStatus foreign = PublishStatus::sent;
  bool observed = true, foreign_reset = true;
  std::thread thread([&] {
    foreign = f.publisher.pump(100001, f.send);
    observed = f.publisher.stats().has_value();
    foreign_reset = f.publisher.reset();
  });
  thread.join();
  REQUIRE(foreign == PublishStatus::invalid);
  REQUIRE_FALSE(observed);
  REQUIRE_FALSE(foreign_reset);
  REQUIRE(f.sink.stats()->queue.queued_frames == 960);
  REQUIRE(f.publisher.stats()->invalid_clocks == 2);
  REQUIRE(f.publisher.pump(120000, f.send) == PublishStatus::sent);
}
TEST_CASE("PCM publisher callback failures and epoch exhaustion retire prepared data") {
  Fixture f;
  f.open();
  f.play();
  const PcmPublisher::TrySend fault = [](auto, auto) -> bool {
    throw std::runtime_error("fixture");
  };
  REQUIRE(f.publisher.pump(0, fault) == PublishStatus::failed);
  REQUIRE(f.publisher.stats()->failed);
  REQUIRE_FALSE(f.publisher.stats()->pending);
  REQUIRE(f.publisher.pump(20000, f.send) == PublishStatus::failed);
  REQUIRE_FALSE(f.publisher.reset());
  Fixture other;
  other.open();
  other.play();
  PcmPublisher exhausted(other.sink, [] { return true; }, UINT64_MAX);
  REQUIRE(exhausted.pump(0, other.send) == PublishStatus::failed);
  REQUIRE(other.sink.stats()->queue.queued_frames == 960);
  REQUIRE(other.records.empty());
}
TEST_CASE("PCM source revision requires consumer discard credit before reading fresh samples") {
  Fixture source;
  bridge::ipc::OutputQueue output;
  bool credit = true;
  PcmPublisher publisher(source.sink, [&] {
    if (!credit)
      return false;
    output.discard_audio();
    return true;
  });
  const PcmPublisher::TrySend send = [&](auto kind, auto bytes) {
    return output.push(kind, 0, bytes) == bridge::ipc::EnqueueStatus::accepted;
  };
  source.open();
  source.play();
  REQUIRE(publisher.pump(0, send) == PublishStatus::sent);
  REQUIRE(output.stats().records == 2);
  REQUIRE(source.sink.reset_stream());
  source.play(960, 33);
  credit = false;
  REQUIRE(publisher.pump(20000, send) == PublishStatus::blocked);
  REQUIRE(publisher.stats()->reset_pending);
  REQUIRE(output.stats().records == 2);
  REQUIRE(source.sink.stats()->queue.queued_frames == 960);
  REQUIRE(source.sink.stats()->packets.packets == 1);
  credit = true;
  REQUIRE(publisher.pump(21000, send) == PublishStatus::sent);
  REQUIRE_FALSE(publisher.stats()->reset_pending);
  REQUIRE(output.stats().discarded_audio == 1);
  REQUIRE(output.stats().records == 2);
  REQUIRE(bridge::ipc::audio::decode_config(output.take()->payload).epoch == 2);
  auto packet = output.take();
  REQUIRE(bridge::ipc::audio::decode_packet(packet->payload).pcm[0] == 33);
  REQUIRE(publisher.stats()->consumer_resets == 2);
  REQUIRE(publisher.reset());
  REQUIRE(publisher.stats()->reset_pending);
  REQUIRE(publisher.pump(22000, send) == PublishStatus::idle);
  REQUIRE_FALSE(publisher.stats()->reset_pending);
  REQUIRE(publisher.stats()->consumer_resets == 3);
  REQUIRE(publisher.pump(23000, send) == PublishStatus::idle);
  REQUIRE(publisher.stats()->consumer_resets == 3); // No repeated reset on an idle source.
}
TEST_CASE("PCM consumer discard refuses empty binding and catches callback faults and reentry") {
  Fixture source;
  REQUIRE_THROWS_AS(PcmPublisher(source.sink, {}), std::invalid_argument);
  source.open();
  source.play();
  PcmPublisher fault(source.sink, []() -> bool { throw std::runtime_error("fixture"); });
  REQUIRE(fault.pump(0, source.send) == PublishStatus::failed);
  REQUIRE(fault.stats()->failed);
  REQUIRE(fault.stats()->reset_pending);
  REQUIRE(source.sink.stats()->queue.queued_frames == 960);
  PcmPublisher *owner = nullptr;
  PublishStatus nested = PublishStatus::sent;
  bool reset = true;
  PcmPublisher recursive(source.sink, [&] {
    nested = owner->pump(0, source.send);
    reset = owner->reset();
    return true;
  });
  owner = &recursive;
  REQUIRE(recursive.pump(0, source.send) == PublishStatus::sent);
  REQUIRE(nested == PublishStatus::invalid);
  REQUIRE_FALSE(reset);
  REQUIRE(recursive.stats()->consumer_resets == 1);
}
