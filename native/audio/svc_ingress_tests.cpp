#include "svc_ingress.hpp"
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <stdexcept>
#include <vector>
using namespace bridge::audio;
namespace {
const std::vector<std::uint8_t> volume{3, 0, 4, 0, 1, 2, 3, 4};
const std::vector<std::uint8_t> wave_info{2, 0, 16, 0, 1, 0, 0, 0, 1, 0, 0, 0, 10, 11, 12, 13};
const std::vector<std::uint8_t> wave_data{0, 0, 0, 0, 14, 15, 16, 17};
struct Fixture {
  std::vector<std::uint8_t> observed;
  unsigned calls = 0;
  bool accept = true, throwing = false, retire = false, reenter = false;
  AudioSvcIngress ingress;
  Fixture()
      : ingress([this](auto bytes) {
          ++calls;
          REQUIRE(ingress.stats().dispatching);
          if (retire)
            ingress.close();
          if (reenter)
            REQUIRE_FALSE(ingress.poll(2));
          // Read after retirement: fixed arena must remain owned until return.
          observed.assign(bytes.begin(), bytes.end());
          if (throwing)
            throw std::runtime_error("fixture");
          return accept;
        }) {}
  bool whole(std::span<const std::uint8_t> bytes, std::uint64_t now = 1) {
    return ingress.receive({bytes, bytes.size(), true, true}, now);
  }
};
} // namespace
TEST_CASE("Audio SVC owner assembles bounded whole and fragmented PDUs before dispatch") {
  Fixture whole;
  REQUIRE(whole.whole(volume));
  REQUIRE(whole.observed == volume);
  REQUIRE(whole.calls == 1);
  REQUIRE(whole.ingress.stats().stored_bytes == 0);
  for (std::size_t split = 1; split < volume.size(); ++split) {
    Fixture f;
    REQUIRE(f.ingress.receive({std::span(volume).first(split), volume.size(), true, false}, 1));
    REQUIRE(f.calls == 0);
    REQUIRE(f.ingress.stats().partial);
    REQUIRE(f.ingress.receive({std::span(volume).subspan(split), volume.size(), false, true}, 2));
    REQUIRE(f.calls == 1);
    REQUIRE(f.observed == volume);
    REQUIRE_FALSE(f.ingress.stats().partial);
    REQUIRE(f.ingress.stats().forwarded == 1);
  }
}
TEST_CASE("Audio SVC owner refuses oversized and contradictory claims without target entry") {
  for (const auto total :
       {std::size_t{0}, std::size_t{65537}, (std::numeric_limits<std::size_t>::max)()}) {
    Fixture f;
    REQUIRE_FALSE(f.ingress.receive({volume, total, true, false}, 1));
    REQUIRE(f.calls == 0);
    REQUIRE(f.ingress.stats().failed);
    REQUIRE(f.ingress.stats().stored_bytes == 0);
  }
  Fixture short_last;
  REQUIRE_FALSE(short_last.ingress.receive({volume, 9, true, true}, 1));
  REQUIRE(short_last.calls == 0);
  Fixture changed;
  REQUIRE(changed.ingress.receive({std::span(volume).first(2), 8, true, false}, 1));
  REQUIRE_FALSE(changed.ingress.receive({std::span(volume).subspan(2), 9, false, true}, 2));
  REQUIRE(changed.calls == 0);
  Fixture repeated;
  REQUIRE(repeated.ingress.receive({std::span(volume).first(2), 8, true, false}, 1));
  REQUIRE_FALSE(repeated.ingress.receive({volume, 8, true, true}, 2));
  REQUIRE(repeated.calls == 0);
}
TEST_CASE("Audio SVC owner validates advertised format counts and extras before forwarding") {
  std::vector<std::uint8_t> formats(24 + 18);
  formats[0] = 7;
  formats[2] = 38;
  formats[18] = 1;
  Fixture valid;
  REQUIRE(valid.whole(formats));
  REQUIRE(valid.calls == 1);
  formats[18] = 65;
  Fixture excessive;
  REQUIRE_FALSE(excessive.whole(formats));
  REQUIRE(excessive.calls == 0);
  formats[18] = 1;
  formats[40] = 1; // Extra byte claim has no corresponding payload.
  Fixture truncated;
  REQUIRE_FALSE(truncated.whole(formats));
  REQUIRE(truncated.calls == 0);
}
TEST_CASE("Audio SVC owner keeps one nonrenewing deadline through partial assembly") {
  Fixture f;
  REQUIRE(f.ingress.receive({std::span(volume).first(1), 8, true, false}, 10));
  REQUIRE(f.ingress.receive({std::span(volume).subspan(1, 1), 8, false, false}, 2000));
  REQUIRE(f.ingress.poll(2009));
  REQUIRE_FALSE(f.ingress.poll(2010));
  REQUIRE(f.calls == 0);
  REQUIRE(f.ingress.stats().abandoned == 1);
  REQUIRE(f.ingress.stats().stored_bytes == 0);
  REQUIRE_FALSE(f.whole(volume, 2011));
}
TEST_CASE("Audio SVC owner bounds legacy WaveInfo and subsequent raw Wave as one transaction") {
  Fixture f;
  REQUIRE(f.whole(wave_info, 1));
  REQUIRE(f.ingress.stats().awaiting_wave);
  REQUIRE(f.ingress.receive({std::span(wave_data).first(4), 8, true, false}, 1900));
  REQUIRE_FALSE(f.ingress.poll(2001));
  REQUIRE(f.calls == 1);
  REQUIRE(f.ingress.stats().abandoned == 1);
  REQUIRE_FALSE(f.ingress.stats().awaiting_wave);
  Fixture complete;
  REQUIRE(complete.whole(wave_info, 1));
  REQUIRE(complete.whole(wave_data, 2000));
  REQUIRE(complete.observed == wave_data);
  REQUIRE_FALSE(complete.ingress.stats().awaiting_wave);
  REQUIRE(complete.ingress.poll(9000));
}
TEST_CASE("Audio SVC retirement retains active borrow and does not count normal close as a fault") {
  Fixture f;
  f.retire = true;
  REQUIRE_FALSE(f.whole(volume));
  REQUIRE(f.observed == volume);
  REQUIRE(f.calls == 1);
  REQUIRE(f.ingress.stats().closed);
  REQUIRE_FALSE(f.ingress.stats().failed);
  REQUIRE(f.ingress.stats().stored_bytes == 0);
}
TEST_CASE("Audio SVC callback refusal exception and reentry preserve sticky fault ownership") {
  for (unsigned scenario = 0; scenario < 3; ++scenario) {
    Fixture f;
    f.accept = scenario != 0;
    f.throwing = scenario == 1;
    f.reenter = scenario == 2;
    REQUIRE_FALSE(f.whole(volume));
    REQUIRE(f.observed == volume);
    REQUIRE(f.ingress.stats().failed);
    REQUIRE(f.ingress.stats().rejected == 1);
    REQUIRE(f.ingress.stats().stored_bytes == 0);
    REQUIRE_FALSE(f.whole(volume, 3));
    REQUIRE(f.calls == 1);
  }
}
TEST_CASE("Audio SVC clock and trusted policy boundaries refuse uncertain continuation") {
  REQUIRE_THROWS_AS((AudioSvcIngress({}, 1)), std::invalid_argument);
  REQUIRE_THROWS_AS((AudioSvcIngress([](auto) { return true; }, 0)), std::invalid_argument);
  REQUIRE_THROWS_AS((AudioSvcIngress([](auto) { return true; }, 5001)), std::invalid_argument);
  Fixture rollback;
  REQUIRE(rollback.ingress.poll(3));
  REQUIRE_FALSE(rollback.ingress.poll(2));
  REQUIRE(rollback.ingress.stats().failed);
  Fixture overflow;
  REQUIRE_FALSE(overflow.ingress.poll((std::numeric_limits<std::uint64_t>::max)()));
  REQUIRE(overflow.ingress.stats().failed);
}
TEST_CASE("Audio SVC exact fixed-arena and fragment-count ceilings remain admissible") {
  std::vector<std::uint8_t> wave(AudioAssembler::max_bytes, 5);
  wave[0] = 13;
  wave[1] = 0;
  const auto body = static_cast<std::uint16_t>(wave.size() - 4);
  wave[2] = static_cast<std::uint8_t>(body);
  wave[3] = static_cast<std::uint8_t>(body >> 8);
  Fixture whole;
  REQUIRE(whole.whole(wave));
  REQUIRE(whole.observed == wave);
  Fixture split;
  constexpr auto part = AudioAssembler::max_bytes / AudioAssembler::max_fragments;
  for (std::size_t i = 0; i < AudioAssembler::max_fragments; ++i)
    REQUIRE(split.ingress.receive({std::span(wave).subspan(i * part, part), wave.size(), i == 0,
                                   i + 1 == AudioAssembler::max_fragments},
                                  1));
  REQUIRE(split.calls == 1);
  REQUIRE(split.observed == wave);
  Fixture excessive;
  for (std::size_t i = 0; i < AudioAssembler::max_fragments; ++i)
    REQUIRE(
        excessive.ingress.receive({std::span(wave).subspan(i, 1), wave.size(), i == 0, false}, 1));
  REQUIRE_FALSE(
      excessive.ingress.receive({std::span(wave).subspan(4096, 1), wave.size(), false, false}, 1));
  REQUIRE(excessive.calls == 0);
}
