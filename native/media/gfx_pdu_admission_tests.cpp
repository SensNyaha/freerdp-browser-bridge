#include "gfx_pdu_admission.hpp"
#include <catch2/catch_test_macros.hpp>
#include <vector>
using namespace bridge::media;
namespace {
void put(std::vector<std::uint8_t> &bytes, std::size_t offset, std::uint32_t value,
         unsigned count = 4) {
  for (unsigned i = 0; i < count; ++i)
    bytes[offset + i] = static_cast<std::uint8_t>(value >> (8U * i));
}
std::vector<std::uint8_t> pdu(std::uint16_t command, std::size_t size) {
  std::vector<std::uint8_t> bytes(size + 8);
  put(bytes, 0, command, 2);
  put(bytes, 4, static_cast<std::uint32_t>(bytes.size()));
  return bytes;
}
std::vector<std::uint8_t> avc(std::uint32_t regions) {
  auto bytes = pdu(1, 17 + 4 + static_cast<std::size_t>(regions) * 10 + 6);
  put(bytes, 10, 11, 2);
  bytes[12] = 0x21;
  put(bytes, 21, static_cast<std::uint32_t>(bytes.size() - 25));
  put(bytes, 25, regions);
  // Metadata content/slice syntax is deliberately outside this count inspection.
  return bytes;
}
} // namespace
TEST_CASE("GFX decoded admission bounds complete PDU headers and batched progression") {
  const std::vector<std::uint8_t> caps{0x13, 0, 0, 0, 20, 0, 0, 0, 4, 0,
                                       8,    0, 4, 0, 0,  0, 0, 0, 0, 0};
  REQUIRE(admit_gfx_pdus(caps));
  for (std::size_t i = 0; i < caps.size(); ++i)
    REQUIRE_FALSE(admit_gfx_pdus(std::span(caps).first(i)));
  auto bytes = caps;
  bytes.insert(bytes.end(), caps.begin(), caps.end());
  REQUIRE(admit_gfx_pdus(bytes));
  for (const auto length : {0U, 7U, UINT32_MAX}) {
    put(bytes, 4, length);
    REQUIRE_FALSE(admit_gfx_pdus(bytes));
  }
}
TEST_CASE(
    "GFX decoded AVC420 metadata count fits both rectangles and quantizers before allocation") {
  REQUIRE(admit_gfx_pdus(avc(1024)));
  REQUIRE_FALSE(admit_gfx_pdus(avc(1025)));
  auto bytes = avc(1);
  put(bytes, 25, UINT32_MAX);
  REQUIRE_FALSE(admit_gfx_pdus(bytes));
  bytes = avc(1);
  put(bytes, 21, 4 + 8); // Rect fits, quantizer bytes are outside the declared bitmap.
  REQUIRE_FALSE(admit_gfx_pdus(bytes));
  bytes = avc(1);
  put(bytes, 21, UINT32_MAX);
  REQUIRE_FALSE(admit_gfx_pdus(bytes));
  bytes = avc(1);
  put(bytes, 10, 14, 2);
  REQUIRE_FALSE(admit_gfx_pdus(bytes));
  put(bytes, 10, 15, 2);
  REQUIRE_FALSE(admit_gfx_pdus(bytes));
  put(bytes, 10, 0, 2);
  REQUIRE(admit_gfx_pdus(bytes)); // Opaque other codec; no new support claim.
}
TEST_CASE("GFX decoded arrays cannot borrow the next PDU to satisfy a short current body") {
  for (const auto command : {4U, 5U, 7U}) {
    const std::size_t prefix = command == 4 ? 8U : command == 5 ? 14U : 6U;
    const std::size_t item = command == 4 ? 8U : 4U;
    auto bytes = pdu(static_cast<std::uint16_t>(command), prefix + item);
    put(bytes, 8 + prefix - 2, 1, 2);
    REQUIRE(admit_gfx_pdus(bytes));
    bytes.resize(8 + prefix);
    put(bytes, 4, static_cast<std::uint32_t>(bytes.size()));
    auto next = pdu(12, 4);
    bytes.insert(bytes.end(), next.begin(), next.end());
    REQUIRE_FALSE(admit_gfx_pdus(bytes));
  }
  auto bytes = avc(1);
  put(bytes, 4, 8 + 17 + 4);
  REQUIRE_FALSE(admit_gfx_pdus(bytes));
}
TEST_CASE("GFX decoded reset and cache counts obey pinned framing and bridge budgets") {
  auto bytes = pdu(14, 332);
  put(bytes, 8, 1920);
  put(bytes, 12, 1080);
  put(bytes, 16, 16);
  REQUIRE(admit_gfx_pdus(bytes));
  put(bytes, 16, 17);
  REQUIRE_FALSE(admit_gfx_pdus(bytes));
  put(bytes, 16, 1);
  put(bytes, 8, 7681);
  REQUIRE_FALSE(admit_gfx_pdus(bytes));
  put(bytes, 8, 1920);
  bytes.pop_back();
  put(bytes, 4, static_cast<std::uint32_t>(bytes.size()));
  REQUIRE_FALSE(admit_gfx_pdus(bytes));
  bytes = pdu(17, 2 + 4096 * 2);
  put(bytes, 8, 4096, 2);
  REQUIRE(admit_gfx_pdus(bytes));
  put(bytes, 8, 4097, 2);
  REQUIRE_FALSE(admit_gfx_pdus(bytes));
}
TEST_CASE("GFX decoded trusted limits only reduce exact batch and metadata ceilings") {
  auto bytes = avc(2);
  GfxPduLimits limits;
  limits.bytes = bytes.size();
  REQUIRE(admit_gfx_pdus(bytes, limits));
  --limits.bytes;
  REQUIRE_FALSE(admit_gfx_pdus(bytes, limits));
  limits = {};
  limits.regions = 1;
  REQUIRE_FALSE(admit_gfx_pdus(bytes, limits));
  bytes = pdu(12, 4);
  auto next = bytes;
  bytes.insert(bytes.end(), next.begin(), next.end());
  limits = {};
  limits.pdus = 1;
  REQUIRE_FALSE(admit_gfx_pdus(bytes, limits));
  for (unsigned field = 0; field < 3; ++field) {
    limits = {};
    if (field == 0)
      ++limits.bytes;
    if (field == 1)
      ++limits.pdus;
    if (field == 2)
      ++limits.regions;
    REQUIRE_FALSE(admit_gfx_pdus(bytes, limits));
  }
}
