#include "capture_cadence.hpp"
#include <catch2/catch_test_macros.hpp>
#include <limits>

using namespace bridge::audio;

TEST_CASE("Capture cadence follows exact rational 48 kHz deadlines without drift") {
  for (const auto frames : {1U, 479U, 480U, 481U, 960U, 4799U, 4800U}) {
    CaptureCadence clock;
    REQUIRE(clock.start(1, frames, 123));
    for (std::uint64_t packet = 0; packet < 3000; ++packet) {
      const auto exact = 123 + (packet * frames * 125 + 5) / 6;
      REQUIRE(clock.deadline() == exact);
      if (packet)
        REQUIRE(clock.poll(exact - 1).status == CaptureTickStatus::waiting);
      const auto due = clock.poll(exact);
      REQUIRE(due.status == CaptureTickStatus::due);
      REQUIRE(due.skipped_frames == 0);
      REQUIRE(clock.poll(exact).status == CaptureTickStatus::waiting);
    }
    REQUIRE(clock.stats().callbacks == 3000);
    REQUIRE(clock.stats().skipped_frames == 0);
  }
}

TEST_CASE("Capture cadence skips expired periods in constant work without catch-up bursts") {
  CaptureCadence clock;
  REQUIRE(clock.start(1, 960, 0));
  REQUIRE(clock.poll(0).status == CaptureTickStatus::due);
  const auto delayed = clock.poll(85000);
  REQUIRE(delayed.status == CaptureTickStatus::due);
  REQUIRE(delayed.skipped_frames == 2880);
  REQUIRE(clock.deadline() == 100000);
  REQUIRE(clock.poll(85000).status == CaptureTickStatus::waiting);
  REQUIRE(clock.poll(99999).status == CaptureTickStatus::waiting);
  REQUIRE(clock.poll(100000).skipped_frames == 0);
  REQUIRE(clock.stats().callbacks == 3);
  REQUIRE(clock.stats().skipped_frames == 2880);
}

TEST_CASE("Capture cadence rational skip agrees with an independent absolute timeline") {
  for (const auto frames : {1U, 7U, 481U, 4799U}) {
    CaptureCadence clock;
    REQUIRE(clock.start(1, frames, 0));
    std::uint64_t next = 0;
    for (std::uint64_t now = 0; now < 3000000; now += 7919) {
      const auto tick = clock.poll(now);
      const auto due = (next * frames * 125 + 5) / 6;
      if (now < due) {
        REQUIRE(tick.status == CaptureTickStatus::waiting);
      } else {
        const auto latest = now * 6 / (frames * 125);
        REQUIRE(tick.status == CaptureTickStatus::due);
        REQUIRE(tick.skipped_frames == (latest - next) * frames);
        next = latest + 1;
      }
      REQUIRE(clock.deadline() == (next * frames * 125 + 5) / 6);
    }
  }
}

TEST_CASE("Capture cadence rejects invalid starts and backward clocks without changing deadlines") {
  CaptureCadence clock;
  REQUIRE(clock.poll(0).status == CaptureTickStatus::inactive);
  REQUIRE_FALSE(clock.deadline());
  REQUIRE_FALSE(clock.start(0, 960, 0));
  REQUIRE_FALSE(clock.start(1, 0, 0));
  REQUIRE_FALSE(clock.start(1, 4801, 0));
  REQUIRE(clock.start(1, 960, 100));
  REQUIRE_FALSE(clock.start(2, 960, 0));
  REQUIRE(clock.poll(100).status == CaptureTickStatus::due);
  REQUIRE(clock.poll(200).status == CaptureTickStatus::waiting);
  REQUIRE(clock.poll(199).status == CaptureTickStatus::invalid);
  REQUIRE(clock.deadline() == 20100);
  REQUIRE(clock.stats().callbacks == 1);
  clock.stop();
  REQUIRE_FALSE(clock.start(1, 960, 0));
  REQUIRE(clock.start(2, 480, 0));
  REQUIRE(clock.poll(0).status == CaptureTickStatus::due);
  REQUIRE(clock.deadline() == 10000);
}

TEST_CASE("Capture cadence handles the full integer clock range without wrapping or loops") {
  constexpr auto max = (std::numeric_limits<std::uint64_t>::max)();
  CaptureCadence clock;
  REQUIRE(clock.start(1, 1, 0));
  const auto large = clock.poll(max - 1000);
  REQUIRE(large.status == CaptureTickStatus::due);
  REQUIRE(large.skipped_frames == (max - 1000) / 125 * 6 + ((max - 1000) % 125) * 6 / 125);
  REQUIRE(*clock.deadline() > max - 1000);
  REQUIRE(clock.poll(max).status == CaptureTickStatus::exhausted);
  REQUIRE_FALSE(clock.deadline());
  REQUIRE(clock.poll(max).status == CaptureTickStatus::inactive);
  REQUIRE(clock.start(2, 4800, max - 100000));
  REQUIRE(clock.poll(max - 100000).status == CaptureTickStatus::due);
  REQUIRE(clock.deadline() == max);
  REQUIRE(clock.poll(max).status == CaptureTickStatus::exhausted);
  REQUIRE_FALSE(clock.start(2, 1, 0));
}
