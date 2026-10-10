#include "pcm.hpp"
#include <algorithm>
#include <bit>
#include <catch2/catch_test_macros.hpp>
#include <vector>

using namespace bridge::audio;
namespace {
void append(std::vector<std::uint8_t> &bytes, std::int16_t sample) {
  const auto word = static_cast<std::uint16_t>(sample);
  bytes.push_back(static_cast<std::uint8_t>(word));
  bytes.push_back(static_cast<std::uint8_t>(word >> 8));
}
std::int16_t sample_at(std::span<const std::uint8_t> bytes, std::size_t at) {
  const auto word = static_cast<std::uint16_t>(static_cast<unsigned>(bytes[at * 2]) |
                                               (static_cast<unsigned>(bytes[at * 2 + 1]) << 8));
  return std::bit_cast<std::int16_t>(word);
}
std::vector<std::uint8_t> stereo(std::size_t frames) {
  std::vector<std::uint8_t> result;
  for (std::size_t i = 0; i < frames; ++i) {
    const auto value = static_cast<std::int16_t>(static_cast<int>(i % 30000) - 15000);
    append(result, value);
    append(result, static_cast<std::int16_t>(-value));
  }
  return result;
}
} // namespace

TEST_CASE("PCM formats reject unsupported rates, widths and channel counts") {
  PcmNormalizer pcm;
  const std::array<std::uint8_t, 2> frame{0, 0};
  REQUIRE(pcm.process(frame).status == PcmStatus::unconfigured);
  REQUIRE_FALSE(pcm.format());
  for (const auto format :
       {PcmFormat{7999, 1, 16}, PcmFormat{48001, 1, 16}, PcmFormat{48000, 0, 16},
        PcmFormat{48000, 3, 16}, PcmFormat{48000, 1, 24}, PcmFormat{48000, 1, 32}})
    REQUIRE_FALSE(pcm.configure(format));
  REQUIRE(pcm.configure({48000, 1, 16}));
  REQUIRE(pcm.process(frame).frames == 1);
  REQUIRE_FALSE(pcm.configure({96000, 1, 16}));
  REQUIRE(pcm.format() == PcmFormat{48000, 1, 16});
  REQUIRE(pcm.produced_frames() == 1);
}

TEST_CASE("Unsigned PCM8 maps all values to signed stereo little endian") {
  PcmNormalizer pcm;
  REQUIRE(pcm.configure({48000, 1, 8}));
  std::vector<std::uint8_t> input;
  for (unsigned value = 0; value < 256; ++value)
    input.push_back(static_cast<std::uint8_t>(value));
  const auto result = pcm.process(input);
  REQUIRE(result.status == PcmStatus::accepted);
  REQUIRE(result.frames == 256);
  REQUIRE(result.bytes.size() == 1024);
  for (std::size_t i = 0; i < input.size(); ++i) {
    const auto expected = static_cast<std::int16_t>((static_cast<int>(i) - 128) * 256);
    REQUIRE(sample_at(result.bytes, i * 2) == expected);
    REQUIRE(sample_at(result.bytes, i * 2 + 1) == expected);
  }
}

TEST_CASE("PCM16 stereo identity preserves signed extremes and channel order") {
  PcmNormalizer pcm;
  REQUIRE(pcm.configure({48000, 2, 16}));
  const std::vector<std::uint8_t> input{0, 128, 255, 127, 255, 255, 0, 0, 1, 0, 254, 255};
  const auto result = pcm.process(input);
  REQUIRE(result.status == PcmStatus::accepted);
  REQUIRE(result.frames == 3);
  REQUIRE(std::vector(result.bytes.begin(), result.bytes.end()) == input);
}

TEST_CASE("8 kHz interpolation spans source packets without inventing a tail") {
  PcmNormalizer pcm;
  REQUIRE(pcm.configure({8000, 1, 16}));
  const std::array<std::uint8_t, 2> first{0, 128}, second{255, 127};
  REQUIRE(pcm.process(first).frames == 1);
  const auto result = pcm.process(second);
  REQUIRE(result.status == PcmStatus::accepted);
  REQUIRE(result.frames == 6);
  const std::array<std::int16_t, 6> expected{-21846, -10923, -1, 10922, 21844, 32767};
  for (std::size_t i = 0; i < expected.size(); ++i) {
    REQUIRE(sample_at(result.bytes, i * 2) == expected[i]);
    REQUIRE(sample_at(result.bytes, i * 2 + 1) == expected[i]);
  }
  REQUIRE(pcm.produced_frames() == 7);
}

