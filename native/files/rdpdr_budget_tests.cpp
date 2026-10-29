#include "rdpdr_budget.hpp"
#include <catch2/catch_test_macros.hpp>
#include <limits>
using namespace bridge::files::rdpdr;
TEST_CASE("RDPDR write ledger bounds metadata count before borrowing another payload") {
  WriteBudget budget;
  std::array<int, maximum_pending_writes + 1> tokens{};
  std::array<std::uintptr_t, maximum_pending_writes> tickets{};
  std::uint8_t data = 0;
  for (std::size_t i = 0; i < tickets.size(); ++i) {
    const auto ticket = budget.admit(&tokens[i], &data, 1, 1);REQUIRE(ticket);
    tickets[i] = *ticket;
  }
  REQUIRE(budget.stats().pending == maximum_pending_writes);
  REQUIRE_FALSE(budget.admit(&tokens.back(), &data, 1, 1));
  REQUIRE(budget.stats().pending == maximum_pending_writes);
  REQUIRE(budget.stats().failed);
  for (const auto ticket : tickets) REQUIRE(budget.complete(ticket, 1, 1, 2));
  REQUIRE(budget.stats().pending == 0);REQUIRE(budget.stats().bytes == 0);
}
TEST_CASE("RDPDR write ledger bounds aggregate bytes independently of ticket count") {
  WriteBudget budget;
  std::array<int, 9> tokens{};
  std::uint8_t data = 0; // Scalar ledger never reads or owns payload bytes.
  for (std::size_t i = 0; i < 8; ++i) REQUIRE(budget.admit(&tokens[i], &data, maximum_packet_bytes, 5));
  REQUIRE(budget.stats().bytes == maximum_pending_bytes);
  REQUIRE_FALSE(budget.admit(&tokens.back(), &data, 1, 5));
  REQUIRE(budget.stats().bytes == maximum_pending_bytes);
  REQUIRE(budget.stats().peak_bytes == maximum_pending_bytes);
  budget.stop();
  for (unsigned i = 0; i < 8; ++i) REQUIRE(budget.cancel_after_join());
  REQUIRE_FALSE(budget.cancel_after_join());REQUIRE(budget.stats().pending == 0);
}
TEST_CASE("RDPDR write ledger charges allocated stream capacity rather than the shorter reused payload") {
  WriteBudget budget;std::array<std::uint8_t, 9> data{};
  for (std::size_t i = 0; i < 8; ++i)
    REQUIRE(budget.admit(&data[i], data.data(), 1, 1, maximum_packet_bytes));
  REQUIRE(budget.stats().bytes == maximum_pending_bytes);
  REQUIRE_FALSE(budget.admit(&data.back(), data.data(), 1, 1));
  budget.stop();
  for (unsigned i = 0; i < 8; ++i) {
    const auto item = budget.cancel_after_join();REQUIRE(item);
    REQUIRE(item->bytes == 1);REQUIRE(item->capacity == maximum_packet_bytes);
  }
  REQUIRE(budget.stats().bytes == 0);
}
TEST_CASE("RDPDR tickets do not inherit upstream stream pointer reuse or mismatched completion credit") {
  WriteBudget budget;
  std::uint8_t data = 12;
  const auto first = budget.admit(&data, &data, 1, 1);REQUIRE(first);
  const auto done = budget.complete(*first, 1, 1, 2);REQUIRE(done);
  REQUIRE(done->token == &data);REQUIRE(done->data == &data);
  const auto second = budget.admit(&data, &data, 1, 3);REQUIRE(second);
  REQUIRE(*second > *first);
  REQUIRE_FALSE(budget.complete(*first, 1, 1, 4));
  REQUIRE(budget.stats().pending == 1);
  REQUIRE_FALSE(budget.complete(*second, 1, 2, 5));
  REQUIRE(budget.stats().pending == 1);
  REQUIRE(budget.complete(*second, 1, 1, 6));
  REQUIRE(budget.stats().pending == 0);
}
TEST_CASE("RDPDR stop, deadlines and backwards time retain debt until an acknowledged or joined completion") {
  WriteBudget budget;
  std::array<std::uint8_t, 2> tokens{};
  REQUIRE(budget.admit(&tokens[0], tokens.data(), 1, 1));
  const auto second = budget.admit(&tokens[1], tokens.data(), 1, 5000);REQUIRE(second);
  REQUIRE(budget.poll(10000));
  REQUIRE_FALSE(budget.poll(10001)); // Later writes never extend the oldest deadline.
  REQUIRE(budget.stats().pending == 2);
  REQUIRE(budget.complete(*second, 1, 1, 10002)); // Known late callback still joins.
  budget.stop();REQUIRE(budget.cancel_after_join());
  REQUIRE_FALSE(budget.cancel_after_join());
  WriteBudget backwards;
  const auto ticket = backwards.admit(tokens.data(), tokens.data(), 1, 9);REQUIRE(ticket);
  REQUIRE_FALSE(backwards.poll(8));REQUIRE(backwards.stats().pending == 1);
  REQUIRE(backwards.complete(*ticket, 1, 1, 10));
}
TEST_CASE("RDPDR invalid admission and definitive host refusal cannot undercharge another write") {
  std::uint8_t data = 0;
  for (const auto size : {std::size_t{0}, maximum_packet_bytes + 1}) {
    WriteBudget budget;REQUIRE_FALSE(budget.admit(&data, &data, size, 1));
    REQUIRE(budget.stats().failed);REQUIRE(budget.stats().pending == 0);
  }
  WriteBudget duplicate;
  const auto ticket = duplicate.admit(&data, &data, 1, 1);REQUIRE(ticket);
  REQUIRE_FALSE(duplicate.admit(&data, &data, 1, 2));
  REQUIRE(duplicate.refused(*ticket));REQUIRE(duplicate.stats().bytes == 0);
  WriteBudget overflow;
  REQUIRE_FALSE(overflow.admit(&data, &data, 1, (std::numeric_limits<std::uint64_t>::max)()));
  REQUIRE(overflow.stats().pending == 0);
  WriteBudget stop;
  stop.stop();REQUIRE_FALSE(stop.admit(&data, &data, 1, 1));
  REQUIRE_FALSE(stop.stats().failed);
}
