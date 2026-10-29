#include "quota.hpp"
#include <catch2/catch_test_macros.hpp>
#include <future>
#include <limits>
#include <vector>
using namespace bridge::files;
namespace {
FileQuota budget(std::uint64_t bytes, std::uint64_t file_bytes, std::uint32_t entries) {
  auto [status, quota] = FileQuota::create({bytes, file_bytes, entries});
  REQUIRE(status == QuotaStatus::ok);
  return std::move(quota);
}
void usage(const FileQuota &quota, std::uint64_t bytes, std::uint64_t reserved,
           std::uint32_t entries) {
  const auto value = quota.snapshot();
  REQUIRE(value.status == QuotaStatus::ok);
  REQUIRE(value.bytes == bytes);
  REQUIRE(value.reserved_bytes == reserved);
  REQUIRE(value.entries == entries);
}
} // namespace

TEST_CASE("File quota admits finite exact entry per-file and shared byte boundaries") {
  auto quota = budget(10, 8, 2);
  auto first = quota.acquire(8);
  REQUIRE(first.status == QuotaStatus::ok);
  REQUIRE(quota.acquire(3).status == QuotaStatus::limit);
  REQUIRE(quota.acquire(9).status == QuotaStatus::limit);
  auto second = quota.acquire(2);
  REQUIRE(second.status == QuotaStatus::ok);
  REQUIRE(quota.acquire().status == QuotaStatus::limit);
  usage(quota, 10, 0, 2);
  REQUIRE(first.allocation.release() == QuotaStatus::ok);
  REQUIRE(first.allocation.release() == QuotaStatus::ok);
  REQUIRE(first.allocation.reserve_size(1).status == QuotaStatus::retired);
  usage(quota, 2, 0, 1);
  REQUIRE(second.allocation.release() == QuotaStatus::ok);
  usage(quota, 0, 0, 0);
  auto empty = budget(0, 0, 1);
  auto directory = empty.acquire();
  REQUIRE(directory.status == QuotaStatus::ok);
  REQUIRE(directory.allocation.reserve_size(1).status == QuotaStatus::limit);
  REQUIRE(empty.acquire().status == QuotaStatus::limit);
  auto disabled = budget(0, 0, 0);
  REQUIRE(disabled.acquire().status == QuotaStatus::limit);
}

TEST_CASE("File quota reserves before growth and settles only verified partial IO or shrink") {
  auto quota = budget(100, 80, 2);
  auto first = quota.acquire(20), second = quota.acquire(10);
  REQUIRE(first.status == QuotaStatus::ok);
  REQUIRE(second.status == QuotaStatus::ok);
  auto grow = first.allocation.reserve_size(80);
  REQUIRE(grow.status == QuotaStatus::ok);
  usage(quota, 90, 60, 2);
  REQUIRE(first.allocation.reserve_size(1).status == QuotaStatus::busy);
  REQUIRE(first.allocation.release() == QuotaStatus::busy);
  REQUIRE(second.allocation.reserve_size(21).status == QuotaStatus::limit);
  REQUIRE(grow.reservation.finish(35) == QuotaStatus::ok);
  REQUIRE_FALSE(grow.reservation);
  REQUIRE(grow.reservation.finish(35) == QuotaStatus::invalid);
  usage(quota, 45, 0, 2);
  auto shrink = first.allocation.reserve_size(5);
  REQUIRE(shrink.status == QuotaStatus::ok);
  usage(quota, 45, 0, 2); // No refund before successful truncation is proved.
  REQUIRE(shrink.reservation.finish(5) == QuotaStatus::ok);
  usage(quota, 15, 0, 2);
}

TEST_CASE("Lost quota results and dropped entry owners conservatively retain physical charges") {
  auto quota = budget(10, 10, 2);
  {
    auto file = quota.acquire(2);
    REQUIRE(file.status == QuotaStatus::ok);
    {
      auto grow = file.allocation.reserve_size(10);
      REQUIRE(grow.status == QuotaStatus::ok);
      usage(quota, 10, 8, 1);
    }
    usage(quota, 10, 0, 1);
  }
  usage(quota, 10, 0, 1);
  REQUIRE(quota.acquire(1).status == QuotaStatus::limit);
  auto directory = quota.acquire();
  REQUIRE(directory.status == QuotaStatus::ok);
  REQUIRE(quota.acquire().status == QuotaStatus::limit);
}

