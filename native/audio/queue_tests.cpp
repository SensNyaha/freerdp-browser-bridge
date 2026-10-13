#include "queue.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <deque>
#include <vector>

using namespace bridge::audio;

TEST_CASE("Raw unstamped trimming counts loss without erasing an existing boundary") {
  PcmQueue queue;
  std::vector<std::uint8_t> samples(1920 * 4, 1);
  std::vector<std::uint8_t> output(960 * 4);
  REQUIRE(queue.push(samples) == QueueStatus::accepted);
  REQUIRE(queue.discard_unstamped(100) == 100);
  REQUIRE(queue.read(output).discontinuity);
  REQUIRE(queue.discard_unstamped(100) == 100);
  REQUIRE_FALSE(queue.read(output).discontinuity);
  REQUIRE(queue.stats().playback_skipped_frames == 200);
  REQUIRE(queue.discard_unstamped(PcmQueue::capacity_frames + 1) == 0);
  REQUIRE(queue.stats().invalid_calls == 1);
  queue.reset();
  REQUIRE(queue.push(samples) == QueueStatus::accepted);
  REQUIRE(queue.discard_unstamped(100) == 100);
  REQUIRE(queue.read(output).discontinuity);
  REQUIRE(queue.discard(100) == 100);
  REQUIRE(queue.read(output).discontinuity);
}
namespace {
std::vector<std::uint8_t> packet(std::size_t frames, std::uint32_t seed = 0) {
  std::vector<std::uint8_t> bytes;
  for (std::size_t i = 0; i < frames; ++i) {
    const auto value = seed + static_cast<std::uint32_t>(i);
    for (unsigned shift = 0; shift < 32; shift += 8)
      bytes.push_back(static_cast<std::uint8_t>(value >> shift));
  }
  return bytes;
}
} // namespace

TEST_CASE("PCM queue ceiling is exactly 120 ms and overflow preserves prior audio") {
  PcmQueue queue;
  const auto first = packet(4800), last = packet(960, 4800), excess = packet(1, 5760);
  REQUIRE(queue.push(first) == QueueStatus::accepted);
  REQUIRE(queue.push(last) == QueueStatus::accepted);
  REQUIRE(queue.stats().queued_frames == 5760);
  REQUIRE(queue.push(excess) == QueueStatus::full);
  REQUIRE(queue.stats().queued_frames == 5760);
  REQUIRE(queue.stats().accepted_frames == 5760);
  REQUIRE(queue.stats().dropped_packets == 1);
  REQUIRE(queue.stats().dropped_frames == 1);
  REQUIRE(queue.stats().high_water_frames == 5760);
  std::vector<std::uint8_t> output(19200);
  const auto read = queue.read(output);
  REQUIRE(read.frames == 4800);
  REQUIRE(read.silence_frames == 0);
  REQUIRE(read.discontinuity);
  REQUIRE(output == first);
  output.resize(3840);
  REQUIRE_FALSE(queue.read(output).discontinuity);
  REQUIRE(output == last);
  REQUIRE(queue.stats().queued_frames == 0);
  REQUIRE(queue.stats().consumed_frames == 5760);
}

TEST_CASE("PCM queue wraps both insertion and removal while preserving FIFO") {
  PcmQueue queue;
  const auto first = packet(4800), second = packet(4000, 4800);
  REQUIRE(queue.push(first) == QueueStatus::accepted);
  std::vector<std::uint8_t> output(16000);
  REQUIRE(queue.read(output).frames == 4000);
  REQUIRE(output == packet(4000));
  REQUIRE(queue.push(second) == QueueStatus::accepted);
  output.resize(19200);
  const auto result = queue.read(output);
  REQUIRE(result.frames == 4800);
  REQUIRE(result.silence_frames == 0);
  REQUIRE(output == packet(4800, 4000));
  REQUIRE(queue.stats().consumed_frames == 8800);
}

