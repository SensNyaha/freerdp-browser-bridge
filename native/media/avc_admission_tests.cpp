#include "avc_admission.hpp"
#include <algorithm>
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <vector>
using namespace bridge::media;
namespace {
struct Writer {
  std::vector<std::uint8_t> rbsp;
  unsigned used = 0;
  void bit(std::uint32_t value) {
    if (!used)
      rbsp.push_back(0);
    rbsp.back() |= static_cast<std::uint8_t>((value & 1U) << (7U - used));
    used = (used + 1U) % 8U;
  }
  void fixed(std::uint32_t value, unsigned count) {
    for (unsigned i = count; i; --i)
      bit(value >> (i - 1U));
  }
  void ue(std::uint32_t value) {
    const auto code = static_cast<std::uint64_t>(value) + 1;
    unsigned count = 0;
    for (auto remaining = code; remaining; remaining >>= 1)
      ++count;
    for (unsigned i = 1; i < count; ++i)
      bit(0);
    for (unsigned i = count; i; --i)
      bit(static_cast<std::uint32_t>(code >> (i - 1U)));
  }
  void se(std::int32_t value) {
    ue(value > 0 ? static_cast<std::uint32_t>(value) * 2U - 1U
                 : static_cast<std::uint32_t>(-value) * 2U);
  }
  std::vector<std::uint8_t> nal(std::uint8_t type = 7) {
    bit(1);
    while (used)
      bit(0);
    std::vector<std::uint8_t> out{0, 0, 0, 1, static_cast<std::uint8_t>(0x60U | type)};
    unsigned zeros = 0;
    for (auto byte : rbsp) {
      if (zeros == 2 && byte <= 3) {
        out.push_back(3);
        zeros = 0;
      }
      out.push_back(byte);
      zeros = byte == 0 ? zeros + 1U : 0;
    }
    return out;
  }
};
struct Params {
  std::uint32_t width_mbs = 119, height_mbs = 67, profile = 66, refs = 1, poc = 0, cycle = 0,
                id = 0, chroma = 1, depth = 0, frame_num = 0;
  bool scaling = false, frame_only = true;
  std::int32_t poc_offset = -1;
};
std::vector<std::uint8_t> parameter(Params p = {}, std::uint8_t type = 7) {
  Writer w;
  w.fixed(p.profile, 8);
  w.fixed(0, 8);
  w.fixed(52, 8);
  w.ue(p.id);
  if (p.profile == 83 || p.profile == 86 || p.profile == 100) {
    w.ue(p.chroma);
    w.ue(p.depth);
    w.ue(p.depth);
    w.bit(0);
    w.bit(p.scaling);
    if (p.scaling)
      for (unsigned list = 0; list < 8; ++list) {
        w.bit(1);
        // First list uses default-matrix early termination; others exercise full loops.
        if (!list)
          w.se(-8);
        else
          for (unsigned i = 0; i < (list < 6 ? 16U : 64U); ++i)
            w.se(0);
      }
  }
  w.ue(p.frame_num);
  w.ue(p.poc);
  if (!p.poc)
    w.ue(0);
  else if (p.poc == 1) {
    w.bit(0);
    w.se(p.poc_offset);
    w.se(1);
    w.ue(p.cycle);
    for (std::uint32_t i = 0; i < p.cycle; ++i)
      w.se(static_cast<std::int32_t>(i) - 128);
  }
  w.ue(p.refs);
  w.bit(0);
  w.ue(p.width_mbs);
  w.ue(p.height_mbs);
  w.bit(p.frame_only);
  w.bit(1); // direct_8x8_inference_flag
  w.bit(0); // no crop (dimension admission deliberately precedes crop/VUI)
  w.bit(0); // no VUI
  return w.nal(type);
}
} // namespace
TEST_CASE("AVC SPS admission bounds coded dimensions before adding remote UE fields") {
  REQUIRE(admit_avc_decode(parameter()));
  Params p;
  p.width_mbs = 479;
  p.height_mbs = 269;
  p.refs = 16;
  REQUIRE(admit_avc_decode(parameter(p)));
  ++p.width_mbs;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  p.width_mbs = 479;
  ++p.height_mbs;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  p.height_mbs = 269;
  p.width_mbs = UINT32_MAX;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  p.width_mbs = 3;
  p.height_mbs = 1;
  AvcDecodeLimits limits;
  limits.width = 64;
  limits.height = 32;
  REQUIRE(admit_avc_decode(parameter(p), limits));
  ++p.width_mbs;
  REQUIRE_FALSE(admit_avc_decode(parameter(p), limits));
}
TEST_CASE("AVC SPS admission follows pinned profiles scaling lists and bounded POC cycles") {
  Params p;
  for (const auto profile : {66U, 77U, 88U, 83U, 86U, 100U}) {
    p.profile = profile;
    for (const auto poc : {0U, 1U, 2U}) {
      p.poc = poc;
      p.cycle = 255;
      for (const auto scaling : {false, true}) {
        p.scaling = scaling;
        REQUIRE(admit_avc_decode(parameter(p)));
        REQUIRE(admit_avc_decode(parameter(p, 15)));
      }
    }
  }
  p.profile = 100;
  p.poc = 0;
  p.chroma = 0;
  REQUIRE(admit_avc_decode(parameter(p)));
  p.chroma = 2;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  p.chroma = 1;
  p.depth = 1;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  p.depth = 0;
  p.profile = 244;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  p.profile = 66;
  p.poc = 1;
  p.cycle = 256;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  p.cycle = 0;
  p.poc = 3;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  p.poc = 0;
  p.refs = 17;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  p.refs = 1;
  p.id = 32;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  p.id = 0;
  p.frame_num = 13;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  p.frame_num = 0;
  p.frame_only = false;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
}
TEST_CASE(
    "AVC admission scans every SPS and accepts predictive units without parameter replacement") {
  auto bytes = parameter();
  const std::array<std::uint8_t, 6> prediction{0, 0, 1, 0x41, 0x89, 0x80};
  REQUIRE(admit_avc_decode(prediction));
  bytes.insert(bytes.end(), prediction.begin(), prediction.end());
  REQUIRE(admit_avc_decode(bytes));
  Params large;
  large.width_mbs = 480;
  auto excessive = parameter(large, 15);
  bytes.insert(bytes.end(), excessive.begin(), excessive.end());
  REQUIRE_FALSE(admit_avc_decode(bytes));
  bytes = parameter();
  bytes.insert(bytes.begin(), 7, 0); // Annex-B leading zero bytes.
  bytes.insert(bytes.end(), 5, 0);   // Annex-B trailing zero bytes.
  REQUIRE(admit_avc_decode(bytes));
  bytes[0] = 9;
  REQUIRE_FALSE(admit_avc_decode(bytes));
  const std::array<std::uint8_t, 6> incomplete{0, 0, 0, 1, 0x67, 0};
  REQUIRE_FALSE(admit_avc_decode(incomplete));
  bytes = parameter();
  for (std::size_t length = 0; length < 8; ++length)
    REQUIRE_FALSE(admit_avc_decode(std::span(bytes).first(length)));
  bytes[4] |= 0x80;
  REQUIRE_FALSE(admit_avc_decode(bytes));
  bytes = parameter();
  bytes.insert(bytes.end(), {0, 0, 1});
  REQUIRE_FALSE(admit_avc_decode(bytes));
  REQUIRE_FALSE(admit_avc_decode(std::array<std::uint8_t, 5>{0, 0, 0, 0, 0}));
}
TEST_CASE("AVC trusted limits can only reduce byte count NAL count and dimensions") {
  auto bytes = parameter();
  AvcDecodeLimits limits;
  limits.bytes = bytes.size();
  REQUIRE(admit_avc_decode(bytes, limits));
  --limits.bytes;
  REQUIRE_FALSE(admit_avc_decode(bytes, limits));
  limits = {};
  limits.nals = 1;
  REQUIRE(admit_avc_decode(bytes, limits));
  auto second = parameter();
  bytes.insert(bytes.end(), second.begin(), second.end());
  REQUIRE_FALSE(admit_avc_decode(bytes, limits));
  for (unsigned field = 0; field < 4; ++field) {
    limits = {};
    if (field == 0)
      ++limits.bytes;
    if (field == 1)
      ++limits.nals;
    if (field == 2)
      ++limits.width;
    if (field == 3)
      ++limits.height;
    REQUIRE_FALSE(admit_avc_decode(bytes, limits));
  }
  limits = {};
  limits.width = 0;
  REQUIRE_FALSE(admit_avc_decode(bytes, limits));
}
TEST_CASE("AVC SPS emulation prevention preserves fields and refuses ambiguous escaped prefixes") {
  Params p;
  p.poc = 1;
  p.poc_offset = 0x40000000;
  const auto bytes = parameter(p);
  const std::array<std::uint8_t, 3> escape{0, 0, 3};
  REQUIRE(std::search(bytes.begin(), bytes.end(), escape.begin(), escape.end()) != bytes.end());
  REQUIRE(admit_avc_decode(bytes));
  p.width_mbs = 480;
  REQUIRE_FALSE(admit_avc_decode(parameter(p)));
  REQUIRE_FALSE(
      admit_avc_decode(std::array<std::uint8_t, 10>{0, 0, 1, 0x67, 66, 0, 0, 3, 4, 0x80}));
  REQUIRE_FALSE(admit_avc_decode(std::array<std::uint8_t, 8>{0, 0, 1, 0x67, 66, 0, 0, 3}));
}
TEST_CASE("AVC hard NAL ceiling is exact and encoded-size refusal precedes parsing") {
  const std::array<std::uint8_t, 6> nal{0, 0, 1, 0x41, 0x89, 0x80};
  std::vector<std::uint8_t> bytes;
  for (std::size_t i = 0; i < AvcDecodeLimits::hard_nals; ++i)
    bytes.insert(bytes.end(), nal.begin(), nal.end());
  REQUIRE(admit_avc_decode(bytes));
  bytes.insert(bytes.end(), nal.begin(), nal.end());
  REQUIRE_FALSE(admit_avc_decode(bytes));
  bytes.assign(AvcDecodeLimits::hard_bytes, 0xff);
  std::copy(nal.begin(), nal.end(), bytes.begin());
  REQUIRE(admit_avc_decode(bytes));
  bytes.push_back(0xff);
  REQUIRE_FALSE(admit_avc_decode(bytes));
}