TEST_CASE("Quota retirement joins late results without admitting replacement work") {
  auto quota = budget(10, 10, 1);
  auto file = quota.acquire(2);
  auto grow = file.allocation.reserve_size(10);
  quota.retire();
  REQUIRE(quota.snapshot().retired);
  REQUIRE(quota.acquire().status == QuotaStatus::retired);
  REQUIRE(file.allocation.reserve_size(1).status == QuotaStatus::retired);
  REQUIRE(file.allocation.release() == QuotaStatus::busy);
  REQUIRE(grow.reservation.finish(4) == QuotaStatus::ok);
  usage(quota, 4, 0, 1);
  REQUIRE(file.allocation.release() == QuotaStatus::ok);
  usage(quota, 0, 0, 0);
  QuotaAllocation orphan;
  GrowthReservation pending;
  {
    auto owner = budget(10, 10, 1);
    auto entry = owner.acquire();
    orphan = std::move(entry.allocation);
    auto reservation = orphan.reserve_size(8);
    pending = std::move(reservation.reservation);
  }
  REQUIRE(orphan.reserve_size(1).status == QuotaStatus::retired);
  REQUIRE(orphan.release() == QuotaStatus::busy);
  REQUIRE(pending.finish(3) == QuotaStatus::ok);
  REQUIRE(orphan.release() == QuotaStatus::ok);
}

TEST_CASE("Quota move operations transfer authority and settle displaced reservations conservatively") {
  auto first = budget(10, 10, 1), second = budget(20, 20, 1);
  auto a = first.acquire(2), b = second.acquire(3);
  auto x = a.allocation.reserve_size(10), y = b.allocation.reserve_size(20);
  x.reservation = std::move(y.reservation);
  REQUIRE_FALSE(y.reservation);
  usage(first, 10, 0, 1);
  usage(second, 20, 17, 1);
  auto moved = std::move(x.reservation);
  REQUIRE_FALSE(x.reservation);
  REQUIRE(moved.finish(7) == QuotaStatus::ok);
  usage(second, 7, 0, 1);
  first = std::move(second);
  REQUIRE(second.snapshot().status == QuotaStatus::invalid);
  REQUIRE(a.allocation.reserve_size(1).status == QuotaStatus::retired);
  usage(first, 7, 0, 1);
  REQUIRE(b.allocation.release() == QuotaStatus::ok);
}

TEST_CASE("Impossible quota completion retires the authority without refunding admitted capacity") {
  auto quota = budget(10, 10, 1);
  auto entry = quota.acquire(2);
  auto pending = entry.allocation.reserve_size(8);
  REQUIRE(pending.reservation.finish(9) == QuotaStatus::invalid);
  REQUIRE(quota.snapshot().retired);
  usage(quota, 8, 6, 1);
  REQUIRE(quota.acquire().status == QuotaStatus::retired);
  REQUIRE(pending.reservation.finish(5) == QuotaStatus::ok);
  usage(quota, 5, 0, 1);
}

TEST_CASE("Concurrent quota producers cannot duplicate byte or entry capacity") {
  for (const bool byte_limit : {false, true}) {
    auto quota = budget(100, 100, 8);
    std::promise<void> ready;
    auto start = ready.get_future().share();
    std::vector<std::future<AllocationResult>> jobs;
    for (unsigned i = 0; i < 32; ++i)
      jobs.push_back(std::async(std::launch::async, [&] {
        start.wait();
        return quota.acquire(byte_limit ? 30 : 0);
      }));
    ready.set_value();
    unsigned admitted = 0;
    std::vector<QuotaAllocation> owned;
    for (auto &job : jobs) {
      auto result = job.get();
      REQUIRE((result.status == QuotaStatus::ok || result.status == QuotaStatus::limit));
      if (result.status == QuotaStatus::ok) {
        ++admitted;
        owned.push_back(std::move(result.allocation));
      }
    }
    REQUIRE(admitted == (byte_limit ? 3U : 8U));
    usage(quota, byte_limit ? 90 : 0, 0, admitted);
    for (auto &entry : owned)
      REQUIRE(entry.release() == QuotaStatus::ok);
    usage(quota, 0, 0, 0);
  }
}

TEST_CASE("Quota bounds refuse integer overflow and invalid policies before allocation") {
  constexpr auto maximum = static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max());
  REQUIRE(FileQuota::create({maximum + 1, 1, 1}).first == QuotaStatus::invalid);
  REQUIRE(FileQuota::create({1, 2, 1}).first == QuotaStatus::invalid);
  REQUIRE(FileQuota::create({1, 1, maximum_quota_entries + 1}).first == QuotaStatus::invalid);
  auto quota = budget(maximum, maximum, 2);
  auto file = quota.acquire(maximum);
  REQUIRE(file.status == QuotaStatus::ok);
  REQUIRE(quota.acquire(1).status == QuotaStatus::limit);
  REQUIRE(file.allocation.reserve_size(std::numeric_limits<std::uint64_t>::max()).status == QuotaStatus::limit);
  usage(quota, maximum, 0, 1);
  FileQuota absent;
  REQUIRE(absent.acquire().status == QuotaStatus::invalid);
  QuotaAllocation empty;
  REQUIRE(empty.release() == QuotaStatus::invalid);
  REQUIRE(empty.reserve_size(1).status == QuotaStatus::invalid);
  GrowthReservation none;
  REQUIRE(none.finish(0) == QuotaStatus::invalid);
}
