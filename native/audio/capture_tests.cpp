#include "capture.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <deque>
#include <limits>
#include <vector>

using namespace bridge::audio;
namespace {
std::vector<std::uint8_t> samples(std::uint16_t left, std::uint16_t right) {
  std::vector<std::uint8_t> bytes(PcmCaptureSource::packet_bytes);
  for (std::size_t i = 0; i < PcmCaptureSource::packet_frames; ++i) {
    bytes[i * 4] = static_cast<std::uint8_t>(left);
    bytes[i * 4 + 1] = static_cast<std::uint8_t>(left >> 8);
    bytes[i * 4 + 2] = static_cast<std::uint8_t>(right);
    bytes[i * 4 + 3] = static_cast<std::uint8_t>(right >> 8);
  }
  return bytes;
}
bool silent(std::span<const std::uint8_t> bytes) {
  return std::all_of(bytes.begin(), bytes.end(), [](auto byte) { return byte == 0; });
}
} // namespace

TEST_CASE("Microphone source bounds capture format packet projection and exhausted generations") {
  PcmCaptureSource source;
  REQUIRE_FALSE(source.start(1));
  REQUIRE(source.read().status == CaptureStatus::inactive);
  for (const auto channels : {std::uint16_t{1}, std::uint16_t{2}}) {
    for (const auto frames : {std::size_t{1}, std::size_t{960}, std::size_t{4800}}) {
      REQUIRE(source.configure({48000, channels, 16}, frames));
      REQUIRE(source.frames_per_packet() == frames);
      REQUIRE(source.format() == PcmFormat{48000, channels, 16});
    }
  }
  for (const auto format : {PcmFormat{44100, 2, 16}, PcmFormat{48000, 0, 16},
                            PcmFormat{48000, 3, 16}, PcmFormat{48000, 2, 8}})
    REQUIRE_FALSE(source.configure(format, 960));
  for (const auto frames :
       {std::size_t{0}, std::size_t{4801}, (std::numeric_limits<std::size_t>::max)()})
    REQUIRE_FALSE(source.configure({48000, 2, 16}, frames));
  REQUIRE(source.frames_per_packet() == 4800);
  REQUIRE_FALSE(source.start(0));
  REQUIRE(source.start(1));
  REQUIRE_FALSE(source.configure({48000, 1, 16}, 960));
  const auto empty = source.read();
  REQUIRE(empty.status == CaptureStatus::accepted);
  REQUIRE(empty.bytes.size() == 19200);
  REQUIRE(empty.frames == 0);
  REQUIRE(empty.silence_frames == 4800);
  REQUIRE(silent(empty.bytes));
  source.stop();
  REQUIRE_FALSE(source.start(1));
  REQUIRE(source.start((std::numeric_limits<std::uint64_t>::max)()));
  source.stop();
  REQUIRE_FALSE(source.start(1));
}

TEST_CASE(
    "Microphone source epoch timestamp and length refusal preserves queued samples atomically") {
  PcmCaptureSource source;
  auto first = samples(123, 456);
  REQUIRE(source.submit({1, 0, true, first}) == CaptureStatus::inactive);
  REQUIRE(source.configure({48000, 2, 16}, 960));
  REQUIRE(source.start(2));
  REQUIRE(source.submit({1, 0, true, first}) == CaptureStatus::stale);
  REQUIRE(source.submit({3, 0, true, first}) == CaptureStatus::stale);
  REQUIRE(source.submit({2, 0, false, first}) == CaptureStatus::invalid);
  REQUIRE(source.submit({2, 0, true, first}) == CaptureStatus::accepted);
  auto second = samples(321, 654);
  for (const auto time : {std::uint64_t{0}, std::uint64_t{19999}, std::uint64_t{20001},
                          (std::numeric_limits<std::uint64_t>::max)()})
    REQUIRE(source.submit({2, time, false, second}) == CaptureStatus::invalid);
  for (const auto bytes :
       {std::size_t{0}, std::size_t{3839}, std::size_t{3841}, std::size_t{65536}}) {
    const std::vector<std::uint8_t> malformed(bytes);
    REQUIRE(source.submit({2, 20000, true, malformed}) == CaptureStatus::invalid);
  }
  REQUIRE(source.stats().queue.queued_frames == 960);
  REQUIRE(source.stats().discontinuities == 1);
  REQUIRE(source.submit({2, 20000, false, second}) == CaptureStatus::accepted);
  REQUIRE(std::ranges::equal(source.read().bytes, first));
  REQUIRE(std::ranges::equal(source.read().bytes, second));
  REQUIRE(source.stats().queue.underflows == 0);
}

