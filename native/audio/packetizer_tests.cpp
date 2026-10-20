#include "packetizer.hpp"
#include "publication_wait.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <vector>

using namespace bridge::audio;
namespace {
std::vector<std::uint8_t> samples(std::size_t frames, std::uint32_t first = 0) {
  std::vector<std::uint8_t> bytes;
  bytes.reserve(frames * 4);
  for (std::size_t i = 0; i < frames; ++i) {
    const auto value = first + static_cast<std::uint32_t>(i);
    for (unsigned shift = 0; shift < 32; shift += 8)
      bytes.push_back(static_cast<std::uint8_t>(value >> shift));
  }
  return bytes;
}
void equal(std::span<const std::uint8_t> actual, const std::vector<std::uint8_t> &expected) {
  REQUIRE(actual.size() == expected.size());
  REQUIRE(std::equal(actual.begin(), actual.end(), expected.begin()));
}
} // namespace
TEST_CASE("PCM packetizer starts with real audio and emits only at 20 ms boundaries") {
  PcmQueue queue;
  PcmPacketizer packets;
  REQUIRE(packets.read(queue, 7).status == PacketStatus::idle);
  REQUIRE(queue.stats().underflows == 0);
  REQUIRE(queue.push(samples(1920, 100)) == QueueStatus::accepted);
  const auto first = packets.read(queue, 1000);
  REQUIRE(first.status == PacketStatus::ready);
  REQUIRE(first.timestamp_us == 1000);
  REQUIRE(first.frames == 960);
  REQUIRE(first.silence_frames == 0);
  REQUIRE(first.discontinuity);
  equal(first.bytes, samples(960, 100));
  REQUIRE(packets.read(queue, 20999).status == PacketStatus::idle);
  REQUIRE(packets.read(queue, 20999).bytes.empty());
  REQUIRE(queue.stats().queued_frames == 960);
  const auto second = packets.read(queue, 21000);
  REQUIRE(second.timestamp_us == 21000);
  REQUIRE_FALSE(second.discontinuity);
  equal(second.bytes, samples(960, 1060));
  REQUIRE(packets.stats().packets == 2);
  REQUIRE(packets.stats().discontinuities == 1);
}
TEST_CASE("PCM packetizer pads partial and empty reads without waiting for the producer") {
  PcmQueue queue;
  PcmPacketizer packets;
  REQUIRE(queue.push(samples(37, 900)) == QueueStatus::accepted);
  const auto partial = packets.read(queue, 0);
  REQUIRE(partial.frames == 37);
  REQUIRE(partial.silence_frames == 923);
  auto expected = samples(37, 900);
  expected.resize(3840);
  equal(partial.bytes, expected);
  const auto empty = packets.read(queue, 20000);
  REQUIRE(empty.status == PacketStatus::ready);
  REQUIRE(empty.frames == 0);
  REQUIRE(empty.silence_frames == 960);
  REQUIRE_FALSE(empty.discontinuity);
  equal(empty.bytes, std::vector<std::uint8_t>(3840));
  REQUIRE(queue.stats().silence_frames == 1883);
  REQUIRE(queue.stats().underflows == 2);
  REQUIRE(queue.push(samples(960, 1000)) == QueueStatus::accepted);
  equal(packets.read(queue, 40000).bytes, samples(960, 1000));
}
TEST_CASE("PCM packetizer skips expired intervals and resumes with the matching FIFO samples") {
  PcmQueue queue;
  PcmPacketizer packets;
  REQUIRE(queue.push(samples(4800)) == QueueStatus::accepted);
  equal(packets.read(queue, 0).bytes, samples(960));
  const auto recovered = packets.read(queue, 60000);
  REQUIRE(recovered.status == PacketStatus::ready);
  REQUIRE(recovered.timestamp_us == 60000);
  REQUIRE(recovered.discontinuity);
  equal(recovered.bytes, samples(960, 2880));
  REQUIRE(queue.stats().playback_skipped_frames == 1920);
  REQUIRE(queue.stats().consumed_frames == 1920);
  REQUIRE(queue.stats().queued_frames == 960);
  REQUIRE(packets.stats().skipped_intervals == 2);
  REQUIRE(packets.read(queue, 60000).status == PacketStatus::idle);
  equal(packets.read(queue, 80000).bytes, samples(960, 3840));
}
TEST_CASE("PCM packetizer preserves subinterval jitter and bounds arbitrarily long stalls") {
  PcmQueue queue;
  PcmPacketizer packets;
  REQUIRE(queue.push(samples(4800)) == QueueStatus::accepted);
  REQUIRE(queue.push(samples(960, 4800)) == QueueStatus::accepted);
  REQUIRE(packets.read(queue, 0).timestamp_us == 0);
  const auto jittered = packets.read(queue, 59999);
  REQUIRE(jittered.timestamp_us == 40000);
  equal(jittered.bytes, samples(960, 1920));
  REQUIRE(packets.stats().skipped_intervals == 1);
  const auto stalled = packets.read(queue, 5000000);
  REQUIRE(stalled.timestamp_us == 5000000);
  REQUIRE(stalled.frames == 0);
  REQUIRE(stalled.silence_frames == 960);
  REQUIRE(stalled.discontinuity);
  equal(stalled.bytes, std::vector<std::uint8_t>(3840));
  REQUIRE(queue.stats().playback_skipped_frames == 3840);
  REQUIRE(queue.stats().queued_frames == 0);
  REQUIRE(packets.stats().packets == 3);
  REQUIRE(packets.stats().skipped_intervals == 248);
}
TEST_CASE("PCM packetizer rejects backward or overflowing clocks before consuming audio") {
  PcmQueue queue;
  PcmPacketizer packets;
  REQUIRE(queue.push(samples(1920, 42)) == QueueStatus::accepted);
  REQUIRE(packets.read(queue, 100000).status == PacketStatus::ready);
  REQUIRE(packets.read(queue, 110000).status == PacketStatus::idle);
  REQUIRE(packets.read(queue, 109999).status == PacketStatus::invalid);
  REQUIRE(packets.read(queue, (std::numeric_limits<std::uint64_t>::max)()).status ==
          PacketStatus::invalid);
  REQUIRE(queue.stats().queued_frames == 960);
  REQUIRE(queue.stats().playback_skipped_frames == 0);
  equal(packets.read(queue, 120000).bytes, samples(960, 1002));
  REQUIRE(packets.stats().invalid_clocks == 2);
  PcmPacketizer edge;
  const auto maximum = (std::numeric_limits<std::uint64_t>::max)();
  REQUIRE(queue.push(samples(960, 1)) == QueueStatus::accepted);
  REQUIRE(edge.read(queue, maximum - 19999).status == PacketStatus::invalid);
  REQUIRE(queue.stats().queued_frames == 960);
  const auto last = edge.read(queue, maximum - 20000);
  REQUIRE(last.status == PacketStatus::ready);
  REQUIRE(last.timestamp_us == maximum - 20000);
  REQUIRE(edge.read(queue, maximum).status == PacketStatus::invalid);
  REQUIRE(queue.stats().consumed_frames == 2880);
}
TEST_CASE("PCM stream reset preserves lifetime counters and global monotonic presentation") {
  PcmQueue queue;
  PcmPacketizer packets;
  REQUIRE(queue.push(samples(1920)) == QueueStatus::accepted);
  REQUIRE(packets.read(queue, 1000).discontinuity);
  queue.reset();
  packets.reset();
  REQUIRE(packets.read(queue, 1000).status == PacketStatus::idle);
  REQUIRE(queue.push(samples(960, 100)) == QueueStatus::accepted);
  REQUIRE(packets.read(queue, 1000).status == PacketStatus::idle);
  REQUIRE(packets.read(queue, 999).status == PacketStatus::invalid);
  const auto resumed = packets.read(queue, 1001);
  REQUIRE(resumed.timestamp_us == 1001);
  REQUIRE(resumed.discontinuity);
  equal(resumed.bytes, samples(960, 100));
  REQUIRE(packets.stats().packets == 2);
  REQUIRE(packets.stats().discontinuities == 2);
  REQUIRE(packets.stats().invalid_clocks == 1);
  REQUIRE(queue.stats().reset_discarded_frames == 960);
}
TEST_CASE("PCM sample-derived packet duration has no cumulative drift over a virtual minute") {
  PcmQueue queue;
  PcmPacketizer packets;
  constexpr std::uint64_t start = 1099511627776;
  for (std::uint32_t index = 0; index < 3000; ++index) {
    const auto input = samples(960, index * 960);
    REQUIRE(queue.push(input) == QueueStatus::accepted);
    const auto result = packets.read(queue, start + index * 20000ULL + (index % 19) * 1000ULL);
    REQUIRE(result.status == PacketStatus::ready);
    REQUIRE(result.timestamp_us == start + index * 20000ULL);
    REQUIRE(result.frames == 960);
    REQUIRE(result.silence_frames == 0);
    REQUIRE(result.discontinuity == (index == 0));
    equal(result.bytes, input);
  }
  REQUIRE(packets.stats().skipped_intervals == 0);
  REQUIRE(packets.stats().packets == 3000);
  REQUIRE(queue.stats().consumed_frames == 2880000);
  REQUIRE(queue.stats().high_water_frames == 960);
}

