#include "../compat/span.hpp"
#include "ingress.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <vector>

using namespace bridge::audio;
namespace {
std::vector<std::uint8_t> formats(std::size_t count, std::size_t extra = 0) {
  const auto size = 24 + count * (18 + extra);
  std::vector<std::uint8_t> result(size);
  result[0] = 7;
  result[2] = static_cast<std::uint8_t>(size - 4);
  result[3] = static_cast<std::uint8_t>((size - 4) >> 8);
  result[18] = static_cast<std::uint8_t>(count);
  result[19] = static_cast<std::uint8_t>(count >> 8);
  for (std::size_t at = 24; at < size; at += 18 + extra) {
    result[at] = 1;
    result[at + 2] = 2;
    result[at + 4] = 128;
    result[at + 5] = 187;
    result[at + 12] = 4;
    result[at + 14] = 16;
    result[at + 16] = static_cast<std::uint8_t>(extra);
    result[at + 17] = static_cast<std::uint8_t>(extra >> 8);
  }
  return result;
}
} // namespace

TEST_CASE("Audio assembler bounds advertised sizes before receiving peer payload") {
  AudioAssembler assembler;
  const std::array<std::uint8_t, 1> tiny{42};
  for (const auto size : {std::size_t{0}, std::size_t{65537}, std::size_t{0xffffffffU}}) {
    const auto result = assembler.push(tiny, size, true, false);
    REQUIRE(result.status == FragmentStatus::invalid);
    REQUIRE(result.bytes.empty());
    REQUIRE(assembler.failed());
    REQUIRE(assembler.push(tiny, 1, true, true).status == FragmentStatus::invalid);
    assembler.reset();
  }
  std::vector<std::uint8_t> exact(65536, 42);
  const auto result = assembler.push(exact, exact.size(), true, true);
  REQUIRE(result.status == FragmentStatus::complete);
  REQUIRE(result.bytes.size() == 65536);
  REQUIRE(std::equal(exact.begin(), exact.end(), result.bytes.begin()));
}

TEST_CASE("Audio assembler validates fragment order, total consistency and exact completion") {
  AudioAssembler assembler;
  const std::array<std::uint8_t, 4> input{1, 2, 3, 4};
  SECTION("continuation without first") {
    REQUIRE(assembler.push(input, 8, false, true).status == FragmentStatus::invalid);
  }
  SECTION("nested first") {
    REQUIRE(assembler.push(input, 8, true, false).status == FragmentStatus::collecting);
    REQUIRE(assembler.push(input, 8, true, true).status == FragmentStatus::invalid);
  }
  SECTION("changed total") {
    REQUIRE(assembler.push(input, 8, true, false).status == FragmentStatus::collecting);
    REQUIRE(assembler.push(input, 9, false, false).status == FragmentStatus::invalid);
  }
  SECTION("short last") {
    REQUIRE(assembler.push(input, 8, true, true).status == FragmentStatus::invalid);
  }
  SECTION("overflow") {
    REQUIRE(assembler.push(input, 4, true, false).status == FragmentStatus::collecting);
    REQUIRE(assembler.push(input, 4, false, true).status == FragmentStatus::invalid);
  }
  REQUIRE(assembler.failed());
  assembler.reset();
  REQUIRE_FALSE(assembler.failed());
  REQUIRE(assembler.push(input, 4, true, true).status == FragmentStatus::complete);
}

TEST_CASE("Audio assembler limits empty fragment floods and permits an empty final fragment") {
  AudioAssembler assembler;
  const std::array<std::uint8_t, 1> input{42};
  REQUIRE(assembler.push(input, 1, true, false).status == FragmentStatus::collecting);
  REQUIRE(assembler.push({}, 1, false, true).status == FragmentStatus::complete);
  assembler.reset();
  REQUIRE(assembler.push({}, 1, true, false).status == FragmentStatus::collecting);
  for (std::size_t i = 1; i < AudioAssembler::max_fragments; ++i)
    REQUIRE(assembler.push({}, 1, false, false).status == FragmentStatus::collecting);
  REQUIRE(assembler.push(input, 1, false, true).status == FragmentStatus::invalid);
  REQUIRE(assembler.failed());
}

TEST_CASE("Audio assembler preserves bytes across randomized fragmentation and reuse") {
  AudioAssembler assembler;
  std::uint32_t random = 42;
  std::vector<std::uint8_t> input(65536);
  for (auto &byte : input) {
    random = random * 1664525U + 1013904223U;
    byte = static_cast<std::uint8_t>(random >> 16);
  }
  for (unsigned pass = 0; pass < 3; ++pass) {
    for (std::size_t at = 0; at < input.size();) {
      random = random * 1664525U + 1013904223U;
      const auto count = (std::min)(input.size() - at, static_cast<std::size_t>(1 + random % 1024));
      const bool last = at + count == input.size();
      const auto result =
          assembler.push(::bridge::compat::span(input).subspan(at, count), input.size(), at == 0, last);
      REQUIRE(result.status == (last ? FragmentStatus::complete : FragmentStatus::collecting));
      if (last)
        REQUIRE(std::equal(input.begin(), input.end(), result.bytes.begin()));
      else
        REQUIRE(result.bytes.empty());
      at += count;
    }
  }
}

