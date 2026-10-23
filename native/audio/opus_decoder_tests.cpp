#include "../compat/bit.hpp"
#include "../compat/ranges.hpp"
#include "../compat/span.hpp"
#include "opus_decoder.hpp"
#include "opus_encoder.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <opus/opus.h>
#include <stdexcept>
#include <vector>

using namespace bridge::audio;
namespace {
std::vector<std::uint8_t> signal(std::size_t first = 0) {
  std::vector<std::uint8_t> bytes(SoftwareOpusDecoder::pcm_bytes);
  for (std::size_t i = 0; i < bytes.size() / 2; ++i) {
    const auto sample = static_cast<std::int16_t>(((i + first) % 2) != 0 ? -10000 : 16000);
    const auto word = ::bridge::compat::bit_cast<std::uint16_t>(sample);
    bytes[i * 2] = static_cast<std::uint8_t>(word);
    bytes[i * 2 + 1] = static_cast<std::uint8_t>(word >> 8);
  }
  return bytes;
}
std::vector<std::uint8_t> encoded(SoftwareOpusEncoder &encoder, std::uint64_t pts) {
  const auto unit = encoder.encode({signal(), pts});
  return {unit.bytes.begin(), unit.bytes.end()};
}
std::vector<std::uint8_t> copy(const OpusPcmUnit &unit) {
  return {unit.pcm.begin(), unit.pcm.end()};
}
} // namespace

TEST_CASE("Microphone Opus decoder agrees with actual pinned SDK for stereo predictive packets") {
  SoftwareOpusEncoder encoder;
  SoftwareOpusDecoder decoder;
  int error = OPUS_OK;
  const auto reference = std::unique_ptr<OpusDecoder, decltype(&opus_decoder_destroy)>(
      opus_decoder_create(48000, 2, &error), opus_decoder_destroy);
  REQUIRE(error == OPUS_OK);
  REQUIRE(reference);
  REQUIRE(decoder.sdk_state_bytes() > 0);
  REQUIRE(decoder.sdk_state_bytes() <= SoftwareOpusDecoder::max_sdk_state_bytes);
  std::vector<opus_int16> samples(1920);
  bool have_signal = false;
  for (std::uint64_t index = 0; index < 20; ++index) {
    const auto packet = encoded(encoder, index * 20000);
    const auto original = packet;
    std::vector<std::uint8_t> unaligned(packet.size() + 1);
    ::bridge::compat::ranges::copy(packet, unaligned.begin() + 1);
    const auto unit =
        decoder.decode({::bridge::compat::span<const std::uint8_t>(unaligned).subspan(1), index * 20000});
    REQUIRE(unit.pcm.size() == 3840);
    REQUIRE(unit.timestamp_us == index * 20000);
    REQUIRE(unit.discontinuity == (index == 0));
    REQUIRE(opus_decode(reference.get(), packet.data(), static_cast<opus_int32>(packet.size()),
                        samples.data(), 960, 0) == 960);
    for (std::size_t i = 0; i < samples.size(); ++i) {
      const auto word = ::bridge::compat::bit_cast<std::uint16_t>(samples[i]);
      REQUIRE(unit.pcm[i * 2] == static_cast<std::uint8_t>(word));
      REQUIRE(unit.pcm[i * 2 + 1] == static_cast<std::uint8_t>(word >> 8));
      have_signal = have_signal || samples[i] != 0;
    }
    REQUIRE(packet == original);
  }
  REQUIRE(have_signal);
  REQUIRE(decoder.decoded_packets() == 20);
}

