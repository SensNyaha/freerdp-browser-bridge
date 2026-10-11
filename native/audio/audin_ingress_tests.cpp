#include "audin_ingress.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <vector>

using namespace bridge::audio;
namespace {
void word(std::vector<std::uint8_t> &data, unsigned value) {
  data.push_back(static_cast<std::uint8_t>(value));
  data.push_back(static_cast<std::uint8_t>(value >> 8));
}
void dword(std::vector<std::uint8_t> &data, unsigned value) {
  word(data, value);
  word(data, value >> 16);
}
void set(std::vector<std::uint8_t> &data, std::size_t at, unsigned value) {
  for (unsigned i = 0; i < 4; ++i)
    data[at + i] = static_cast<std::uint8_t>(value >> (i * 8));
}
std::vector<std::uint8_t> format(unsigned channels = 2, unsigned bits = 16, unsigned rate = 48000,
                                 unsigned tag = 1, unsigned extra = 0) {
  std::vector<std::uint8_t> data;
  word(data, tag);
  word(data, channels);
  dword(data, rate);
  dword(data, rate * channels * (bits / 8));
  word(data, channels * (bits / 8));
  word(data, bits);
  word(data, extra);
  data.resize(data.size() + extra, 0xa5);
  return data;
}
std::vector<std::uint8_t> offers(std::vector<std::vector<std::uint8_t>> formats = {format()}) {
  std::vector<std::uint8_t> data{2};
  dword(data, static_cast<unsigned>(formats.size()));
  dword(data, 0xdeadbeefU); // Reserved server field must be ignored.
  for (const auto &record : formats)
    data.insert(data.end(), record.begin(), record.end());
  return data;
}
std::vector<std::uint8_t> open(unsigned frames = 960, unsigned index = 0,
                               std::vector<std::uint8_t> preferred = format()) {
  std::vector<std::uint8_t> data{3};
  dword(data, frames);
  dword(data, index);
  data.insert(data.end(), preferred.begin(), preferred.end());
  return data;
}
void version(AudinIngress &parser, std::uint8_t value = 2) {
  const std::uint8_t data[]{1, value, 0, 0, 0};
  REQUIRE(parser.inspect(data));
}
void ready(AudinIngress &parser) {
  version(parser);
  REQUIRE(parser.inspect(offers({format(1), format(2)})));
}
} // namespace
TEST_CASE("AUDIN ingress validates bounded versions and retains terminal failure until reset") {
  for (const std::uint8_t value : {std::uint8_t{1}, std::uint8_t{2}}) {
    AudinIngress parser;
    const std::uint8_t data[]{1, value, 0, 0, 0};
    const auto pdu = parser.inspect(data);
    REQUIRE(pdu);
    REQUIRE(pdu->kind == AudinPduKind::version);
    REQUIRE(pdu->version == value);
    REQUIRE(pdu->bytes.data() == data);
    REQUIRE(parser.phase() == AudinPhase::formats);
  }
  for (const unsigned value : {0U, 3U, 0xffffffffU}) {
    AudinIngress parser;
    std::vector<std::uint8_t> data{1};
    dword(data, value);
    REQUIRE_FALSE(parser.inspect(data));
    REQUIRE(parser.phase() == AudinPhase::failed);
    REQUIRE_FALSE(parser.inspect(std::vector<std::uint8_t>{1, 1, 0, 0, 0}));
    parser.reset();
    version(parser);
  }
  for (std::size_t size = 0; size <= 6; ++size) {
    if (size == 5)
      continue;
    AudinIngress parser;
    std::vector<std::uint8_t> data(size, 0);
    if (size)
      data[0] = 1;
    REQUIRE_FALSE(parser.inspect(data));
  }
  AudinIngress parser;
  REQUIRE_FALSE(parser.inspect(std::vector<std::uint8_t>(AudinIngress::max_bytes + 1, 1)));
}
TEST_CASE("AUDIN ingress filters only consistent PCM without retaining server extra data") {
  AudinIngress parser;
  version(parser);
  auto invalid_align = format();
  invalid_align[12] = 3;
  auto invalid_rate_bytes = format();
  set(invalid_rate_bytes, 8, 123);
  auto data =
      offers({format(2, 24), format(1), format(2, 16, 48000, 6, 4), invalid_align,
              invalid_rate_bytes, format(2), format(2, 16, 44100), format(2, 16, 48000, 1, 2)});
  data.insert(data.end(), {0xde, 0xad, 0xbe, 0xef}); // Legal arbitrary trailing ExtraData.
  const auto pdu = parser.inspect(data);
  REQUIRE(pdu);
  REQUIRE(pdu->forward);
  REQUIRE(pdu->format_count == 2);
  REQUIRE(pdu->bytes.size() == 45);
  std::vector<std::uint8_t> expected{2, 2, 0, 0, 0, 45, 0, 0, 0};
  const auto mono = format(1), stereo = format(2);
  expected.insert(expected.end(), mono.begin(), mono.end());
  expected.insert(expected.end(), stereo.begin(), stereo.end());
  REQUIRE(std::equal(expected.begin(), expected.end(), pdu->bytes.begin()));
  std::fill(data.begin(), data.end(), 0);
  REQUIRE(std::equal(expected.begin(), expected.end(), pdu->bytes.begin()));
  REQUIRE(parser.phase() == AudinPhase::open);
}
TEST_CASE("AUDIN ingress limits format counts extras lengths and complete-record budgets") {
  for (const unsigned count : {0U, 65U, 0xffffffffU}) {
    AudinIngress parser;
    version(parser);
    auto data = offers();
    set(data, 1, count);
    REQUIRE_FALSE(parser.inspect(data));
    REQUIRE(parser.format_count() == 0);
  }
  const auto complete = offers({format(1), format(2, 16, 48000, 6, 4)});
  for (std::size_t size = 0; size < complete.size(); ++size) {
    AudinIngress parser;
    version(parser);
    REQUIRE_FALSE(parser.inspect(std::span(complete).first(size)));
    REQUIRE(parser.format_count() == 0);
  }
  for (const auto record : {format(2, 16, 48000, 6, 1025), format(2, 16, 48000, 0xfffe, 21)}) {
    AudinIngress parser;
    version(parser);
    REQUIRE_FALSE(parser.inspect(offers({record})));
  }
  AudinIngress maximum;
  version(maximum);
  auto data = offers(std::vector<std::vector<std::uint8_t>>(64, format()));
  data.resize(AudinIngress::max_bytes, 0x7f);
  const auto selected = maximum.inspect(data);
  REQUIRE(selected);
  REQUIRE(selected->format_count == 64);
  REQUIRE(selected->bytes.size() == AudinIngress::max_offer_bytes);
  AudinIngress oversized;
  version(oversized);
  data.push_back(0);
  REQUIRE_FALSE(oversized.inspect(data));
  AudinIngress extra;
  version(extra);
  const auto allowed_extra = extra.inspect(offers({format(2, 16, 48000, 6, 1024), format()}));
  REQUIRE(allowed_extra);
  REQUIRE(allowed_extra->format_count == 1);
}
TEST_CASE("AUDIN ingress handles no common format without forwarding a zero table upstream") {
  AudinIngress parser;
  version(parser);
  const auto pdu = parser.inspect(offers({format(2, 24), format(2, 16, 44100)}));
  REQUIRE(pdu);
  REQUIRE_FALSE(pdu->forward);
  REQUIRE(pdu->format_count == 0);
  REQUIRE(pdu->bytes.size() == 9);
  REQUIRE(pdu->bytes[5] == 9);
  REQUIRE(parser.phase() == AudinPhase::unsupported);
  REQUIRE_FALSE(parser.inspect(open()));
  parser.reset();
  ready(parser);
  REQUIRE(parser.format_count() == 2);
}
TEST_CASE(
    "AUDIN ingress validates complete Open capture preference and bounded selected callbacks") {
  for (const unsigned frames : {1U, 960U, 4800U}) {
    for (const unsigned index : {0U, 1U}) {
      AudinIngress parser;
      ready(parser);
      auto data = open(frames, index, format(2, 16, 44100, 0xfffe, 22));
      const auto pdu = parser.inspect(data);
      REQUIRE(pdu);
      REQUIRE(pdu->kind == AudinPduKind::open);
      REQUIRE(pdu->frames_per_packet == frames);
      REQUIRE(pdu->format_index == index);
      REQUIRE(pdu->bytes.data() == data.data());
      REQUIRE(parser.phase() == AudinPhase::recording);
      REQUIRE(parser.frames_per_packet() == frames);
    }
  }
  for (const unsigned frames : {0U, 4801U, 0xffffffffU}) {
    AudinIngress parser;
    ready(parser);
    REQUIRE_FALSE(parser.inspect(open(frames)));
    REQUIRE(parser.frames_per_packet() == 0);
  }
  for (const unsigned index : {2U, 63U, 0xffffffffU}) {
    AudinIngress parser;
    ready(parser);
    REQUIRE_FALSE(parser.inspect(open(960, index)));
  }
  const auto complete = open(960, 0, format(2, 16, 48000, 6, 10));
  for (std::size_t size = 0; size < complete.size(); ++size) {
    AudinIngress parser;
    ready(parser);
    REQUIRE_FALSE(parser.inspect(std::span(complete).first(size)));
  }
  for (const auto record : {format(2, 16, 48000, 6, 1025), format(2, 16, 48000, 0xfffe, 23)}) {
    AudinIngress parser;
    ready(parser);
    REQUIRE_FALSE(parser.inspect(open(960, 0, record)));
  }
  AudinIngress extra;
  ready(extra);
  auto data = open();
  data.push_back(0);
  REQUIRE_FALSE(extra.inspect(data));
}
TEST_CASE("AUDIN ingress enforces ordered fixed negotiation and selected format changes") {
  for (const auto data : {offers(), open(), std::vector<std::uint8_t>{7, 0, 0, 0, 0},
                          std::vector<std::uint8_t>{4, 0, 0, 0, 0}, std::vector<std::uint8_t>{5}}) {
    AudinIngress parser;
    REQUIRE_FALSE(parser.inspect(data));
  }
  AudinIngress parser;
  ready(parser);
  REQUIRE(parser.inspect(open(4800)));
  const auto change = parser.inspect(std::vector<std::uint8_t>{7, 1, 0, 0, 0});
  REQUIRE(change);
  REQUIRE(change->kind == AudinPduKind::change);
  REQUIRE(change->format_index == 1);
  REQUIRE(change->frames_per_packet == 4800);
  REQUIRE_FALSE(parser.inspect(std::vector<std::uint8_t>{7, 2, 0, 0, 0}));
  REQUIRE(parser.phase() == AudinPhase::failed);
  for (const auto data : {offers(), open(), std::vector<std::uint8_t>{1, 2, 0, 0, 0},
                          std::vector<std::uint8_t>{7, 1, 0, 0, 0, 0}}) {
    AudinIngress duplicate;
    ready(duplicate);
    REQUIRE(duplicate.inspect(open()));
    REQUIRE_FALSE(duplicate.inspect(data));
  }
}
