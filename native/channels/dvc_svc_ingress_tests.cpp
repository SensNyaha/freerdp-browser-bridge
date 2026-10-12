#include "dvc_svc_ingress.hpp"
#include <algorithm>
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <stdexcept>
#include <vector>
using namespace bridge::channels;
namespace {
constexpr std::uint8_t packet[]{0x20, 0x42, 3, 10, 11, 12};
}

TEST_CASE("SVC ingress forwards complete borrowed packets without allocating or changing producer "
          "bytes") {
  unsigned calls = 0;
  DvcSvcIngress ingress([&](auto bytes) {
    ++calls;
    REQUIRE(bytes.data() == packet);
    REQUIRE(std::equal(bytes.begin(), bytes.end(), std::begin(packet), std::end(packet)));
    return true;
  });
  REQUIRE(ingress.receive({packet, sizeof(packet), true, true}, 100));
  REQUIRE(ingress.stats().forwarded == 1);
  REQUIRE(ingress.stats().allocated_bytes == 0);
  REQUIRE(ingress.stats().stored_bytes == 0);
  REQUIRE(calls == 1);
  ingress.close();
  REQUIRE_FALSE(ingress.receive({packet, sizeof(packet), true, true}, 100));
  REQUIRE(calls == 1);
  REQUIRE_FALSE(ingress.stats().failed);
}

TEST_CASE("SVC ingress owns one bounded fragmented message and releases storage after synchronous "
          "forwarding") {
  for (std::size_t split = 1; split <= sizeof(packet); ++split) {
    unsigned calls = 0;
    DvcSvcIngress ingress([&](auto bytes) {
      ++calls;
      REQUIRE(std::equal(bytes.begin(), bytes.end(), std::begin(packet), std::end(packet)));
      return true;
    });
    const auto data = std::span(packet);
    REQUIRE(ingress.receive({data.first(split), data.size(), true, false}, 1));
    REQUIRE(calls == 0);
    REQUIRE(ingress.stats().stored_bytes == split);
    REQUIRE(ingress.stats().allocated_bytes == sizeof(packet));
    REQUIRE(ingress.receive({data.subspan(split), data.size(), false, true}, 2));
    REQUIRE(calls == 1);
    REQUIRE(ingress.stats().allocated_bytes == 0);
    REQUIRE_FALSE(ingress.stats().partial);
  }
}

TEST_CASE("SVC ingress refuses outer advertised sizes before allocation and inner claims before "
          "host dispatch") {
  unsigned calls = 0;
  DvcAllocationLimits limits;
  limits.encoded_bytes = 16;
  for (const auto total : {std::size_t{0}, std::size_t{17}, std::size_t{0xffffffffU}}) {
    DvcSvcIngress ingress(
        [&](auto) {
          ++calls;
          return true;
        },
        limits);
    REQUIRE_FALSE(ingress.receive({packet, total, true, false}, 0));
    REQUIRE(ingress.stats().allocated_bytes == 0);
    REQUIRE(ingress.stats().rejected == 1);
  }
  const std::uint8_t huge[]{0x2f, 0x42, 0, 0, 0, 255, 255, 255, 255};
  DvcSvcIngress ingress([&](auto) {
    ++calls;
    return true;
  });
  REQUIRE_FALSE(ingress.receive({huge, sizeof(huge), true, true}, 0));
  REQUIRE(ingress.stats().allocated_bytes == 0);
  REQUIRE(calls == 0);
  REQUIRE(ingress.stats().failed);
}

TEST_CASE("SVC ingress refuses total changes duplicate first early last overflow and nonterminal "
          "zero progress") {
  for (unsigned mode = 0; mode < 5; ++mode) {
    unsigned calls = 0;
    DvcSvcIngress ingress([&](auto) {
      ++calls;
      return true;
    });
    const auto data = std::span(packet);
    REQUIRE(ingress.receive({data.first(2), data.size(), true, false}, 0));
    DvcSvcFragment fragment{data.subspan(2), data.size(), false, true};
    if (mode == 0)
      ++fragment.total_bytes;
    if (mode == 1)
      fragment.first = true;
    if (mode == 2)
      fragment.bytes = data.subspan(2, 1);
    if (mode == 3)
      fragment.bytes = data;
    if (mode == 4) {
      fragment.bytes = {};
      fragment.last = false;
    }
    REQUIRE_FALSE(ingress.receive(fragment, 1));
    REQUIRE(calls == 0);
    REQUIRE(ingress.stats().allocated_bytes == 0);
    REQUIRE(ingress.stats().stored_bytes == 0);
    REQUIRE(ingress.stats().failed);
  }
}