TEST_CASE("PCM publication deadline is observational and retires at stream reset") {
  PcmQueue queue;
  PcmPacketizer packets;
  REQUIRE_FALSE(packets.deadline());
  REQUIRE(packets.read(queue, 0).status == PacketStatus::idle);
  REQUIRE_FALSE(packets.deadline());
  REQUIRE(queue.push(samples(1920)) == QueueStatus::accepted);
  REQUIRE(packets.read(queue, 1000).status == PacketStatus::ready);
  REQUIRE(packets.deadline() == 21000);
  REQUIRE(packets.deadline() == 21000);
  REQUIRE(packets.stats().packets == 1);
  REQUIRE(packets.read(queue, 20999).status == PacketStatus::idle);
  REQUIRE(packets.deadline() == 21000);
  REQUIRE(packets.read(queue, 20998).status == PacketStatus::invalid);
  REQUIRE(packets.deadline() == 21000);
  REQUIRE(packets.read(queue, 21000).status == PacketStatus::ready);
  REQUIRE(packets.deadline() == 41000);
  packets.reset();
  REQUIRE_FALSE(packets.deadline());
  REQUIRE(packets.stats().packets == 2);
}

TEST_CASE("Audio publication wait bounds overdue wakeups and rounds without uint64 overflow") {
  REQUIRE(publication_wait_ms(0, std::nullopt, 20) == 20);
  REQUIRE(publication_wait_ms(1000, 20000, 0) == 0);
  REQUIRE(publication_wait_ms(1000, 1000, 20) == 1);
  REQUIRE(publication_wait_ms(1000, 999, 20) == 1);
  REQUIRE(publication_wait_ms(1000, 1001, 20) == 1);
  REQUIRE(publication_wait_ms(1000, 2000, 20) == 1);
  REQUIRE(publication_wait_ms(1000, 2001, 20) == 2);
  REQUIRE(publication_wait_ms(1000, 40000, 20) == 20);
  REQUIRE(publication_wait_ms(1000, 20000, 4) == 4);
  const auto maximum = (std::numeric_limits<std::uint64_t>::max)();
  REQUIRE(publication_wait_ms(0, maximum, 20) == 20);
  REQUIRE(publication_wait_ms(maximum, maximum, 20) == 1);
}

