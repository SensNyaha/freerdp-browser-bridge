#include "../compat/span.hpp"
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
  REQUIRE(inspect_pdu(pdu(5, 1, {65, 0}), false, 1)->quota_refused);
  REQUIRE_FALSE(inspect_pdu(pdu(5, 2, {0}), false, 1));
  for (const auto kind : {0, 6, 8, 9, 10, 11, 65535})
    REQUIRE_FALSE(inspect_pdu(pdu(static_cast<std::uint16_t>(kind), 0), false, 1024));
  for (const auto kind : {1, 2, 3, 4, 5, 7})
    REQUIRE_FALSE(inspect_pdu(pdu(static_cast<std::uint16_t>(kind), 8), false, 1024));
  const auto valid = pdu(7, 0, caps);
  REQUIRE(inspect_pdu(valid, false, 1024)->long_names);
  for (std::size_t n = 0; n < valid.size(); ++n)
    REQUIRE_FALSE(inspect_pdu(::bridge::compat::span(valid).first(n), false, 1024));
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
TEST_CASE("XRDP monitor-ready zero trailer is bounded and normalized before forwarding") {
  auto ready = pdu(1, 0);
  ready.resize(12, 0); // XRDP 0.9.21.1 adds one zero DWORD outside dataLen.
  REQUIRE(inspect_pdu(ready, false, 1));
  unsigned calls = 0;
  const auto forward = [&](auto bytes) {
    REQUIRE(std::equal(bytes.begin(), bytes.end(), ready.begin(), ready.begin() + 8));
    ++calls;
    return true;
  };
  ClipboardIngress whole(forward);
  REQUIRE(whole.receive({ready, ready.size(), true, true}, 1));
  REQUIRE(whole.stats().allocated == 0);
  for (std::size_t split = 1; split < ready.size(); ++split) {
    ClipboardIngress owner(forward);
    REQUIRE(owner.receive({::bridge::compat::span(ready).first(split), ready.size(), true, false}, 1));
    REQUIRE(owner.stats().allocated <= ready.size());
    REQUIRE(owner.receive({::bridge::compat::span(ready).subspan(split), ready.size(), false, true}, 2));
    REQUIRE(owner.stats().allocated == 0);
  }
  REQUIRE(calls == ready.size());
  for (std::size_t at = 8; at < ready.size(); ++at) {
    auto invalid = ready;
    invalid[at] = 1;
    REQUIRE_FALSE(inspect_pdu(invalid, false, 1));
    ClipboardIngress owner(forward);
    REQUIRE_FALSE(owner.receive({invalid, invalid.size(), true, true}, 1));
  }
  for (std::size_t n = 9; n <= 16; ++n) {
    if (n == 12)
      continue;
    auto invalid = ready;
    invalid.resize(n);
    REQUIRE_FALSE(inspect_pdu(invalid, false, 1));
  }
  for (const auto kind : {0, 3, 4, 5, 6, 7, 8}) {
    auto invalid = ready;
    invalid[0] = static_cast<std::uint8_t>(kind);
    REQUIRE_FALSE(inspect_pdu(invalid, false, 1));
  }
  auto nonempty_ready = ready;
  nonempty_ready[4] = 4;
  REQUIRE_FALSE(inspect_pdu(nonempty_ready, false, 1));
  ClipboardIngress fragmented(forward);
  auto bad_trailer = ready;
  bad_trailer.back() = 1;
  REQUIRE(fragmented.receive({::bridge::compat::span(bad_trailer).first(8), 12, true, false}, 1));
  REQUIRE_FALSE(fragmented.receive({::bridge::compat::span(bad_trailer).subspan(8), 12, false, true}, 2));
  REQUIRE(fragmented.stats().allocated == 0);
  REQUIRE(calls == ready.size());
}
TEST_CASE("XRDP zero trailers preserve declared control bounds and allocation-free quota drain") {
  for (auto original : {pdu(2, 0), pdu(3, 1), pdu(4, 0, {13, 0, 0, 0}),
                        pdu(5, 1, {65, 0}), pdu(7, 0, caps)}) {
    auto padded = original;
    padded.resize(padded.size() + 4, 0);
    REQUIRE(inspect_pdu(padded, false, 1024));
    unsigned calls = 0;
    for (std::size_t split = 1; split < padded.size(); ++split) {
      ClipboardIngress owner([&](auto bytes) {
        REQUIRE(std::equal(bytes.begin(), bytes.end(), original.begin(), original.end()));
        ++calls;
        return true;
      });
      REQUIRE(owner.receive({::bridge::compat::span(padded).first(split), padded.size(), true, false}, 1));
      REQUIRE(owner.receive({::bridge::compat::span(padded).subspan(split), padded.size(), false, true}, 2));
      REQUIRE(owner.stats().allocated == 0);
    }
    REQUIRE(calls == padded.size() - 1);
    padded.back() = 1;
    REQUIRE_FALSE(inspect_pdu(padded, false, 1024));
  }
  auto over_quota = pdu(5, 1, {65, 0, 0, 0});
  over_quota.resize(over_quota.size() + 4, 0);
  REQUIRE_FALSE(inspect_pdu(over_quota, false, 4)->quota_refused);
  REQUIRE(inspect_pdu(over_quota, false, 3)->quota_refused);
  for (std::size_t split = 1; split < over_quota.size(); ++split) {
    unsigned calls = 0;
    ClipboardIngress owner([&](auto bytes) {
      const auto refused = pdu(5, 2);
      REQUIRE(std::equal(bytes.begin(), bytes.end(), refused.begin(), refused.end()));
      ++calls;
      return true;
    }, 3);
    REQUIRE(owner.receive({::bridge::compat::span(over_quota).first(split), over_quota.size(), true, false}, 1));
    REQUIRE(owner.stats().allocated == 0);
    REQUIRE(calls == 0);
    REQUIRE(owner.receive({::bridge::compat::span(over_quota).subspan(split), over_quota.size(), false, true}, 2));
    REQUIRE(calls == 1);
    REQUIRE(owner.stats().quota_refused == 1);
  }
  for (std::size_t at = over_quota.size() - 4; at < over_quota.size(); ++at) {
    auto invalid = over_quota;
    invalid[at] = 1;
    ClipboardIngress owner([](auto) { FAIL("Bad trailer reached SDK"); return false; }, 3);
    REQUIRE(owner.receive({::bridge::compat::span(invalid).first(8), invalid.size(), true, false}, 1));
    REQUIRE_FALSE(owner.receive({::bridge::compat::span(invalid).subspan(8), invalid.size(), false, true}, 2));
    REQUIRE(owner.stats().allocated == 0);
  }
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
    REQUIRE(owner.receive({::bridge::compat::span(b).first(split), b.size(), true, false}, 1));
    REQUIRE(owner.stats().allocated == (split < 8 ? 0 : b.size()));
    REQUIRE(owner.receive({::bridge::compat::span(b).subspan(split), b.size(), false, true}, 2));
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
      {::bridge::compat::span(oversized_control).first(7), oversized_control.size(), true, false}, 1));
  REQUIRE(owner.stats().allocated == 0);
  REQUIRE_FALSE(owner.receive(
      {::bridge::compat::span(oversized_control).subspan(7, 1), oversized_control.size(), false, false}, 2));
  REQUIRE(owner.stats().allocated == 0);
  REQUIRE(owner.stats().rejected == 1);
}
TEST_CASE("XRDP padding does not increase the absolute clipboard wire cap") {
  auto packet = pdu(5, 1, std::vector<std::uint8_t>(max_item_bytes, 0));
  REQUIRE(inspect_pdu(packet, false, max_item_bytes));
  packet.resize(packet.size() + 4);
  REQUIRE_FALSE(inspect_pdu(packet, false, max_item_bytes));
  ClipboardIngress owner([](auto) { FAIL("Outer cap bypass reached SDK"); return false; });
  REQUIRE_FALSE(owner.receive({::bridge::compat::span(packet).first(8), packet.size(), true, false}, 1));
  REQUIRE(owner.stats().allocated == 0);
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
  REQUIRE(owner.receive({::bridge::compat::span(b).first(1), b.size(), true, false}, 3));
  REQUIRE(owner.receive({::bridge::compat::span(b).subspan(1, 1), b.size(), false, false}, 12));
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
      REQUIRE(owner.receive({::bridge::compat::span(b).first(3), b.size(), true, false}, 5));
      if (mode == 0)
        REQUIRE_FALSE(owner.receive({b, b.size(), true, true}, 6));
      if (mode == 1)
        REQUIRE_FALSE(owner.receive({::bridge::compat::span(b).subspan(3), b.size() + 1, false, true}, 6));
      if (mode == 2)
        REQUIRE_FALSE(owner.poll(4));
      if (mode == 3)
        REQUIRE_FALSE(owner.receive({::bridge::compat::span(b).subspan(3, 1), b.size(), false, true}, 6));
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
    REQUIRE(owner.receive({::bridge::compat::span(b).first(9), b.size(), true, false}, 1));
    REQUIRE_FALSE(owner.receive({::bridge::compat::span(b).subspan(9), b.size(), false, true}, 2));
    REQUIRE(owner.stats().closed);
    REQUIRE(owner.stats().failed == (mode != 2));
    REQUIRE(owner.stats().allocated == 0);
  }
  ClipboardIngress many([](auto) {
    FAIL("Excessive fragments reached SDK");
    return true;
  });
  const auto large = pdu(5, 1, std::vector<std::uint8_t>(ClipboardIngress::max_fragments + 16));
  REQUIRE(many.receive({::bridge::compat::span(large).first(1), large.size(), true, false}, 1));
  for (std::size_t i = 1; i < ClipboardIngress::max_fragments; ++i)
    REQUIRE(many.receive({::bridge::compat::span(large).subspan(i, 1), large.size(), false, false}, 1));
  REQUIRE_FALSE(many.receive(
      {::bridge::compat::span(large).subspan(ClipboardIngress::max_fragments, 1), large.size(), false, false},
      1));
  REQUIRE(many.stats().allocated == 0);
}
TEST_CASE("Clipboard item quota substitutes one failure without retaining oversized content") {
  const auto over = pdu(5, 1, std::vector<std::uint8_t>(16, 65));
  const auto small = pdu(5, 1, {65, 0, 0, 0});
  const auto failure = pdu(5, 2);
  for (std::size_t split = 0; split < over.size(); ++split) {
    unsigned calls = 0;
    ClipboardIngress *ptr = nullptr;
    ClipboardIngress owner(
        [&](auto data) {
          const auto &expected = calls++ == 0 ? failure : small;
          REQUIRE(std::equal(data.begin(), data.end(), expected.begin(), expected.end()));
          REQUIRE(ptr->stats().allocated == 0);
          return true;
        },
        8);
    ptr = &owner;
    if (split) {
      REQUIRE(owner.receive({::bridge::compat::span(over).first(split), over.size(), true, false}, 1));
      REQUIRE(owner.stats().allocated == 0);
      REQUIRE(owner.stats().stored <= 8);
      REQUIRE(owner.receive({::bridge::compat::span(over).subspan(split), over.size(), false, true}, 2));
    } else
      REQUIRE(owner.receive({over, over.size(), true, true}, 1));
    REQUIRE(owner.stats().quota_refused == 1);
    REQUIRE_FALSE(owner.stats().failed);
    REQUIRE(owner.poll(3));
    REQUIRE(owner.receive({small, small.size(), true, true}, 3));
    REQUIRE(calls == 2);
    REQUIRE(owner.stats().forwarded == 2);
    REQUIRE(owner.stats().allocated == 0);
  }
}
TEST_CASE("Clipboard oversized-item discard preserves deadline and borrowed failure lifetime") {
  const auto over = pdu(5, 1, std::vector<std::uint8_t>(32, 65));
  ClipboardIngress abandoned(
      [](auto) {
        FAIL("Incomplete quota record forwarded");
        return true;
      },
      8, 10);
  REQUIRE(abandoned.receive({::bridge::compat::span(over).first(8), over.size(), true, false}, 1));
  REQUIRE(abandoned.stats().discarding);
  REQUIRE(abandoned.stats().stored == 8);
  REQUIRE(abandoned.stats().allocated == 0);
  REQUIRE(abandoned.receive({::bridge::compat::span(over).subspan(8, 1), over.size(), false, false}, 10));
  REQUIRE_FALSE(abandoned.poll(11));
  REQUIRE(abandoned.stats().quota_refused == 0);
  REQUIRE(abandoned.stats().failed);
  REQUIRE(abandoned.stats().stored == 0);
  for (bool reenter : {false, true}) {
    ClipboardIngress *ptr = nullptr;
    ClipboardIngress owner(
        [&](auto data) {
          if (reenter)
            REQUIRE_FALSE(ptr->poll(2));
          else
            ptr->close();
          const auto failure = pdu(5, 2);
          REQUIRE(std::equal(data.begin(), data.end(), failure.begin(), failure.end()));
          return true;
        },
        8);
    ptr = &owner;
    REQUIRE(owner.receive({::bridge::compat::span(over).first(8), over.size(), true, false}, 1));
    REQUIRE_FALSE(owner.receive({::bridge::compat::span(over).subspan(8), over.size(), false, true}, 2));
    REQUIRE(owner.stats().failed == reenter);
    REQUIRE(owner.stats().quota_refused == 1);
    REQUIRE(owner.stats().allocated == 0);
  }
}
TEST_CASE("Clipboard hard maximum supports bounded classic 1600-byte fragmentation") {
  const auto data = pdu(5, 1, std::vector<std::uint8_t>(max_item_bytes));
  unsigned calls = 0;
  ClipboardIngress owner([&](auto message) {
    REQUIRE(std::equal(message.begin(), message.end(), data.begin(), data.end()));
    ++calls;
    return true;
  });
  for (std::size_t offset = 0; offset < data.size();) {
    const auto n = (std::min)(std::size_t{1600}, data.size() - offset);
    REQUIRE(owner.receive(
        {::bridge::compat::span(data).subspan(offset, n), data.size(), offset == 0, n == data.size() - offset},
        1));
    offset += n;
  }
  REQUIRE(calls == 1);
  REQUIRE(owner.stats().quota_refused == 0);
  REQUIRE(owner.stats().allocated == 0);
  REQUIRE_FALSE(owner.stats().failed);
}