TEST_CASE("RDPSND validator recognizes baseline controls and Wave2 metadata") {
  AudioPduValidator validator;
  const std::vector<std::uint8_t> close{1, 0, 0, 0}, volume{3, 0, 4, 0, 0, 0, 0, 0},
      training{6, 0, 4, 0, 0, 0, 0, 0};
  REQUIRE(validator.validate(close)->kind == AudioPduKind::close);
  REQUIRE(validator.validate(volume)->kind == AudioPduKind::volume);
  REQUIRE(validator.validate(training)->kind == AudioPduKind::training);
  const std::vector<std::uint8_t> wave{13,  0,  20, 0,  255, 255, 1,   0,   9, 0, 0,   0,
                                       120, 86, 52, 18, 0,   128, 255, 127, 1, 0, 254, 255};
  const auto result = validator.validate(wave);
  REQUIRE(result);
  REQUIRE(result->kind == AudioPduKind::wave2);
  REQUIRE(result->timestamp == 0x12345678);
  REQUIRE(result->timestamp_bits == 32);
  REQUIRE(result->format_index == 1);
  REQUIRE(result->block == 9);
  REQUIRE(result->sample_bytes == 8);
}
TEST_CASE("RDPSND server Training accepts bounded opaque padding without widening other controls") {
  for (const auto length : {std::size_t{8}, std::size_t{1028}, AudioAssembler::max_bytes}) {
    std::vector<std::uint8_t> packet(length, 0xa7);
    packet[0] = 6;
    packet[2] = static_cast<std::uint8_t>(length - 4);
    packet[3] = static_cast<std::uint8_t>((length - 4) >> 8);
    AudioPduValidator validator;
    const auto result = validator.validate(packet);
    REQUIRE(result);
    REQUIRE(result->kind == AudioPduKind::training);
    REQUIRE_FALSE(validator.awaiting_wave());
    REQUIRE_FALSE(validator.failed());
  }
  for (std::size_t length = 4; length < 8; ++length) {
    std::vector<std::uint8_t> packet(length, 0);
    packet[0] = 6;
    packet[2] = static_cast<std::uint8_t>(length - 4);
    AudioPduValidator validator;
    REQUIRE_FALSE(validator.validate(packet));
    REQUIRE(validator.failed());
  }
  std::vector<std::uint8_t> excessive(AudioAssembler::max_bytes + 1, 0);
  excessive[0] = 6;
  excessive[2] = 253;
  excessive[3] = 255;
  AudioPduValidator validator;
  REQUIRE_FALSE(validator.validate(excessive));
  validator.reset();
  std::vector<std::uint8_t> mismatch{6, 0, 5, 0, 1, 2, 3, 4};
  REQUIRE_FALSE(validator.validate(mismatch));
}

TEST_CASE("RDPSND formats have bounded counts, complete descriptors and bounded extras") {
  AudioPduValidator validator;
  auto exact = formats(64);
  REQUIRE(validator.validate(exact)->format_count == 64);
  auto extra = formats(1, 1024);
  REQUIRE(validator.validate(extra)->format_count == 1);
  SECTION("count limit") { REQUIRE_FALSE(validator.validate(formats(65))); }
  SECTION("untrusted huge count") {
    auto malicious = formats(0);
    malicious[18] = malicious[19] = 255;
    REQUIRE_FALSE(validator.validate(malicious));
  }
  SECTION("extra limit") { REQUIRE_FALSE(validator.validate(formats(1, 1025))); }
  SECTION("descriptor truncation") {
    exact.pop_back();
    --exact[2];
    REQUIRE_FALSE(validator.validate(exact));
  }
  SECTION("extra truncation") {
    extra.pop_back();
    --extra[2];
    REQUIRE_FALSE(validator.validate(extra));
  }
  SECTION("trailing garbage") {
    exact.push_back(0);
    ++exact[2];
    REQUIRE_FALSE(validator.validate(exact));
  }
  REQUIRE(validator.failed());
}

