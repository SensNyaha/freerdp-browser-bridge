#include "ingress.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <stdexcept>
using namespace bridge::clipboard;
namespace {
std::vector<std::uint8_t> pdu(std::uint16_t kind, std::uint16_t flags,
                              std::vector<std::uint8_t> body = {}) {
  const auto n = body.size();
  std::vector<std::uint8_t> b{
      static_cast<std::uint8_t>(kind),    static_cast<std::uint8_t>(kind >> 8),
      static_cast<std::uint8_t>(flags),   static_cast<std::uint8_t>(flags >> 8),
      static_cast<std::uint8_t>(n),       static_cast<std::uint8_t>(n >> 8),
      static_cast<std::uint8_t>(n >> 16), static_cast<std::uint8_t>(n >> 24)};
  b.resize(8 + n);
  std::copy(body.begin(), body.end(), b.begin() + 8);
  return b;
}
const std::vector<std::uint8_t> caps{1, 0, 0, 0, 1, 0, 12, 0, 2, 0, 0, 0, 2, 0, 0, 0};
} // namespace
TEST_CASE("Clipboard PDU inspection bounds capabilities headers and baseline control") {
  REQUIRE(inspect_pdu(pdu(1, 0), false, 1));
  REQUIRE(inspect_pdu(pdu(3, 1), false, 1));
  REQUIRE(inspect_pdu(pdu(3, 2), false, 1));
  REQUIRE(inspect_pdu(pdu(4, 0, {13, 0, 0, 0}), false, 1));
  REQUIRE(inspect_pdu(pdu(5, 1, {65}), false, 1));
  REQUIRE(inspect_pdu(pdu(5, 2), false, 1));
  REQUIRE_FALSE(inspect_pdu(pdu(5, 1, {65, 0}), false, 1));
  REQUIRE_FALSE(inspect_pdu(pdu(5, 2, {0}), false, 1));
  for (const auto kind : {0, 6, 8, 9, 10, 11, 65535})
    REQUIRE_FALSE(inspect_pdu(pdu(static_cast<std::uint16_t>(kind), 0), false, 1024));
  for (const auto kind : {1, 2, 3, 4, 5, 7})
    REQUIRE_FALSE(inspect_pdu(pdu(static_cast<std::uint16_t>(kind), 8), false, 1024));
  const auto valid = pdu(7, 0, caps);
  REQUIRE(inspect_pdu(valid, false, 1024)->long_names);
  for (std::size_t n = 0; n < valid.size(); ++n)
    REQUIRE_FALSE(inspect_pdu(std::span(valid).first(n), false, 1024));
  for (const auto at : {8U, 10U, 12U, 14U, 16U}) {
    auto bad = valid;
    bad[at] = 0xff;
    REQUIRE_FALSE(inspect_pdu(bad, false, 1024));
  }
  auto duplicate = caps;
  duplicate[0] = 2;
  duplicate.insert(duplicate.end(), caps.begin() + 4, caps.end());
  REQUIRE_FALSE(inspect_pdu(pdu(7, 0, duplicate), false, 1024));
  auto trailing = valid;
  trailing.push_back(0);
  REQUIRE_FALSE(inspect_pdu(trailing, false, 1024));
  REQUIRE_FALSE(inspect_pdu(valid, false, 0));
  REQUIRE_FALSE(inspect_pdu(valid, false, max_item_bytes + 1));
}
TEST_CASE("Clipboard format inspection bounds short and long tables before SDK allocation") {
  std::vector<std::uint8_t> short_names(36 * max_formats, 0x41);
  REQUIRE(inspect_pdu(pdu(2, 0, short_names), false, 1));
  REQUIRE(inspect_pdu(pdu(2, 4, short_names), false, 1));
  short_names.push_back(0);
  REQUIRE_FALSE(inspect_pdu(pdu(2, 0, short_names), false, 1));
  short_names.resize(36 * (max_formats + 1));
  REQUIRE_FALSE(inspect_pdu(pdu(2, 0, short_names), false, 1));
  std::vector<std::uint8_t> long_names;
  for (std::size_t i = 0; i < max_formats; ++i)
    long_names.insert(long_names.end(), {13, 0, 0, 0, 0, 0});
  REQUIRE(inspect_pdu(pdu(2, 0, long_names), true, 1));
  REQUIRE_FALSE(inspect_pdu(pdu(2, 4, long_names), true, 1));
  long_names.insert(long_names.end(), {13, 0, 0, 0, 0, 0});
  REQUIRE_FALSE(inspect_pdu(pdu(2, 0, long_names), true, 1));
  std::vector<std::uint8_t> name{13, 0, 0, 0};
  name.resize(4 + max_name_bytes, 65);
  name.insert(name.end(), {0, 0});
  REQUIRE(inspect_pdu(pdu(2, 0, name), true, 1));
  name.insert(name.end() - 2, {65, 0});
  REQUIRE_FALSE(inspect_pdu(pdu(2, 0, name), true, 1));
  REQUIRE_FALSE(inspect_pdu(pdu(2, 0, {13, 0, 0, 0}), true, 1));
  REQUIRE_FALSE(inspect_pdu(pdu(2, 0, {13, 0, 0, 0, 0}), true, 1));
  REQUIRE(inspect_pdu(pdu(2, 0, {13, 0, 0, 0, 0, 0, 0, 0, 0}), true, 1));
  REQUIRE_FALSE(inspect_pdu(pdu(2, 0, {13, 0, 0, 0, 0, 0, 1}), true, 1));
}
TEST_CASE("Clipboard ingress borrows whole PDUs and checks split headers before allocation") {
  const auto b = pdu(5, 1, {65, 0, 0, 0});
  std::size_t calls = 0;
  ClipboardIngress whole([&](auto data) {
    REQUIRE(data.data() == b.data());
    ++calls;
    return true;
  });
  REQUIRE(whole.receive({b, b.size(), true, true}, 1));
  REQUIRE(calls == 1);
  REQUIRE(whole.stats().allocated == 0);
  for (std::size_t split = 1; split < b.size(); ++split) {
    ClipboardIngress owner([&](auto data) {
      REQUIRE(std::equal(data.begin(), data.end(), b.begin(), b.end()));
      ++calls;
      return true;
    });
    REQUIRE(owner.receive({std::span(b).first(split), b.size(), true, false}, 1));
    REQUIRE(owner.stats().allocated == (split < 8 ? 0 : b.size()));
    REQUIRE(owner.receive({std::span(b).subspan(split), b.size(), false, true}, 2));
    REQUIRE(owner.stats().allocated == 0);
    REQUIRE(owner.stats().stored == 0);
    REQUIRE(owner.stats().forwarded == 1);
  }
  const auto oversized_control = pdu(2, 0, std::vector<std::uint8_t>(max_control_bytes + 1));
  ClipboardIngress owner([](auto) {
    FAIL("Rejected header reached SDK");
    return true;
  });
  REQUIRE(owner.receive(
      {std::span(oversized_control).first(7), oversized_control.size(), true, false}, 1));
  REQUIRE(owner.stats().allocated == 0);
  REQUIRE_FALSE(owner.receive(
      {std::span(oversized_control).subspan(7, 1), oversized_control.size(), false, false}, 2));
  REQUIRE(owner.stats().allocated == 0);
  REQUIRE(owner.stats().rejected == 1);
}
TEST_CASE("Clipboard ingress preserves negotiated long-name parsing and original deadlines") {
  unsigned calls = 0;
  ClipboardIngress owner(
      [&](auto) {
        ++calls;
        return true;
      },
      1024, 10);
  auto c = pdu(7, 0, caps);
  REQUIRE(owner.receive({c, c.size(), true, true}, 1));
  auto list = pdu(2, 0, {13, 0, 0, 0, 0, 0});
  REQUIRE(owner.receive({list, list.size(), true, true}, 2));
  REQUIRE(calls == 2);
  const auto b = pdu(5, 1, {65, 0, 0, 0});
  REQUIRE(owner.receive({std::span(b).first(1), b.size(), true, false}, 3));
  REQUIRE(owner.receive({std::span(b).subspan(1, 1), b.size(), false, false}, 12));
  REQUIRE_FALSE(owner.poll(13));
  REQUIRE(owner.stats().failed);
  REQUIRE(owner.stats().stored == 0);
  REQUIRE_FALSE(owner.receive({b, b.size(), true, true}, 14));
  REQUIRE(calls == 2);
}
TEST_CASE("Clipboard ingress framing clock reentry retirement and consumer faults are bounded") {
  const auto b = pdu(5, 1, {65, 0, 0, 0});
  for (unsigned mode = 0; mode < 7; ++mode) {
    ClipboardIngress owner([](auto) {
      FAIL("Malformed fragment reached SDK");
      return true;
    });
    if (mode < 4) {
      REQUIRE(owner.receive({std::span(b).first(3), b.size(), true, false}, 5));
      if (mode == 0)
        REQUIRE_FALSE(owner.receive({b, b.size(), true, true}, 6));
      if (mode == 1)
        REQUIRE_FALSE(owner.receive({std::span(b).subspan(3), b.size() + 1, false, true}, 6));
      if (mode == 2)
        REQUIRE_FALSE(owner.poll(4));
      if (mode == 3)
        REQUIRE_FALSE(owner.receive({std::span(b).subspan(3, 1), b.size(), false, true}, 6));
    } else if (mode == 4)
      REQUIRE_FALSE(owner.receive({b, b.size(), false, true}, 1));
    else if (mode == 5)
      REQUIRE_FALSE(owner.receive({b, max_item_bytes + 9, true, false}, 1));
    else
      REQUIRE_FALSE(owner.poll((std::numeric_limits<std::uint64_t>::max)()));
    REQUIRE(owner.stats().failed);
    REQUIRE(owner.stats().allocated == 0);
  }
  for (unsigned mode = 0; mode < 4; ++mode) {
    ClipboardIngress *ptr = nullptr;
    ClipboardIngress owner([&](auto data) {
      if (mode == 0)
        return false;
      if (mode == 1)
        throw std::runtime_error("Synthetic consumer fault");
      if (mode == 2)
        ptr->close();
      if (mode == 3)
        REQUIRE_FALSE(ptr->receive({b, b.size(), true, true}, 2));
      REQUIRE(std::equal(data.begin(), data.end(), b.begin(), b.end()));
      return true;
    });
    ptr = &owner;
    REQUIRE(owner.receive({std::span(b).first(9), b.size(), true, false}, 1));
    REQUIRE_FALSE(owner.receive({std::span(b).subspan(9), b.size(), false, true}, 2));
    REQUIRE(owner.stats().closed);
    REQUIRE(owner.stats().failed == (mode != 2));
    REQUIRE(owner.stats().allocated == 0);
  }
  ClipboardIngress many([](auto) {
    FAIL("Excessive fragments reached SDK");
    return true;
  });
  const auto large = pdu(5, 1, std::vector<std::uint8_t>(5000));
  REQUIRE(many.receive({std::span(large).first(1), large.size(), true, false}, 1));
  for (std::size_t i = 1; i < 4096; ++i)
    REQUIRE(many.receive({std::span(large).subspan(i, 1), large.size(), false, false}, 1));
  REQUIRE_FALSE(many.receive({std::span(large).subspan(4096, 1), large.size(), false, false}, 1));
  REQUIRE(many.stats().allocated == 0);
}
