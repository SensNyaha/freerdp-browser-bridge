#include "clock.hpp"
#include <catch2/catch_test_macros.hpp>
#include <limits>

using namespace bridge::audio;

namespace {
AudioStamp first() { return {100, 48000, 960, 0, 32, 255, 1000}; }
AudioStamp next(AudioStamp value) {
  value.timestamp += 20;
  value.block = static_cast<std::uint8_t>(value.block + 1U);
  value.arrival_ms += 20;
  return value;
}
} // namespace

TEST_CASE("Audio clock counts reset causes independently without changing decisions") {
  AudioClock clock;
  auto stamp = first();
  REQUIRE(clock.observe(stamp) == true);
  REQUIRE(clock.stats().first == 1);
  auto changed = next(stamp);
  changed.format = 1;
  changed.block = 3;
  changed.arrival_ms += 200;
  changed.timestamp += 200;
  REQUIRE(clock.observe(changed) == true);
  auto stats = clock.stats();
  REQUIRE(stats.first == 1);
  REQUIRE(stats.profile == 1);
  REQUIRE(stats.block == 1);
  REQUIRE(stats.arrival_gap == 1);
  REQUIRE(stats.timestamp_gap == 1);
  REQUIRE(stats.arrival_backward == 0);
  REQUIRE(stats.timestamp_backward == 0);
  REQUIRE(clock.observe(next(changed)) == false);
  auto backward = next(next(changed));
  backward.arrival_ms = 1;
  backward.timestamp = 1;
  REQUIRE(clock.observe(backward) == true);
  REQUIRE(clock.stats().arrival_backward == 1);
  REQUIRE(clock.stats().timestamp_backward == 1);
  clock.reset();
  REQUIRE(clock.observe(first()) == true);
  REQUIRE(clock.stats().first == 2);
  stats.first = 99;
  REQUIRE(clock.stats().first == 2);
}

TEST_CASE("Audio clock invalid input changes neither history nor cause counters") {
  AudioClock clock;
  auto stamp = first();
  stamp.frames = 0;
  REQUIRE_FALSE(clock.observe(stamp));
  REQUIRE(clock.stats().first == 0);
  REQUIRE(clock.observe(first()) == true);
  REQUIRE_FALSE(clock.observe(stamp));
  REQUIRE(clock.stats().first == 1);
  REQUIRE(clock.observe(next(first())) == false);
  REQUIRE(clock.stats().profile == 0);
  REQUIRE(clock.stats().block == 0);
}

TEST_CASE("Audio continuity resets only at first packet or explicit reset for a steady stream") {
  AudioClock clock;
  auto stamp = first();
  REQUIRE(clock.observe(stamp) == true);
  for (unsigned packet = 0; packet < 6500; ++packet) {
    stamp = next(stamp);
    REQUIRE(clock.observe(stamp) == false);
  }
  clock.reset();
  REQUIRE(clock.observe(next(stamp)) == true);
  REQUIRE(clock.observe(next(next(stamp))) == false);
}

TEST_CASE("Audio continuity handles timestamp and block wraps without resetting") {
  AudioClock clock;
  auto stamp = first();
  SECTION("legacy 16-bit") {
    stamp.bits = 16;
    stamp.timestamp = 65530;
  }
  SECTION("source 32-bit") { stamp.timestamp = 0xfffffffaU; }
  REQUIRE(clock.observe(stamp) == true);
  stamp = next(stamp);
  if (stamp.bits == 16)
    stamp.timestamp &= 65535;
  REQUIRE(stamp.block == 0);
  REQUIRE(stamp.timestamp == 14);
  REQUIRE(clock.observe(stamp) == false);
}

