#include "opus_publisher.hpp"
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <opus/opus.h>
#include <stdexcept>
#include <thread>
#include <vector>

using namespace bridge::audio;
namespace {
namespace ipc = bridge::ipc;
struct Fixture {
  RdpsndSink sink;
  bool discard_credit = true, state_credit = true, config_credit = true, packet_credit = true;
  std::size_t discards = 0;
  OpusPublisher owner{sink, [this] {
                        if (!discard_credit)
                          return false;
                        ++discards;
                        return true;
                      }};
  std::vector<ipc::Packet> records;
  std::vector<std::vector<std::uint8_t>> attempts;
  OpusPublisher::TrySend send = [this](auto kind, auto bytes) {
    if (kind == ipc::Kind::audio_opus) {
      attempts.emplace_back(bytes.begin(), bytes.end());
      if (!packet_credit)
        return false;
    }
    if ((kind == ipc::Kind::audio_state && !state_credit) ||
        (kind == ipc::Kind::audio_config && !config_credit))
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
  void play(std::size_t frames = 960, std::uint8_t value = 7) {
    const std::vector<std::uint8_t> bytes(frames * 4, value);
    REQUIRE(sink.device().Play(&sink.device(), bytes.data(), bytes.size()) > 0);
  }
};
} // namespace

TEST_CASE("Opus publisher preserves source status config clock and underflow accounting with "
          "actual SDK") {
  Fixture f;
  REQUIRE(f.owner.pump(0, f.send) == PublishStatus::sent);
  REQUIRE(f.records.size() == 1);
  REQUIRE(ipc::audio::opus::decode_state(f.records[0].payload).availability ==
          ipc::audio::Availability::waiting);
  REQUIRE_THROWS_AS(ipc::audio::decode_state(f.records[0].payload), ipc::ProtocolError);
  f.open();
  f.play(48);
  REQUIRE(f.owner.pump(1000, f.send) == PublishStatus::sent);
  REQUIRE(f.records.size() == 4);
  REQUIRE(f.records[1].kind == ipc::Kind::audio_state);
  const auto state = ipc::audio::opus::decode_state(f.records[1].payload);
  const auto config = ipc::audio::opus::decode_config(f.records[2].payload);
  const auto packet = ipc::audio::opus::decode_packet(f.records[3].payload);
  REQUIRE(state.availability == ipc::audio::Availability::ready);
  REQUIRE(state.epoch == config.epoch);
  REQUIRE(packet.epoch == config.epoch);
  REQUIRE(packet.timestamp_us == 1000);
  REQUIRE(packet.frames == 48);
  REQUIRE(packet.silence_frames == 912);
  REQUIRE(packet.discontinuity);
  REQUIRE(config.lookahead_frames <= 960);
  REQUIRE(f.records[3].kind == ipc::Kind::audio_opus);
  int error = OPUS_OK;
  const auto decoder = std::unique_ptr<OpusDecoder, decltype(&opus_decoder_destroy)>(
      opus_decoder_create(48000, 2, &error), opus_decoder_destroy);
  REQUIRE(error == OPUS_OK);
  REQUIRE(decoder);
  std::vector<opus_int16> decoded(1920);
  REQUIRE(opus_decode(decoder.get(), packet.encoded.data(),
                      static_cast<opus_int32>(packet.encoded.size()), decoded.data(), 960,
                      0) == 960);
  REQUIRE(f.owner.stats()->encoded_packets == 1);
  REQUIRE(f.owner.stats()->cached_bytes == 0);
}

TEST_CASE("Opus publisher retries identical compressed bytes without advancing prediction") {
  Fixture f;
  f.open();
  f.play(1920);
  f.packet_credit = false;
  REQUIRE(f.owner.pump(0, f.send) == PublishStatus::blocked);
  REQUIRE(f.owner.stats()->encoded_packets == 1);
  REQUIRE(f.owner.stats()->cached_bytes >= ipc::audio::opus::min_packet_bytes);
  REQUIRE(f.owner.stats()->cached_bytes <= ipc::audio::opus::max_packet_bytes);
  REQUIRE(f.owner.pump(1000, f.send) == PublishStatus::blocked);
  REQUIRE(f.attempts.size() == 2);
  REQUIRE(f.attempts[0] == f.attempts[1]);
  REQUIRE(f.owner.stats()->encoded_packets == 1);
  f.packet_credit = true;
  REQUIRE(f.owner.pump(19999, f.send) == PublishStatus::sent);
  REQUIRE(f.attempts[0] == f.attempts[2]);
  REQUIRE(f.owner.stats()->encoded_packets == 1);
  REQUIRE(f.owner.stats()->cached_bytes == 0);
  REQUIRE(f.owner.pump(20000, f.send) == PublishStatus::sent);
  const auto packet = ipc::audio::opus::decode_packet(f.records.back().payload);
  REQUIRE_FALSE(packet.discontinuity);
  REQUIRE(packet.timestamp_us == 20000);
  REQUIRE(f.owner.stats()->encoded_packets == 2);
}

TEST_CASE("Opus publisher replaces a blocked record with fresh discontinuous capture") {
  Fixture f;
  f.open();
  f.play(1920);
  f.packet_credit = false;
  REQUIRE(f.owner.pump(0, f.send) == PublishStatus::blocked);
  f.packet_credit = true;
  REQUIRE(f.owner.pump(20000, f.send) == PublishStatus::sent);
  const auto packet = ipc::audio::opus::decode_packet(f.records.back().payload);
  REQUIRE(packet.timestamp_us == 20000);
  REQUIRE(packet.discontinuity);
  REQUIRE(f.owner.stats()->source.replaced_packets == 1);
  REQUIRE(f.owner.stats()->encoded_packets == 2);
  REQUIRE(f.owner.stats()->source.sent_configs == 1);
  REQUIRE(f.owner.stats()->cached_bytes == 0);
}

TEST_CASE(
    "Opus publisher preserves reset barrier and clears stale encoded retries before fresh state") {
  Fixture f;
  f.open();
  f.play();
  f.packet_credit = false;
  REQUIRE(f.owner.pump(0, f.send) == PublishStatus::blocked);
  const auto previous_count = f.records.size();
  f.discard_credit = false;
  REQUIRE(f.sink.reset_stream());
  f.play();
  REQUIRE(f.owner.pump(1000, f.send) == PublishStatus::blocked);
  REQUIRE(f.records.size() == previous_count);
  REQUIRE(f.attempts.size() == 1);
  REQUIRE(f.owner.stats()->source.reset_pending);
  f.discard_credit = true;
  f.packet_credit = true;
  REQUIRE(f.owner.pump(20000, f.send) == PublishStatus::sent);
  REQUIRE(f.records.size() == previous_count + 3);
  REQUIRE(ipc::audio::opus::decode_state(f.records[previous_count].payload).epoch == 2);
  REQUIRE(ipc::audio::opus::decode_config(f.records[previous_count + 1].payload).epoch == 2);
  REQUIRE(ipc::audio::opus::decode_packet(f.records.back().payload).epoch == 2);
  REQUIRE(f.owner.stats()->source.reset_discarded_packets == 1);
  REQUIRE(f.owner.stats()->encoded_packets == 2);
  REQUIRE(f.owner.reset());
  REQUIRE(f.owner.stats()->cached_bytes == 0);
  f.sink.device().Close(&f.sink.device());
  REQUIRE(f.owner.pump(21000, f.send) == PublishStatus::sent);
  REQUIRE(f.records.back().kind == ipc::Kind::audio_state);
  REQUIRE(ipc::audio::opus::decode_state(f.records.back().payload).availability ==
          ipc::audio::Availability::closed);
}

TEST_CASE(
    "Opus publisher encodes only after state config credit and checks thread reentrancy clocks") {
  Fixture f;
  f.open();
  f.play(1920);
  f.state_credit = false;
  REQUIRE(f.owner.pump(0, f.send) == PublishStatus::blocked);
  REQUIRE(f.owner.stats()->encoded_packets == 0);
  f.state_credit = true;
  f.config_credit = false;
  REQUIRE(f.owner.pump(1000, f.send) == PublishStatus::blocked);
  REQUIRE(f.owner.stats()->encoded_packets == 0);
  f.config_credit = true;
  PublishStatus recursive = PublishStatus::sent;
  bool reset = true;
  const OpusPublisher::TrySend callback = [&](auto kind, auto bytes) {
    recursive = f.owner.pump(1000, f.send);
    reset = f.owner.reset();
    return f.send(kind, bytes);
  };
  REQUIRE(f.owner.pump(1000, callback) == PublishStatus::sent);
  REQUIRE(recursive == PublishStatus::invalid);
  REQUIRE_FALSE(reset);
  REQUIRE(f.owner.pump(999, f.send) == PublishStatus::invalid);
  REQUIRE(f.owner.stats()->encoded_packets == 1);
  PublishStatus foreign = PublishStatus::sent;
  std::optional<OpusPublisherStats> foreign_stats;
  std::thread thread([&] {
    foreign = f.owner.pump(20000, f.send);
    foreign_stats = f.owner.stats();
  });
  thread.join();
  REQUIRE(foreign == PublishStatus::invalid);
  REQUIRE_FALSE(foreign_stats);
  REQUIRE(f.owner.stats()->encoded_packets == 1);
}

TEST_CASE("Opus publisher callback failure clears cache and cannot resume or wrap epoch") {
  Fixture f;
  f.open();
  f.play();
  f.packet_credit = false;
  REQUIRE(f.owner.pump(0, f.send) == PublishStatus::blocked);
  const OpusPublisher::TrySend failure = [](auto, auto) -> bool {
    throw std::runtime_error("fixture");
  };
  REQUIRE(f.owner.pump(1000, failure) == PublishStatus::failed);
  REQUIRE(f.owner.stats()->cached_bytes == 0);
  REQUIRE(f.owner.stats()->source.failed);
  REQUIRE(f.owner.pump(20000, f.send) == PublishStatus::failed);
  REQUIRE_FALSE(f.owner.reset());
  RdpsndSink sink;
  OpusPublisher exhausted{sink, [] { return true; }, (std::numeric_limits<std::uint64_t>::max)()};
  REQUIRE(exhausted.pump(0, f.send) == PublishStatus::failed);
  REQUIRE(exhausted.stats()->encoded_packets == 0);
  REQUIRE_THROWS_AS((OpusPublisher{sink, {}}), std::invalid_argument);
}
