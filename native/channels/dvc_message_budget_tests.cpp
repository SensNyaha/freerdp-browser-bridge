#include "dvc_message_budget.hpp"
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <stdexcept>
using namespace bridge::channels;

TEST_CASE("DVC budget charges all pending declarations before a future host dispatch") {
  DvcMessageBudget budget;
  constexpr auto message = DvcAllocationLimits::hard_message_bytes;
  for (std::uint32_t id = 0; id < 4; ++id) {
    REQUIRE(budget.reserve(id, message, 1));
    REQUIRE(budget.stats().active == id + 1);
    REQUIRE(budget.stats().reserved_bytes == (id + 1) * message);
  }
  REQUIRE_FALSE(budget.reserve(4, 1, 1));
  REQUIRE(budget.stats().failed);
  REQUIRE(budget.stats().peak_bytes == DvcMessageBudgetLimits::hard_total_bytes);
  REQUIRE(budget.stats().reserved_bytes == 0); // Host resources still require caller retirement.
  REQUIRE_FALSE(budget.reserve(4, 1, 2));
  REQUIRE(budget.stats().failures == 1);
}
TEST_CASE("DVC budget replacement charges a delta atomically without extending original deadline") {
  DvcMessageBudget budget({2, 16, 16, 100});
  REQUIRE(budget.reserve(0xffffffffU, 12, 10));
  REQUIRE(budget.reserve(0, 4, 20));
  REQUIRE(budget.reserve(0xffffffffU, 8, 40));
  REQUIRE(budget.stats().active == 2);
  REQUIRE(budget.stats().reserved_bytes == 12);
  REQUIRE(budget.deadline() == 110);
  REQUIRE(budget.reserve(0xffffffffU, 12, 100));
  REQUIRE(budget.stats().reserved_bytes == 16);
  REQUIRE(budget.stats().replacements == 2);
  REQUIRE(budget.poll(109));
  REQUIRE_FALSE(budget.poll(110));
  REQUIRE(budget.stats().abandonments == 1);
  REQUIRE_FALSE(budget.release(0xffffffffU, 110));
}
TEST_CASE("DVC budget releases observed completion once and reuses a slot with a fresh deadline") {
  DvcMessageBudget budget({1, 16, 16, 100});
  REQUIRE(budget.reserve(1, 16, 1));
  REQUIRE(budget.release(1, 50));
  REQUIRE_FALSE(budget.release(1, 50));
  REQUIRE_FALSE(budget.stats().failed);
  REQUIRE_FALSE(budget.deadline());
  REQUIRE(budget.reserve(2, 16, 70));
  REQUIRE(budget.deadline() == 170);
  REQUIRE(budget.stats().releases == 1);
  REQUIRE(budget.stats().peak_bytes == 16);
  budget.close();
  REQUIRE_FALSE(budget.stats().failed);
  REQUIRE(budget.stats().reserved_bytes == 0);
  REQUIRE_FALSE(budget.reserve(3, 1, 80));
}
TEST_CASE("DVC budget zero-length claims consume bounded slots and upper boundaries never wrap") {
  DvcMessageBudget budget;
  for (std::uint32_t id = 0; id < DvcMessageBudgetLimits::hard_slots; ++id)
    REQUIRE(budget.reserve(id, 0, 1));
  REQUIRE(budget.stats().reserved_bytes == 0);
  REQUIRE_FALSE(budget.reserve(32, 0, 1));
  REQUIRE(budget.stats().failed);
  DvcMessageBudget huge;
  REQUIRE_FALSE(huge.reserve(0, (std::numeric_limits<std::size_t>::max)(), 1));
  REQUIRE(huge.stats().reservations == 0);
  DvcMessageBudget invalid_clock;
  REQUIRE_FALSE(invalid_clock.reserve(0, 1, (std::numeric_limits<std::uint64_t>::max)()));
  REQUIRE(invalid_clock.stats().active == 0);
  DvcMessageBudget backwards;
  REQUIRE(backwards.reserve(0, 1, 10));
  REQUIRE_FALSE(backwards.release(0, 9));
  REQUIRE(backwards.stats().failed);
}
TEST_CASE(
    "DVC budget rejects unsupported policies and preserves exact boundaries in reduced policies") {
  for (const auto policy : {DvcMessageBudgetLimits{0, 16, 16, 100},
                            {33, 16, 16, 100},
                            {1, 0, 1, 100},
                            {1, 16, 0, 100},
                            {1, 16, 17, 100},
                            {1, 16, 16, 0},
                            {1, 16, 16, 10001},
                            {1, DvcMessageBudgetLimits::hard_total_bytes + 1, 16, 100},
                            {1, DvcMessageBudgetLimits::hard_total_bytes,
                             DvcAllocationLimits::hard_message_bytes + 1, 100}})
    REQUIRE_THROWS_AS(DvcMessageBudget(policy), std::invalid_argument);
  for (std::size_t limit = 1; limit <= 256; ++limit) {
    DvcMessageBudget budget({2, limit * 2, limit, 100});
    REQUIRE(budget.reserve(1, limit, 1));
    REQUIRE(budget.reserve(2, limit, 1));
    REQUIRE(budget.stats().reserved_bytes == 2 * limit);
    REQUIRE(budget.release(1, 2));
    REQUIRE(budget.stats().reserved_bytes == limit);
    REQUIRE(budget.reserve(3, limit, 2));
    REQUIRE(budget.stats().reserved_bytes == 2 * limit);
    REQUIRE_FALSE(budget.reserve(3, limit + 1, 3));
    REQUIRE(budget.stats().failures == 1);
  }
}