TEST_CASE("PCM underflow pads silence and keeps first real packet discontinuity") {
  PcmQueue queue;
  std::vector<std::uint8_t> output(512, 255);
  const auto empty = queue.read(output);
  REQUIRE(empty.status == QueueStatus::accepted);
  REQUIRE(empty.frames == 0);
  REQUIRE(empty.silence_frames == 128);
  REQUIRE_FALSE(empty.discontinuity);
  REQUIRE(std::all_of(output.begin(), output.end(), [](auto byte) { return byte == 0; }));
  const auto input = packet(32, 100);
  REQUIRE(queue.push(input) == QueueStatus::accepted);
  std::fill(output.begin(), output.end(), 255);
  const auto partial = queue.read(output);
  REQUIRE(partial.frames == 32);
  REQUIRE(partial.silence_frames == 96);
  REQUIRE(partial.discontinuity);
  REQUIRE(std::equal(input.begin(), input.end(), output.begin()));
  REQUIRE(std::all_of(output.begin() + 128, output.end(), [](auto byte) { return byte == 0; }));
  REQUIRE(queue.stats().consumed_frames == 32);
  REQUIRE(queue.stats().silence_frames == 224);
  REQUIRE(queue.stats().underflows == 2);
  REQUIRE(queue.stats().queued_frames == 0);
}

TEST_CASE("Invalid PCM queue calls preserve bytes, backlog and discontinuity") {
  PcmQueue queue;
  const auto input = packet(40, 900);
  REQUIRE(queue.push(input) == QueueStatus::accepted);
  const std::vector<std::uint8_t> oversized(19204), unaligned(3);
  REQUIRE(queue.push({}) == QueueStatus::invalid);
  REQUIRE(queue.push(oversized) == QueueStatus::invalid);
  REQUIRE(queue.push(unaligned) == QueueStatus::invalid);
  std::vector<std::uint8_t> output(19204, 77);
  REQUIRE(queue.read(output).status == QueueStatus::invalid);
  REQUIRE(std::all_of(output.begin(), output.end(), [](auto byte) { return byte == 77; }));
  REQUIRE(queue.read(std::span(output).first(3)).status == QueueStatus::invalid);
  REQUIRE(queue.read({}).status == QueueStatus::invalid);
  REQUIRE(queue.stats().invalid_calls == 6);
  REQUIRE(queue.stats().queued_frames == 40);
  output.resize(input.size());
  const auto result = queue.read(output);
  REQUIRE(result.discontinuity);
  REQUIRE(result.frames == 40);
  REQUIRE(output == input);
}

TEST_CASE("PCM reset discards pending frames and keeps lifetime metrics") {
  PcmQueue queue;
  REQUIRE(queue.push(packet(40, 1)) == QueueStatus::accepted);
  std::vector<std::uint8_t> output(80);
  REQUIRE(queue.read(output).discontinuity);
  queue.reset();
  queue.reset();
  REQUIRE(queue.stats().reset_discarded_frames == 20);
  REQUIRE(queue.stats().accepted_frames == 40);
  REQUIRE(queue.stats().consumed_frames == 20);
  REQUIRE(queue.stats().high_water_frames == 40);
  REQUIRE(queue.stats().queued_frames == 0);
  REQUIRE(queue.read(output).frames == 0);
  REQUIRE(output == std::vector<std::uint8_t>(80));
  const auto input = packet(20, 1000);
  REQUIRE(queue.push(input) == QueueStatus::accepted);
  REQUIRE(queue.read(output).discontinuity);
  REQUIRE(output == input);
}

