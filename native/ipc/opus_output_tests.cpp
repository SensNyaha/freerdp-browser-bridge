#include "audio.hpp"
#include "opus_audio.hpp"
#include "output_dispatcher.hpp"
#include "output_queue.hpp"
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <memory>

using namespace bridge::ipc;
namespace {
Packet config(std::uint64_t epoch = 1) {
  const auto bytes = audio::opus::encode_config({epoch, 312});
  return {Kind::audio_config, 0, {bytes.begin(), bytes.end()}};
}
Packet packet(std::uint64_t pts = 0, bool discontinuity = true, std::uint64_t epoch = 1) {
  constexpr std::array<std::uint8_t, 3> encoded{0xfc, 0xff, 0xfe};
  const auto bytes = audio::opus::encode_packet({epoch, pts, 960, 0, discontinuity, encoded});
  return {Kind::audio_opus, 0, {bytes.bytes().begin(), bytes.bytes().end()}};
}
EnqueueStatus push(OutputQueue &queue, const Packet &record) {
  return queue.push(record.kind, record.request_id, record.payload);
}
} // namespace

TEST_CASE("Opus output mode refuses mixed profiles and preserves control audio video priority") {
  auto pcm_owner = std::make_unique<OutputQueue>();
  auto opus_owner = std::make_unique<OutputQueue>(OutputAudioCodec::opus);
  auto &pcm = *pcm_owner;
  auto &opus = *opus_owner;
  const auto state = audio::opus::encode_state({true, audio::Availability::ready, 1, 1, 0});
  REQUIRE(pcm.push(Kind::audio_state, 0, state) == EnqueueStatus::invalid);
  REQUIRE(push(pcm, config()) == EnqueueStatus::invalid);
  REQUIRE(push(pcm, packet()) == EnqueueStatus::invalid);
  REQUIRE(pcm.stats().records == 0);
  REQUIRE(opus.push(Kind::audio_state, 0, state) == EnqueueStatus::accepted);
  const auto pcm_config = audio::encode_config({1});
  REQUIRE(opus.push(Kind::audio_config, 0, pcm_config) == EnqueueStatus::invalid);
  std::array<std::uint8_t, audio::pcm_bytes> silence{};
  const auto pcm_packet = audio::encode_packet({1, 0, 960, 0, true, silence});
  REQUIRE(opus.push(Kind::audio_pcm, 0, pcm_packet) == EnqueueStatus::invalid);
  REQUIRE(opus.push(Kind::frame, 3, std::array<std::uint8_t, 24>{}) == EnqueueStatus::accepted);
  REQUIRE(push(opus, config()) == EnqueueStatus::accepted);
  REQUIRE(push(opus, packet()) == EnqueueStatus::accepted);
  REQUIRE(opus.push(Kind::heartbeat_ack, 1, {}) == EnqueueStatus::accepted);
  REQUIRE(opus.take()->kind == Kind::audio_state);
  REQUIRE(opus.take()->request_id == 1);
  REQUIRE(opus.take()->kind == Kind::audio_config);
  REQUIRE(opus.take()->kind == Kind::audio_opus);
  REQUIRE(opus.take()->kind == Kind::frame);
  REQUIRE(opus.stats().records == 0);
  REQUIRE_THROWS_AS(OutputQueue(static_cast<OutputAudioCodec>(2)), ProtocolError);
}

TEST_CASE(
    "Opus output backpressure preserves copied bytes and admission clock until credit returns") {
  OutputQueue queue{OutputAudioCodec::opus};
  auto first = packet();
  REQUIRE(push(queue, config()) == EnqueueStatus::accepted);
  REQUIRE(push(queue, first) == EnqueueStatus::accepted);
  const auto before = queue.stats();
  REQUIRE(before.bytes == 2 * header_bytes + 20 + 27);
  first.payload[24] = 0;
  for (std::uint64_t i = 1; i <= 100; ++i)
    REQUIRE(push(queue, packet(20000, false)) == EnqueueStatus::full);
  REQUIRE(queue.stats().bytes == before.bytes);
  REQUIRE(queue.stats().records == before.records);
  REQUIRE(queue.stats().replaced_audio == 0);
  REQUIRE(queue.take()->kind == Kind::audio_config);
  const auto owned = queue.take();
  REQUIRE(owned->payload[24] == 0xfc);
  REQUIRE(audio::opus::decode_packet(owned->payload).timestamp_us == 0);
  REQUIRE(push(queue, packet(20000, false)) == EnqueueStatus::accepted);
  REQUIRE_FALSE(audio::opus::decode_packet(queue.take()->payload).discontinuity);
  REQUIRE(push(queue, packet(40001, false)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, packet(60000, true)) == EnqueueStatus::accepted);
  REQUIRE(push(queue, config(2)) == EnqueueStatus::accepted);
  REQUIRE(queue.stats().discarded_audio == 1);
  REQUIRE(push(queue, packet(80000, false, 2)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, packet(80000, true, 1)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, packet(80000, true, 2)) == EnqueueStatus::accepted);
  queue.discard_audio();
  REQUIRE(queue.stats().discarded_audio == 2);
  REQUIRE(queue.stats().records == 0);
  REQUIRE(push(queue, packet(100000, false, 2)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, config(2)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, config(3)) == EnqueueStatus::accepted);
  REQUIRE(push(queue, packet(100000, true, 3)) == EnqueueStatus::accepted);
}