TEST_CASE("Audio continuity resets on clock epoch, block, format or arrival discontinuity") {
  AudioClock clock;
  auto stamp = first();
  REQUIRE(clock.observe(stamp) == true);
  auto changed = next(stamp);
  SECTION("source backward") { changed.timestamp = 99; }
  SECTION("source forward gap") { changed.timestamp = 241; }
  SECTION("ambiguous half range") { changed.timestamp = 0x80000064U; }
  SECTION("arrival gap") { changed.arrival_ms = 1141; }
  SECTION("arrival backward") { changed.arrival_ms = 999; }
  SECTION("lost block") { changed.block = 1; }
  SECTION("repeated block") { changed.block = 255; }
  SECTION("format switch") { changed.format = 1; }
  SECTION("rate switch") { changed.rate = 44100; }
  SECTION("clock type switch") { changed.bits = 16; }
  REQUIRE(clock.observe(changed) == true);
  REQUIRE(clock.observe(next(changed)) == false);
}

TEST_CASE("Audio continuity allows bounded jitter and same-clock batches at exact boundaries") {
  AudioClock clock;
  auto stamp = first();
  stamp.frames = 441;
  stamp.rate = 44100;
  REQUIRE(clock.observe(stamp) == true);
  auto boundary = next(stamp);
  boundary.timestamp = 230;
  boundary.arrival_ms = 1130;
  REQUIRE(clock.observe(boundary) == false);
  auto batch = next(boundary);
  batch.timestamp = boundary.timestamp;
  batch.arrival_ms = boundary.arrival_ms;
  REQUIRE(clock.observe(batch) == false);
  auto gap = next(batch);
  gap.arrival_ms = batch.arrival_ms + 131;
  REQUIRE(clock.observe(gap) == true);
}

TEST_CASE("Audio continuity accepts large bounded PCM batches and uses their actual duration") {
  AudioClock clock;
  AudioStamp first{100, 44100, 8192, 0, 16, 1, 100};
  REQUIRE(clock.observe(first) == true);
  first.timestamp += 186;
  first.arrival_ms += 186;
  ++first.block;
  REQUIRE(clock.observe(first) == false);
  AudioStamp largest{1000, 8000, 65536, 0, 32, 3, 1000};
  REQUIRE(clock.observe(largest) == true);
  largest.timestamp += 8192;
  largest.arrival_ms += 8192;
  ++largest.block;
  REQUIRE(clock.observe(largest) == false);
}

TEST_CASE("Audio continuity rejects invalid metadata atomically") {
  AudioClock clock;
  const auto stamp = first();
  REQUIRE(clock.observe(stamp) == true);
  auto invalid = next(stamp);
  SECTION("zero width") { invalid.bits = 0; }
  SECTION("unsupported width") { invalid.bits = 31; }
  SECTION("16-bit overflow") {
    invalid.bits = 16;
    invalid.timestamp = 65536;
  }
  SECTION("low rate") { invalid.rate = 7999; }
  SECTION("high rate") { invalid.rate = 48001; }
  SECTION("zero frames") { invalid.frames = 0; }
  SECTION("over bounded source frames") { invalid.frames = 65537; }
  SECTION("maximum frames") { invalid.frames = 0xffffffffU; }
  REQUIRE_FALSE(clock.observe(invalid).has_value());
  REQUIRE(clock.observe(next(stamp)) == false);
}

TEST_CASE("Audio continuity uses overflow-safe arrival subtraction near uint64 maximum") {
  AudioClock clock;
  auto stamp = first();
  stamp.arrival_ms = (std::numeric_limits<std::uint64_t>::max)() - 20;
  REQUIRE(clock.observe(stamp) == true);
  REQUIRE(clock.observe(next(stamp)) == false);
  stamp = next(next(stamp)); // Unsigned wrap starts another local clock epoch.
  REQUIRE(clock.observe(stamp) == true);
}

TEST_CASE("Audio continuity accepts exact duration caps across supported source rates") {
  for (const auto rate : {8000U, 44100U, 48000U}) {
    AudioClock clock;
    auto stamp = first();
    stamp.rate = rate;
    stamp.frames = rate / 10;
    REQUIRE(clock.observe(stamp) == true);
    stamp.timestamp += 220;
    stamp.arrival_ms += 220;
    stamp.block = 0;
    REQUIRE(clock.observe(stamp) == false);
    stamp.timestamp += 221;
    stamp.arrival_ms += 221;
    stamp.block = 1;
    REQUIRE(clock.observe(stamp) == true);
  }
}