TEST_CASE("Microphone source prebuffer underflow and explicit input gaps separate silence from "
          "real capture") {
  PcmCaptureSource source;
  REQUIRE(source.configure({48000, 2, 16}, 960));
  REQUIRE(source.start(1));
  const auto one = samples(111, 222), two = samples(333, 444);
  REQUIRE(source.submit({1, 0, true, one}) == CaptureStatus::accepted);
  REQUIRE(silent(source.read().bytes));
  REQUIRE(source.stats().queue.queued_frames == 960);
  REQUIRE(source.stats().buffering_silence_frames == 960);
  REQUIRE(source.submit({1, 20000, false, two}) == CaptureStatus::accepted);
  const auto initial = source.read();
  REQUIRE(initial.discontinuity);
  REQUIRE(std::ranges::equal(initial.bytes, one));
  REQUIRE_FALSE(source.read().discontinuity);
  const auto underflow = source.read();
  REQUIRE(silent(underflow.bytes));
  REQUIRE(underflow.silence_frames == 960);
  REQUIRE(source.stats().queue.underflows == 1);
  REQUIRE(source.stats().buffering);
  REQUIRE(source.submit({1, 40000, false, one}) == CaptureStatus::accepted);
  REQUIRE(silent(source.read().bytes));
  REQUIRE(source.stats().queue.underflows == 1);
  REQUIRE(source.submit({1, 80000, true, two}) == CaptureStatus::accepted);
  REQUIRE(source.stats().queue.reset_discarded_frames == 960);
  REQUIRE(source.submit({1, 100000, false, two}) == CaptureStatus::accepted);
  const auto gap = source.read();
  REQUIRE(gap.discontinuity);
  REQUIRE(std::ranges::equal(gap.bytes, two));
  const auto borrowed = gap.bytes;
  source.stop();
  REQUIRE(silent(borrowed));
  REQUIRE(source.stats().queue.queued_frames == 0);
  REQUIRE(source.submit({1, 120000, true, one}) == CaptureStatus::inactive);
  REQUIRE(source.start(2));
  REQUIRE(source.submit({1, 0, true, one}) == CaptureStatus::stale);
  REQUIRE(source.submit({2, 0, true, one}) == CaptureStatus::accepted);
}

TEST_CASE("Microphone source mono projection handles signed extrema and opposite channels without "
          "overflow") {
  for (const auto triple : {std::array<std::uint16_t, 3>{0x7fff, 0x7fff, 0x7fff},
                            std::array<std::uint16_t, 3>{0x8000, 0x8000, 0x8000},
                            std::array<std::uint16_t, 3>{0x8000, 0x7fff, 0},
                            std::array<std::uint16_t, 3>{0xffff, 0xfffe, 0xffff},
                            std::array<std::uint16_t, 3>{1000, 3000, 2000}}) {
    PcmCaptureSource source;
    REQUIRE(source.configure({48000, 1, 16}, 960));
    REQUIRE(source.start(1));
    const auto input = samples(triple[0], triple[1]);
    REQUIRE(source.submit({1, 0, true, input}) == CaptureStatus::accepted);
    REQUIRE(source.submit({1, 20000, false, input}) == CaptureStatus::accepted);
    const auto output = source.read();
    REQUIRE(output.bytes.size() == 1920);
    REQUIRE(output.frames == 960);
    REQUIRE(output.silence_frames == 0);
    for (std::size_t i = 0; i < 960; ++i) {
      REQUIRE(output.bytes[i * 2] == static_cast<std::uint8_t>(triple[2]));
      REQUIRE(output.bytes[i * 2 + 1] == static_cast<std::uint8_t>(triple[2] >> 8));
    }
  }
}