TEST_CASE("Audio deadline scheduling avoids cumulative relative-poll loss under bounded timer "
          "quantization") {
  const auto replay = [](bool relative) {
    PcmQueue queue;
    PcmPacketizer packets;
    REQUIRE(queue.push(samples(960)) == QueueStatus::accepted);
    REQUIRE(packets.read(queue, 0).status == PacketStatus::ready);
    std::uint64_t now = 0;
    // Controlled model: 3 ms owner work and waits rounded to a 15.625 ms quantum.
    // This is not a measurement of the host's current timer implementation.
    while (now < 60000000) {
      now += 3000;
      const auto wait = relative ? 20U : publication_wait_ms(now, packets.deadline(), 20);
      const auto requested = static_cast<std::uint64_t>(wait) * 1000;
      now += ((requested + 15624) / 15625) * 15625;
      REQUIRE(packets.read(queue, now).status == PacketStatus::ready);
    }
    return packets.stats();
  };
  const auto relative = replay(true);
  const auto anchored = replay(false);
  INFO("relative skipped intervals: " << relative.skipped_intervals);
  INFO("deadline skipped intervals: " << anchored.skipped_intervals);
  REQUIRE(relative.skipped_intervals > 0);
  REQUIRE(anchored.skipped_intervals == 0);
  REQUIRE(anchored.packets >= 3000);
}