TEST_CASE("Fractional rate output is invariant to aligned packet fragmentation") {
  const auto input = stereo(4410);
  PcmNormalizer bulk, fragmented;
  REQUIRE(bulk.configure({44100, 2, 16}));
  REQUIRE(fragmented.configure({44100, 2, 16}));
  const auto reference = bulk.process(input);
  REQUIRE(reference.status == PcmStatus::accepted);
  REQUIRE(reference.frames == 4799);
  std::vector<std::uint8_t> assembled;
  std::uint32_t random = 42;
  for (std::size_t at = 0; at < 4410;) {
    random = random * 1664525U + 1013904223U;
    const auto count = (std::min)(4410 - at, static_cast<std::size_t>(1 + random % 173));
    const auto part = fragmented.process(std::span(input).subspan(at * 4, count * 4));
    REQUIRE(part.status == PcmStatus::accepted);
    assembled.insert(assembled.end(), part.bytes.begin(), part.bytes.end());
    at += count;
  }
  REQUIRE(assembled == std::vector(reference.bytes.begin(), reference.bytes.end()));
  REQUIRE(fragmented.produced_frames() == bulk.produced_frames());
}

TEST_CASE("Ten seconds of 44.1 kHz packets retain an exact rational clock") {
  const auto input = stereo(441);
  PcmNormalizer pcm;
  REQUIRE(pcm.configure({44100, 2, 16}));
  std::uint64_t count = 0;
  for (unsigned i = 0; i < 1000; ++i) {
    const auto result = pcm.process(input);
    REQUIRE(result.status == PcmStatus::accepted);
    REQUIRE(result.frames <= 480);
    count += result.frames;
  }
  REQUIRE(count == 479999);
  REQUIRE(pcm.produced_frames() == count);
}

TEST_CASE("Invalid and oversized packets leave PCM phase and history unchanged") {
  PcmNormalizer pcm, reference;
  REQUIRE(pcm.configure({8000, 1, 16}));
  REQUIRE(reference.configure({8000, 1, 16}));
  const std::array<std::uint8_t, 2> seed{0, 128}, next{255, 127};
  REQUIRE(pcm.process(seed).status == PcmStatus::accepted);
  REQUIRE(reference.process(seed).status == PcmStatus::accepted);
  const std::vector<std::uint8_t> capacity(1602), oversized(65538);
  REQUIRE(pcm.process(capacity).status == PcmStatus::capacity);
  REQUIRE(pcm.process(oversized).status == PcmStatus::invalid);
  REQUIRE(pcm.process(std::span(seed).first(1)).status == PcmStatus::invalid);
  REQUIRE(pcm.process({}).status == PcmStatus::invalid);
  REQUIRE(pcm.produced_frames() == 1);
  const auto actual = pcm.process(next), expected = reference.process(next);
  REQUIRE(actual.status == PcmStatus::accepted);
  REQUIRE(actual.frames == expected.frames);
  REQUIRE(std::vector(actual.bytes.begin(), actual.bytes.end()) ==
          std::vector(expected.bytes.begin(), expected.bytes.end()));
  REQUIRE(pcm.produced_frames() == reference.produced_frames());
}

TEST_CASE("Packet ceiling accepts exactly 100 ms and rejects larger output atomically") {
  PcmNormalizer pcm;
  REQUIRE(pcm.configure({48000, 2, 16}));
  const auto large = stereo(4801);
  REQUIRE(pcm.process(large).status == PcmStatus::capacity);
  REQUIRE(pcm.produced_frames() == 0);
  const auto result = pcm.process(std::span(large).first(19200));
  REQUIRE(result.status == PcmStatus::accepted);
  REQUIRE(result.frames == 4800);
  REQUIRE(result.bytes.size() == PcmNormalizer::max_output_bytes);
  REQUIRE(pcm.process(std::span(large).first(3)).status == PcmStatus::invalid);
}

TEST_CASE("Reset and format changes discard interpolation across discontinuities") {
  PcmNormalizer pcm;
  REQUIRE(pcm.configure({8000, 1, 16}));
  const std::array<std::uint8_t, 2> first{0, 128}, second{255, 127};
  REQUIRE(pcm.process(first).frames == 1);
  pcm.reset();
  REQUIRE(pcm.produced_frames() == 0);
  REQUIRE(pcm.process(second).frames == 1);
  REQUIRE(pcm.configure({48000, 1, 8}));
  REQUIRE(pcm.produced_frames() == 0);
  const std::array<std::uint8_t, 1> silence{128};
  const auto result = pcm.process(silence);
  REQUIRE(result.frames == 1);
  REQUIRE(sample_at(result.bytes, 0) == 0);
  REQUIRE(sample_at(result.bytes, 1) == 0);
}