TEST_CASE("Microphone source newest FIFO matches independent partial-read model under sustained "
          "burst and wraps") {
  PcmCaptureSource source;
  REQUIRE(source.configure({48000, 2, 16}, 257));
  REQUIRE(source.start(1));
  std::deque<std::array<std::uint8_t, 4>> model;
  std::uint64_t skipped = 0;
  bool buffering = true;
  for (std::uint16_t index = 0; index < 80; ++index) {
    const auto input = samples(index, static_cast<std::uint16_t>(index + 100));
    REQUIRE(source.submit({1, static_cast<std::uint64_t>(index) * 20000, index == 0, input}) ==
            CaptureStatus::accepted);
    for (std::size_t i = 0; i < 960; ++i)
      model.push_back({input[i * 4], input[i * 4 + 1], input[i * 4 + 2], input[i * 4 + 3]});
    while (model.size() > 5760) {
      model.pop_front();
      skipped++;
    }
    for (unsigned repeat = 0; repeat < index % 5U; ++repeat) {
      const auto output = source.read();
      REQUIRE(output.bytes.size() == 257 * 4);
      if (buffering && model.size() < 1920) {
        REQUIRE(silent(output.bytes));
      } else {
        buffering = false;
        const auto available = (std::min)(model.size(), std::size_t{257});
        REQUIRE(output.frames == available);
        for (std::size_t i = 0; i < available; ++i) {
          REQUIRE(std::equal(model.front().begin(), model.front().end(),
                             output.bytes.begin() + static_cast<std::ptrdiff_t>(i * 4)));
          model.pop_front();
        }
        REQUIRE(silent(output.bytes.subspan(available * 4)));
        if (available < 257)
          buffering = true;
      }
      REQUIRE(source.stats().queue.queued_frames == model.size());
    }
    REQUIRE(source.stats().queue.queued_frames <= 5760);
  }
  REQUIRE(source.stats().queue.playback_skipped_frames == skipped);
  REQUIRE(skipped > 0);
  REQUIRE(source.stats().queue.dropped_packets == 0);
  source.stop();
  REQUIRE(source.stats().queue.queued_frames == 0);
}

TEST_CASE("Microphone source partial callback pads exactly and rebuffer restores a real boundary") {
  PcmCaptureSource source;
  REQUIRE(source.configure({48000, 2, 16}, 1001));
  REQUIRE(source.start(1));
  const auto one = samples(123, 321), two = samples(456, 654);
  REQUIRE(source.submit({1, 0, true, one}) == CaptureStatus::accepted);
  REQUIRE(source.submit({1, 20000, false, two}) == CaptureStatus::accepted);
  const auto first = source.read();
  REQUIRE(first.frames == 1001);
  REQUIRE(first.silence_frames == 0);
  REQUIRE(std::ranges::equal(first.bytes.first(3840), one));
  REQUIRE(std::ranges::equal(first.bytes.subspan(3840), std::span(two).first(41 * 4)));
  const auto partial = source.read();
  REQUIRE(partial.frames == 919);
  REQUIRE(partial.silence_frames == 82);
  REQUIRE(std::ranges::equal(partial.bytes.first(919 * 4), std::span(two).subspan(41 * 4)));
  REQUIRE(silent(partial.bytes.subspan(919 * 4)));
  REQUIRE(source.stats().queue.underflows == 1);
  REQUIRE(source.stats().queue.silence_frames == 82);
  REQUIRE(source.submit({1, 40000, false, one}) == CaptureStatus::accepted);
  REQUIRE(silent(source.read().bytes));
  REQUIRE(source.stats().queue.queued_frames == 960);
  REQUIRE(source.submit({1, 60000, false, two}) == CaptureStatus::accepted);
  REQUIRE(source.read().discontinuity);
}