TEST_CASE("Legacy XRDP input-format proposals are bounded control records, not capture data") {
  const auto proposal = [](std::size_t count, std::size_t extra = 0) {
    const auto output = formats(count, extra);
    std::vector<std::uint8_t> input(16 + output.size() - 24);
    input[0] = 39; // XRDP SNDC_REC_NEGOTIATE, version 5; no recording is selected.
    input[2] = static_cast<std::uint8_t>(input.size() - 4);
    input[3] = static_cast<std::uint8_t>((input.size() - 4) >> 8);
    input[12] = static_cast<std::uint8_t>(count);
    input[13] = static_cast<std::uint8_t>(count >> 8);
    input[14] = 5;
    std::copy(output.begin() + 24, output.end(), input.begin() + 16);
    return input;
  };
  for (const auto count : {std::size_t{0}, std::size_t{2}, std::size_t{64}}) {
    AudioPduValidator validator;
    const auto accepted = validator.validate(proposal(count));
    REQUIRE(accepted);
    REQUIRE(accepted->kind == AudioPduKind::legacy_input_formats);
    REQUIRE(accepted->format_count == count);
    REQUIRE(accepted->sample_bytes == 0);
  }
  AudioPduValidator maximum;
  REQUIRE(maximum.validate(proposal(1, 1024)));
  for (const auto &bad : {proposal(65), proposal(1, 1025)}) {
    AudioPduValidator validator;
    REQUIRE_FALSE(validator.validate(bad));
    REQUIRE(validator.failed());
  }
  const auto valid = proposal(2);
  REQUIRE(valid.size() == 52);
  for (std::size_t length = 0; length < valid.size(); ++length) {
    auto truncated = valid;
    truncated.resize(length);
    if (length >= 4) {
      truncated[2] = static_cast<std::uint8_t>(length - 4);
      truncated[3] = 0;
    }
    AudioPduValidator validator;
    REQUIRE_FALSE(validator.validate(truncated));
  }
  for (const auto offset : {std::size_t{14}, std::size_t{12}}) {
    auto bad = valid;
    bad[offset] = 255; // Unsupported version or excess format-count claim.
    AudioPduValidator validator;
    REQUIRE_FALSE(validator.validate(bad));
  }
  auto trailing = valid;
  trailing.push_back(0);
  ++trailing[2];
  AudioPduValidator validator;
  REQUIRE_FALSE(validator.validate(trailing));
  for (std::uint8_t type = 40; type <= 43; ++type) {
    auto unsupported = valid;
    unsupported[0] = type; // Legacy recording start/stop/data/volume stay unsupported.
    AudioPduValidator refused;
    REQUIRE_FALSE(refused.validate(unsupported));
  }
}

TEST_CASE("Legacy RDPSND WaveInfo validates the following raw Wave as one ordered pair") {
  AudioPduValidator validator;
  const std::array<std::uint8_t, 16> info{2, 0, 16, 0, 255, 255, 3, 0, 42, 0, 0, 0, 1, 2, 3, 4};
  const auto first = validator.validate(info);
  REQUIRE(first);
  REQUIRE(first->kind == AudioPduKind::wave_info);
  REQUIRE(first->sample_bytes == 8);
  const std::array<std::uint8_t, 8> raw{0, 0, 0, 0, 5, 6, 7, 8};
  const auto second = validator.validate(raw);
  REQUIRE(second);
  REQUIRE(second->kind == AudioPduKind::wave);
  REQUIRE(second->timestamp == 65535);
  REQUIRE(second->timestamp_bits == 16);
  REQUIRE(second->format_index == 3);
  REQUIRE(second->block == 42);
  REQUIRE(second->sample_bytes == 8);
  REQUIRE(validator.validate(info));
  REQUIRE_FALSE(validator.validate(::bridge::compat::span(raw).first(4)));
  REQUIRE(validator.failed());
}

TEST_CASE("RDPSND malformed ingress is terminal until explicit connection reset") {
  AudioPduValidator validator;
  SECTION("header truncation") {
    const std::array<std::uint8_t, 3> bytes{1, 0, 0};
    REQUIRE_FALSE(validator.validate(bytes));
  }
  SECTION("unknown type") {
    const std::array<std::uint8_t, 4> bytes{255, 0, 0, 0};
    REQUIRE_FALSE(validator.validate(bytes));
  }
  SECTION("body mismatch") {
    const std::array<std::uint8_t, 4> bytes{1, 0, 1, 0};
    REQUIRE_FALSE(validator.validate(bytes));
  }
  SECTION("empty Wave2") {
    const std::array<std::uint8_t, 16> bytes{13, 0, 12, 0};
    REQUIRE_FALSE(validator.validate(bytes));
  }
  SECTION("short WaveInfo") {
    const std::array<std::uint8_t, 12> bytes{2, 0, 12, 0};
    REQUIRE_FALSE(validator.validate(bytes));
  }
  SECTION("size cap") {
    const std::vector<std::uint8_t> bytes(65537);
    REQUIRE_FALSE(validator.validate(bytes));
  }
  REQUIRE(validator.failed());
  const std::array<std::uint8_t, 4> close{1, 0, 0, 0};
  REQUIRE_FALSE(validator.validate(close));
  validator.reset();
  REQUIRE_FALSE(validator.failed());
  REQUIRE(validator.validate(close));
}
