#include "delete_window.hpp"
#include <catch2/catch_test_macros.hpp>
#include <array>

using namespace bridge::files;

TEST_CASE("Directory removal completion only joins a known-empty namespace on the same authority") {
  unsigned attempts = 0, inspections = 0, yields = 0;
  const auto status = detail::finish_directory_removal(EntryKind::directory,
      [&] { return ++attempts == 3 ? Status::ok : Status::not_empty; },
      [&] { ++inspections;return EmptyResult{Status::ok, true}; },
      [&] { ++yields; }, [] { return true; });
  REQUIRE(status == Status::ok);
  REQUIRE(attempts == 3);
  REQUIRE(inspections == 2);
  REQUIRE(yields == 2);

  for (const auto contents : std::array{EmptyResult{Status::ok, false},
                                      EmptyResult{Status::denied, false},
                                      EmptyResult{Status::io, true}}) {
    attempts = inspections = yields = 0;
    REQUIRE(detail::finish_directory_removal(EntryKind::directory,
        [&] { ++attempts;return Status::not_empty; },
        [&] { ++inspections;return contents; }, [&] { ++yields; },
        [] { return true; }) == Status::not_empty);
    REQUIRE(attempts == 1);
    REQUIRE(inspections == 1);
    REQUIRE(yields == 0);
  }
}

TEST_CASE("Directory removal completion preserves refusal classes and never retries files") {
  for (const auto failure : {Status::ok, Status::invalid, Status::denied, Status::missing,
                             Status::exists, Status::disk_full, Status::unavailable,
                             Status::io, Status::busy}) {
    unsigned attempts = 0, inspections = 0, yields = 0;
    REQUIRE(detail::finish_directory_removal(EntryKind::directory,
        [&] { ++attempts;return failure; },
        [&] { ++inspections;return EmptyResult{Status::ok, true}; },
        [&] { ++yields; }, [] { return true; }) == failure);
    REQUIRE(attempts == 1);
    REQUIRE(inspections == 0);
    REQUIRE(yields == 0);
  }
  unsigned attempts = 0;
  REQUIRE(detail::finish_directory_removal(EntryKind::file,
      [&] { ++attempts;return Status::not_empty; },
      [] { FAIL("A file must not be enumerated as a directory");return EmptyResult{}; },
      [] { FAIL("A file removal must not yield"); },
      [] { FAIL("A file removal must not start a completion window");return true; }) == Status::not_empty);
  REQUIRE(attempts == 1);
}

TEST_CASE("Directory removal completion retains the original failure at its attempt or time bound") {
  unsigned attempts = 0;
  REQUIRE(detail::finish_directory_removal(EntryKind::directory,
      [&] { ++attempts;return Status::not_empty; },
      [] { return EmptyResult{Status::ok, true}; }, [] {},
      [] { return true; }) == Status::not_empty);
  REQUIRE(attempts == 1 + detail::maximum_directory_remove_retries);

  for (const unsigned expires_at : {0U, 1U, 2U}) {
    attempts = 0;
    unsigned tick = 0;
    REQUIRE(detail::finish_directory_removal(EntryKind::directory,
        [&] { ++attempts;return Status::not_empty; },
        [] { return EmptyResult{Status::ok, true}; }, [&] { ++tick; },
        [&] { return tick < expires_at; }) == Status::not_empty);
    REQUIRE(attempts == (expires_at == 0 ? 1U : expires_at));
    REQUIRE(tick == expires_at);
  }
  attempts = 0;
  bool alive = true;
  REQUIRE(detail::finish_directory_removal(EntryKind::directory,
      [&] { ++attempts;return Status::not_empty; },
      [&] { alive = false;return EmptyResult{Status::ok, true}; },
      [] { FAIL("Enumeration exhausted the deadline"); },
      [&] { return alive; }) == Status::not_empty);
  REQUIRE(attempts == 1);
}
