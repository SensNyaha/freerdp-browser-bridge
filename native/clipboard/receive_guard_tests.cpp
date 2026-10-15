#include "test_host.hpp"
using namespace bridge::clipboard;
using namespace bridge::clipboard::test;
TEST_CASE("Actual pinned CLIPRDR receives guarded capabilities monitor and bounded long names") {
  Host h;
  REQUIRE(h.send(record(7, 0, long_caps)));
  REQUIRE(h.capabilities == 1);
  REQUIRE(h.send(record(1, 0)));
  REQUIRE(h.monitors == 1);
  const auto list = record(2, 0, {13, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0});
  for (std::size_t split = 1; split < list.size(); ++split) {
    REQUIRE(h.send(std::span(list).first(split), CHANNEL_FLAG_FIRST, list.size()));
    REQUIRE(h.send(std::span(list).subspan(split), CHANNEL_FLAG_LAST, list.size()));
  }
  REQUIRE(h.lists == list.size() - 1);
  REQUIRE(h.format_count == 2);
  REQUIRE(h.writes.back() == record(3, 1));
  REQUIRE(h.guard->stats().allocated == 0);
}
TEST_CASE("Actual pinned CLIPRDR short format lists requests and Unicode data remain intact") {
  Host h;
  std::vector<BYTE> formats(36, 0);
  formats[0] = 13;
  REQUIRE(h.send(record(2, 0, formats)));
  REQUIRE(h.format_count == 1);
  REQUIRE(h.send(record(4, 0, {13, 0, 0, 0})));
  REQUIRE(h.requests == 1);
  REQUIRE(h.requested_format == 13);
  const std::vector<BYTE> unicode{0x16, 4, 0x3d, 0xd8, 0, 0xde, 0, 0};
  const auto data = record(5, 1, unicode);
  REQUIRE(h.send(std::span(data).first(10), CHANNEL_FLAG_FIRST, data.size()));
  REQUIRE(h.responses == 0);
  REQUIRE(h.send(std::span(data).subspan(10), CHANNEL_FLAG_LAST, data.size()));
  REQUIRE(h.responses == 1);
  REQUIRE(h.samples == unicode);
  REQUIRE(getChannelError(h.context.get()) == CHANNEL_RC_OK);
}
TEST_CASE("Actual pinned CLIPRDR never sees excessive table data or raw flag claims") {
  for (unsigned mode = 0; mode < 5; ++mode) {
    Host h;
    if (mode == 0)
      REQUIRE_FALSE(h.send(record(2, 0, std::vector<BYTE>(36 * 65))));
    if (mode == 1)
      REQUIRE_FALSE(h.send(std::vector<BYTE>{5, 0, 1, 0, 1, 0, 0, 1}, CHANNEL_FLAG_FIRST,
                           max_item_bytes + 9));
    if (mode == 2)
      REQUIRE_FALSE(h.send(record(1, 0), CHANNEL_FLAG_ONLY | 0x80000000U));
    if (mode == 3)
      REQUIRE_FALSE(h.send(record(7, 0, {255, 255, 0, 0})));
    if (mode == 4)
      REQUIRE_FALSE(h.guard->receive(1005, nullptr, 8, CHANNEL_FLAG_ONLY, 8, 1));
    REQUIRE(h.deliveries == 0);
    REQUIRE(h.guard->stats().failed);
    REQUIRE(h.guard->stats().allocated == 0);
    REQUIRE(getChannelError(h.context.get()) == CHANNEL_RC_OK);
  }
}
TEST_CASE("Actual pinned CLIPRDR retirement preserves active data borrow and channel identity") {
  Host h;
  const auto data = record(5, 1, {65, 0, 0, 0});
  REQUIRE(h.send(std::span(data).first(9), CHANNEL_FLAG_FIRST, data.size()));
  h.retire_during_response = true;
  REQUIRE_FALSE(h.send(std::span(data).subspan(9), CHANNEL_FLAG_LAST, data.size()));
  REQUIRE(h.samples == std::vector<BYTE>{65, 0, 0, 0});
  REQUIRE(h.guard->stats().closed);
  REQUIRE_FALSE(h.guard->stats().failed);
  REQUIRE(h.guard->stats().allocated == 0);
  Host changed;
  REQUIRE(changed.send(std::span(data).first(1), CHANNEL_FLAG_FIRST, data.size()));
  changed.resolved = 1006;
  REQUIRE_FALSE(changed.send(std::span(data).subspan(1), CHANNEL_FLAG_LAST, data.size()));
  REQUIRE(changed.deliveries == 0);
}