TEST_CASE("Microphone Opus invalid bounds profile or clocks preserve prediction and borrowed PCM") {
  SoftwareOpusEncoder encoder;
  const auto first = encoded(encoder, 1000), next = encoded(encoder, 21000);
  SoftwareOpusDecoder decoder, reference;
  const auto borrowed = decoder.decode({first, 1000});
  const auto saved = copy(borrowed);
  reference.decode({first, 1000});
  for (const auto size : {std::size_t{0}, std::size_t{1}, std::size_t{1276}}) {
    const std::vector<std::uint8_t> bad(size);
    REQUIRE_THROWS_AS(decoder.decode({bad, 21000, true}), std::invalid_argument);
    REQUIRE(copy(borrowed) == saved);
    REQUIRE(decoder.decoded_packets() == 1);
  }
  for (unsigned toc = 0; toc < 256; ++toc) {
    const auto value = static_cast<std::uint8_t>(toc);
    const std::vector<std::uint8_t> bad{value, 0};
    if ((value & 7) == 4 && opus_packet_get_nb_samples(bad.data(), 2, 48000) == 960)
      continue;
    REQUIRE_THROWS_AS(decoder.decode({bad, 21000, true}), std::invalid_argument);
    REQUIRE(copy(borrowed) == saved);
    REQUIRE(decoder.decoded_packets() == 1);
  }
  for (const auto pts : {std::uint64_t{0}, std::uint64_t{1000}, std::uint64_t{21001},
                         std::numeric_limits<std::uint64_t>::max() - 19999}) {
    REQUIRE_THROWS_AS(decoder.decode({next, pts}), std::invalid_argument);
    REQUIRE(copy(borrowed) == saved);
  }
  REQUIRE_THROWS_AS(decoder.decode({next, 1000, true}), std::invalid_argument);
  REQUIRE(copy(decoder.decode({next, 21000})) == copy(reference.decode({next, 21000})));
}

TEST_CASE(
    "Microphone Opus discontinuity reset and timestamp ceiling cannot retain old prediction") {
  SoftwareOpusEncoder encoder;
  const auto first = encoded(encoder, 0), predictive = encoded(encoder, 20000);
  SoftwareOpusDecoder decoder, reference;
  const auto fresh = copy(reference.decode({first, 0}));
  decoder.decode({first, 1000});
  decoder.decode({predictive, 21000});
  const auto gap = decoder.decode({first, 200000, true});
  REQUIRE(gap.discontinuity);
  REQUIRE(copy(gap) == fresh);
  REQUIRE(gap.timestamp_us == 200000);
  decoder.reset();
  REQUIRE(::bridge::compat::ranges::all_of(gap.pcm, [](auto byte) { return byte == 0; }));
  const auto maximum = std::numeric_limits<std::uint64_t>::max();
  const auto boundary = decoder.decode({first, maximum - 20000});
  REQUIRE(boundary.discontinuity);
  const auto saved = copy(boundary);
  REQUIRE_THROWS_AS(decoder.decode({first, maximum}), std::invalid_argument);
  REQUIRE_THROWS_AS(decoder.decode({first, 0, true}), std::invalid_argument);
  REQUIRE(copy(boundary) == saved);
  REQUIRE(decoder.decoded_packets() == 4);
  decoder.reset();
  REQUIRE(copy(decoder.decode({first, 0})) == fresh);
  REQUIRE(decoder.decoded_packets() == 5);
}

TEST_CASE("Microphone Opus malformed entropy attempts cannot poison the next accepted packet") {
  SoftwareOpusEncoder encoder;
  const auto first = encoded(encoder, 0), next = encoded(encoder, 20000);
  // Deterministic bounded compressed-input corpus; no external fuzz-run claim.
  for (unsigned seed = 0; seed < 128; ++seed) {
    SoftwareOpusDecoder decoder, reference;
    const auto borrowed = decoder.decode({first, 0});
    const auto saved = copy(borrowed);
    reference.decode({first, 0});
    std::vector<std::uint8_t> bytes(2 + seed % 30, static_cast<std::uint8_t>(seed * 17));
    bytes[0] = static_cast<std::uint8_t>((seed % 2) != 0 ? 0x6c : 0xfc);
    bool accepted = false;
    try {
      const auto unit = decoder.decode({bytes, 20000, true});
      REQUIRE(unit.pcm.size() == 3840);
      REQUIRE(unit.discontinuity);
      REQUIRE(decoder.decoded_packets() == 2);
      accepted = true;
    } catch (const std::invalid_argument &) {
      REQUIRE(copy(borrowed) == saved);
      REQUIRE(decoder.decoded_packets() == 1);
    }
    if (accepted) {
      decoder.reset();
      reference.reset();
      REQUIRE(copy(decoder.decode({first, 0})) == copy(reference.decode({first, 0})));
    } else {
      REQUIRE(copy(decoder.decode({next, 20000})) == copy(reference.decode({next, 20000})));
    }
  }
}