TEST_CASE("PCM queue matches an independent FIFO over randomized wrap and overload") {
  PcmQueue queue;
  std::deque<std::uint8_t> model;
  std::uint32_t random = 42, seed = 0;
  std::uint64_t accepted = 0, consumed = 0, silence = 0, dropped = 0, underflows = 0;
  for (unsigned iteration = 0; iteration < 2000; ++iteration) {
    random = random * 1664525U + 1013904223U;
    const auto frames = static_cast<std::size_t>(1 + (random >> 1) % 4800);
    if (random & 0x80000000U) {
      const auto input = packet(frames, seed);
      seed += static_cast<std::uint32_t>(frames);
      if (model.size() + input.size() <= 23040) {
        REQUIRE(queue.push(input) == QueueStatus::accepted);
        model.insert(model.end(), input.begin(), input.end());
        accepted += frames;
      } else {
        REQUIRE(queue.push(input) == QueueStatus::full);
        dropped += frames;
      }
    } else {
      std::vector<std::uint8_t> output(frames * 4, 255), expected(frames * 4);
      const auto taken = (std::min)(model.size(), expected.size());
      for (std::size_t i = 0; i < taken; ++i) {
        expected[i] = model.front();
        model.pop_front();
      }
      const auto result = queue.read(output);
      REQUIRE(result.status == QueueStatus::accepted);
      REQUIRE(result.frames == taken / 4);
      REQUIRE(result.silence_frames == frames - taken / 4);
      REQUIRE(output == expected);
      consumed += taken / 4;
      silence += frames - taken / 4;
      if (taken < expected.size())
        ++underflows;
    }
    REQUIRE(queue.stats().queued_frames * 4 == model.size());
  }
  REQUIRE(queue.stats().accepted_frames == accepted);
  REQUIRE(queue.stats().consumed_frames == consumed);
  REQUIRE(queue.stats().silence_frames == silence);
  REQUIRE(queue.stats().dropped_frames == dropped);
  REQUIRE(queue.stats().underflows == underflows);
}

TEST_CASE("Bounded PCM handoff copies borrowed normalizer output before reuse") {
  PcmNormalizer pcm;
  PcmQueue queue;
  REQUIRE(pcm.configure({48000, 2, 16}));
  const auto first = packet(960, 100), second = packet(960, 2000);
  REQUIRE(queue.push(pcm.process(first).bytes) == QueueStatus::accepted);
  REQUIRE(queue.push(pcm.process(second).bytes) == QueueStatus::accepted);
  std::vector<std::uint8_t> output(7680), expected = first;
  expected.insert(expected.end(), second.begin(), second.end());
  const auto result = queue.read(output);
  REQUIRE(result.frames == 1920);
  REQUIRE(result.silence_frames == 0);
  REQUIRE(output == expected);
}

TEST_CASE("PCM playback discard preserves the newest wrapped FIFO and counts loss separately") {
  PcmQueue queue;
  REQUIRE(queue.push(packet(4800)) == QueueStatus::accepted);
  std::vector<std::uint8_t> output(16000);
  REQUIRE(queue.read(output).frames == 4000);
  REQUIRE(queue.push(packet(4000, 4800)) == QueueStatus::accepted);
  REQUIRE(queue.discard(0) == 0);
  REQUIRE(queue.discard(5761) == 0);
  REQUIRE(queue.stats().invalid_calls == 1);
  REQUIRE(queue.stats().queued_frames == 4800);
  REQUIRE(queue.discard(2000) == 2000);
  output.resize(11200);
  const auto read = queue.read(output);
  REQUIRE(read.frames == 2800);
  REQUIRE(read.discontinuity);
  REQUIRE(output == packet(2800, 6000));
  REQUIRE(queue.stats().playback_skipped_frames == 2000);
  REQUIRE(queue.stats().consumed_frames == 6800);
  REQUIRE(queue.stats().dropped_frames == 0);
  REQUIRE(queue.stats().reset_discarded_frames == 0);
  REQUIRE(queue.discard(5760) == 0);
  REQUIRE(queue.push(packet(10, 9000)) == QueueStatus::accepted);
  REQUIRE(queue.discard(100) == 10);
  REQUIRE(queue.stats().queued_frames == 0);
  REQUIRE(queue.stats().playback_skipped_frames == 2010);
  queue.reset();
  REQUIRE(queue.stats().playback_skipped_frames == 2010);
}