TEST_CASE("SVC ingress abandoned deadline never extends on progress and applies before a late "
          "final fragment") {
  for (const bool finish : {false, true}) {
    unsigned calls = 0;
    DvcSvcIngress ingress(
        [&](auto) {
          ++calls;
          return true;
        },
        {}, 20);
    const auto data = std::span(packet);
    REQUIRE(ingress.receive({data.first(1), data.size(), true, false}, 10));
    REQUIRE(ingress.receive({data.subspan(1, 1), data.size(), false, false}, 29));
    REQUIRE(ingress.poll(29));
    if (finish)
      REQUIRE_FALSE(ingress.receive({data.subspan(2), data.size(), false, true}, 30));
    else
      REQUIRE_FALSE(ingress.poll(30));
    REQUIRE(ingress.stats().abandoned == 1);
    REQUIRE(ingress.stats().rejected == 1);
    REQUIRE(ingress.stats().allocated_bytes == 0);
    REQUIRE(calls == 0);
  }
  for (const auto now : {std::uint64_t{9}, (std::numeric_limits<std::uint64_t>::max)()}) {
    DvcSvcIngress ingress([](auto) { return true; });
    REQUIRE(ingress.poll(10));
    REQUIRE_FALSE(ingress.receive({packet, sizeof(packet), true, true}, now));
    REQUIRE(ingress.stats().failed);
  }
}

TEST_CASE(
    "SVC ingress preserves an active borrowed span through reentrant close failure or receive") {
  for (unsigned mode = 0; mode < 3; ++mode) {
    unsigned calls = 0;
    DvcSvcIngress *owner = nullptr;
    DvcSvcIngress ingress([&](auto bytes) -> bool {
      ++calls;
      if (mode == 0)
        owner->close();
      else
        REQUIRE_FALSE(owner->receive({packet, sizeof(packet), true, true}, 1));
      REQUIRE(owner->stats().dispatching);
      REQUIRE(owner->stats().stored_bytes == sizeof(packet));
      REQUIRE(std::equal(bytes.begin(), bytes.end(), std::begin(packet), std::end(packet)));
      if (mode == 2)
        throw std::runtime_error("Private provider detail");
      return true;
    });
    owner = &ingress;
    const auto data = std::span(packet);
    REQUIRE(ingress.receive({data.first(2), data.size(), true, false}, 0));
    REQUIRE_FALSE(ingress.receive({data.subspan(2), data.size(), false, true}, 1));
    REQUIRE(calls == 1);
    REQUIRE(ingress.stats().allocated_bytes == 0);
    REQUIRE(ingress.stats().forwarded == 0);
    REQUIRE(ingress.stats().rejected == (mode == 0 ? 0 : 1));
  }
}

TEST_CASE("SVC ingress provider false or exception retires once without replay and constructor "
          "policy is bounded") {
  REQUIRE_THROWS(DvcSvcIngress({}));
  REQUIRE_THROWS(DvcSvcIngress([](auto) { return true; }, {}, 0));
  REQUIRE_THROWS(DvcSvcIngress([](auto) { return true; }, {}, 5001));
  for (const bool throws : {false, true}) {
    unsigned calls = 0;
    DvcSvcIngress ingress([&](auto) -> bool {
      ++calls;
      if (throws)
        throw std::runtime_error("Private provider detail");
      return false;
    });
    REQUIRE_FALSE(ingress.receive({packet, sizeof(packet), true, true}, 0));
    REQUIRE_FALSE(ingress.receive({packet, sizeof(packet), true, true}, 1));
    REQUIRE(calls == 1);
    REQUIRE(ingress.stats().rejected == 1);
    REQUIRE(ingress.stats().allocated_bytes == 0);
  }
}