TEST_CASE("Opus output validates packet bounds TOC and correlation before owned allocation") {
  OutputQueue queue{OutputAudioCodec::opus};
  REQUIRE(push(queue, config()) == EnqueueStatus::accepted);
  auto invalid = packet();
  for (std::size_t length = 0; length < audio::opus::min_packet_bytes; ++length) {
    invalid.payload.resize(length);
    REQUIRE(push(queue, invalid) == EnqueueStatus::invalid);
  }
  invalid = packet();
  invalid.payload.resize(audio::opus::max_packet_bytes + 1);
  REQUIRE(push(queue, invalid) == EnqueueStatus::invalid);
  invalid = packet();
  invalid.payload[24] = 0xf8;
  REQUIRE(push(queue, invalid) == EnqueueStatus::invalid);
  invalid = packet();
  invalid.request_id = 1;
  REQUIRE(push(queue, invalid) == EnqueueStatus::invalid);
  invalid = packet();
  invalid.payload[6] = 1;
  REQUIRE(push(queue, invalid) == EnqueueStatus::invalid);
  REQUIRE(push(queue, packet(0, false)) == EnqueueStatus::invalid);
  REQUIRE(queue.stats().records == 1);
  auto maximum = packet((std::numeric_limits<std::uint64_t>::max)() - 20000);
  maximum.payload.resize(audio::opus::max_packet_bytes, 0);
  REQUIRE(push(queue, maximum) == EnqueueStatus::accepted);
  REQUIRE(queue.stats().bytes == 2 * header_bytes + 20 + audio::opus::max_packet_bytes);
  queue.discard_all();
  REQUIRE(queue.stats().bytes == 0);
}

TEST_CASE("Opus dispatcher mode enforces bounded sample credit through actual record writes") {
  OutputDispatcher defaults, dispatcher{OutputAudioCodec::opus};
  const auto cfg = config(), first = packet(), second = packet(20000, false);
  REQUIRE(defaults.try_send(cfg.kind, 0, cfg.payload) == DispatchAdmission::invalid);
  REQUIRE(dispatcher.try_send(cfg.kind, 0, cfg.payload) == DispatchAdmission::accepted);
  REQUIRE(dispatcher.try_send(first.kind, 0, first.payload) == DispatchAdmission::accepted);
  REQUIRE(dispatcher.try_send(second.kind, 0, second.payload) == DispatchAdmission::full);
  std::size_t writes = 0;
  const OutputDispatcher::Write write = [&](auto header, auto body) {
    const auto parsed = decode_header(header);
    REQUIRE(parsed.request_id == 0);
    REQUIRE(parsed.length == body.size());
    if (writes++ == 0) {
      REQUIRE(parsed.kind == Kind::audio_config);
      REQUIRE(audio::opus::decode_config(body).epoch == 1);
    } else {
      REQUIRE(parsed.kind == Kind::audio_opus);
      REQUIRE(audio::opus::decode_packet(body).timestamp_us == 0);
    }
    return true;
  };
  REQUIRE(dispatcher.write_next(write) == DispatchResult::sent);
  REQUIRE(dispatcher.write_next(write) == DispatchResult::sent);
  REQUIRE(dispatcher.try_send(second.kind, 0, second.payload) == DispatchAdmission::accepted);
  REQUIRE(dispatcher.try_discard_audio());
  REQUIRE(dispatcher.try_stats()->queued.records == 0);
  REQUIRE(dispatcher.try_stats()->queued.discarded_audio == 1);
  dispatcher.finish();
  REQUIRE(dispatcher.write_next(write) == DispatchResult::closed);
}
