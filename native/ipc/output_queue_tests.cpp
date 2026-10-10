#include "audio.hpp"
#include "cursor.hpp"
#include "output_queue.hpp"
#include <catch2/catch_test_macros.hpp>
#include <memory>
using namespace bridge::ipc;
namespace {
EnqueueStatus push(OutputQueue &queue, const Packet &packet) {
  return queue.push(packet.kind, packet.request_id, packet.payload);
}
Packet config(std::uint64_t epoch) {
  const auto bytes = audio::encode_config({epoch});
  return {Kind::audio_config, 0, {bytes.begin(), bytes.end()}};
}
Packet pcm(std::uint64_t epoch, std::uint64_t pts, bool discontinuity = false) {
  std::array<std::uint8_t, audio::pcm_bytes> samples{};
  samples[0] = static_cast<std::uint8_t>(pts / audio::interval_us);
  const auto bytes = audio::encode_packet({epoch, pts, 960, 0, discontinuity, samples});
  return {Kind::audio_pcm, 0, {bytes.begin(), bytes.end()}};
}
} // namespace
TEST_CASE("Output priority preserves control FIFO, audio configuration and correlated video") {
  OutputQueue queue;
  REQUIRE(push(queue, {Kind::frame, 100, std::vector<std::uint8_t>(24)}) ==
          EnqueueStatus::accepted);
  REQUIRE(push(queue, {Kind::frame_avc, 101, std::vector<std::uint8_t>(28)}) ==
          EnqueueStatus::full);
  REQUIRE(push(queue, config(1)) == EnqueueStatus::accepted);
  REQUIRE(push(queue, pcm(1, 100, true)) == EnqueueStatus::accepted);
  REQUIRE(push(queue, {Kind::heartbeat_ack, 1, {}}) == EnqueueStatus::accepted);
  REQUIRE(push(queue, {Kind::input_ack, 2, {}}) == EnqueueStatus::accepted);
  REQUIRE(queue.take()->request_id == 1);
  REQUIRE(queue.take()->request_id == 2);
  REQUIRE(queue.take()->kind == Kind::audio_config);
  REQUIRE(queue.take()->kind == Kind::audio_pcm);
  const auto video = queue.take();
  REQUIRE(video->kind == Kind::frame);
  REQUIRE(video->request_id == 100);
  REQUIRE_FALSE(queue.take());
  REQUIRE(queue.stats().records == 0);
  REQUIRE(queue.stats().bytes == 0);
}
TEST_CASE("Output control capacity rejects without overwriting and wraps FIFO storage") {
  OutputQueue queue;
  for (unsigned round = 0; round < 3; ++round) {
    for (std::size_t i = 0; i < OutputQueue::control_capacity; ++i)
      REQUIRE(queue.push(Kind::hello_ack, i, std::array<std::uint8_t, 4096>{}) ==
              EnqueueStatus::accepted);
    const auto before = queue.stats();
    REQUIRE(queue.push(Kind::shutdown_ack, 999, {}) == EnqueueStatus::full);
    REQUIRE(queue.stats().records == before.records);
    REQUIRE(queue.stats().bytes == before.bytes);
    REQUIRE(before.bytes == OutputQueue::control_capacity * (4096 + header_bytes));
    for (std::size_t i = 0; i < OutputQueue::control_capacity; ++i)
      REQUIRE(queue.take()->request_id == i);
  }
}
TEST_CASE("Output latest audio replaces with discontinuity and removes stale epochs atomically") {
  OutputQueue queue;
  REQUIRE(push(queue, pcm(1, 0, true)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, config(1)) == EnqueueStatus::accepted);
  REQUIRE(push(queue, pcm(1, 0)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, pcm(1, 0, true)) == EnqueueStatus::accepted);
  for (std::uint64_t i = 1; i <= 100; ++i)
    REQUIRE(push(queue, pcm(1, i * audio::interval_us)) == EnqueueStatus::accepted);
  REQUIRE(queue.stats().replaced_audio == 100);
  REQUIRE(queue.stats().records == 2);
  REQUIRE(queue.stats().bytes == audio::config_bytes + audio::packet_bytes + 2 * header_bytes);
  REQUIRE(queue.take()->kind == Kind::audio_config);
  auto latest = queue.take();
  const auto decoded = audio::decode_packet(latest->payload);
  REQUIRE(decoded.timestamp_us == 2000000);
  REQUIRE(decoded.discontinuity);
  REQUIRE(decoded.pcm[0] == 100);
  REQUIRE(push(queue, pcm(1, 2020000)) == EnqueueStatus::accepted);
  REQUIRE(push(queue, config(2)) == EnqueueStatus::accepted);
  REQUIRE(queue.stats().discarded_audio == 1);
  REQUIRE(queue.stats().records == 1);
  REQUIRE(push(queue, pcm(1, 2040000, true)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, config(1)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, pcm(2, 2000000, true)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, pcm(2, 2040000, true)) == EnqueueStatus::accepted);
  REQUIRE(audio::decode_config(queue.take()->payload).epoch == 2);
  REQUIRE(audio::decode_packet(queue.take()->payload).epoch == 2);
  REQUIRE(push(queue, pcm(2, 2060001)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, pcm(2, 2060000)) == EnqueueStatus::accepted);
  queue.discard_audio();
  REQUIRE(queue.stats().records == 0);
  REQUIRE(queue.stats().discarded_audio == 2);
  REQUIRE(push(queue, pcm(2, 2080000)) == EnqueueStatus::invalid);
  REQUIRE(push(queue, config(3)) == EnqueueStatus::accepted);
  REQUIRE(push(queue, pcm(3, 2080000, true)) == EnqueueStatus::accepted);
}
TEST_CASE(
    "Output cursor coalescing retains shape before latest metadata and default clears shape") {
  OutputQueue queue;
  Packet last{Kind::cursor_update, 0, {}};
  bridge::cursor::State state([&](const Packet &packet) {
    last = packet;
    REQUIRE(push(queue, packet) == EnqueueStatus::accepted);
  });
  state.initialize();
  state.shape({7, 2, 1, 1, 0, {255, 0, 0, 255, 0, 0, 255, 0}});
  for (std::uint32_t i = 1; i <= 100; ++i)
    state.position(i, i);
  REQUIRE(queue.stats().records == 2);
  REQUIRE(queue.stats().bytes == 48 + 40 + 2 * header_bytes);
  REQUIRE(read_be(std::span(queue.take()->payload).subspan(2, 2)) == 9);
  auto metadata = queue.take();
  REQUIRE(read_be(std::span(metadata->payload).subspan(28, 2)) == 100);
  REQUIRE(push(queue, last) == EnqueueStatus::invalid);
  state.shape({8, 1, 1, 0, 0, {1, 2, 3, 4}});
  state.position(101, 101);
  state.default_shape();
  REQUIRE(queue.stats().records == 1);
  auto default_packet = queue.take();
  REQUIRE(read_be(std::span(default_packet->payload).subspan(12, 8)) == 0);
  auto missing_shape = last;
  missing_shape.payload[19] = 9;
  missing_shape.payload[35] = 1;
  missing_shape.payload[33] = 1;
  missing_shape.payload[2] = 0;
  missing_shape.payload[3] = 5;
  missing_shape.payload[11] += 1;
  REQUIRE(push(queue, missing_shape) == EnqueueStatus::invalid);
}
TEST_CASE("Output refusal validates limits and direction before ownership; exact maximum remains "
          "bounded") {
  auto queue = std::make_unique<OutputQueue>();
  REQUIRE(queue->push(Kind::secret, 1, std::array<std::uint8_t, 4096>{}) == EnqueueStatus::invalid);
  REQUIRE(queue->push(Kind::configure, 1, {}) == EnqueueStatus::invalid);
  REQUIRE(queue->push(Kind::heartbeat, 1, {}) == EnqueueStatus::invalid);
  REQUIRE(queue->push(static_cast<Kind>(999), 0, {}) == EnqueueStatus::invalid);
  REQUIRE(queue->push(Kind::heartbeat_ack, 1, std::array<std::uint8_t, 1>{}) ==
          EnqueueStatus::invalid);
  REQUIRE(queue->push(Kind::cursor_update, 0, std::array<std::uint8_t, 40>{}) ==
          EnqueueStatus::invalid);
  auto bad = config(1);
  bad.payload[10] = 1;
  REQUIRE(push(*queue, bad) == EnqueueStatus::invalid);
  REQUIRE(queue->stats().records == 0);
  auto oversized =
      std::vector<std::uint8_t>(max_jpeg_bytes + avc_metadata_bytes + max_avc_config_bytes + 1);
  REQUIRE(queue->push(Kind::frame_avc, 1, oversized) == EnqueueStatus::invalid);
  oversized.pop_back();
  REQUIRE(queue->push(Kind::frame_avc, 1, oversized) == EnqueueStatus::accepted);
  oversized[0] = 123;
  bridge::cursor::State cursor(
      [&](const Packet &packet) { REQUIRE(push(*queue, packet) == EnqueueStatus::accepted); });
  cursor.shape({1, 384, 384, 0, 0, std::vector<std::uint8_t>(bridge::cursor::max_rgba_bytes)});
  cursor.position(1, 1);
  REQUIRE(push(*queue, config(1)) == EnqueueStatus::accepted);
  REQUIRE(push(*queue, pcm(1, 0, true)) == EnqueueStatus::accepted);
  for (std::size_t i = 0; i < OutputQueue::control_capacity; ++i)
    REQUIRE(queue->push(Kind::hello_ack, i, std::array<std::uint8_t, 4096>{}) ==
            EnqueueStatus::accepted);
  REQUIRE(queue->stats().records == OutputQueue::max_records);
  REQUIRE(queue->stats().bytes == 9248283);
  REQUIRE(queue->stats().high_water_bytes == 9248283);
  std::optional<Packet> final;
  while (auto record = queue->take())
    final = std::move(record);
  REQUIRE(final->kind == Kind::frame_avc);
  REQUIRE(final->payload[0] == 0); // Producer mutation did not change owned output.
  REQUIRE(queue->stats().bytes == 0);
  REQUIRE(queue->stats().high_water_bytes == 9248283);
}
