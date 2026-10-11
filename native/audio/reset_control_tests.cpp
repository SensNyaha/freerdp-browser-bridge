#include "reset_control.hpp"
#include <catch2/catch_test_macros.hpp>
#include <stdexcept>
using namespace bridge::audio;
using bridge::ipc::audio::Availability;
using bridge::ipc::audio::ResetResult;

TEST_CASE("Audio reset control admits one published ready epoch and prevents repeated scheduling") {
  ResetControl control;
  unsigned calls = 0;
  const auto reset = [&] {
    ++calls;
    return true;
  };
  REQUIRE(control.enqueue(1, 1, 100, true) == ResetResult::unavailable);
  REQUIRE(control.observe({true, Availability::ready, 1, 1, 100}));
  REQUIRE(control.enqueue(2, 2, 100, true) == ResetResult::stale);
  REQUIRE(control.enqueue(3, 1, 100, false) == ResetResult::unavailable);
  REQUIRE_FALSE(control.enqueue(4, 1, 100, true));
  REQUIRE(control.pending());
  REQUIRE(control.enqueue(5, 1, 101, true) == ResetResult::busy);
  REQUIRE(calls == 0);
  const auto completion = control.service(102, true, reset);
  REQUIRE(completion);
  REQUIRE(completion->request_id == 4);
  REQUIRE(completion->result == ResetResult::scheduled);
  REQUIRE(calls == 1);
  REQUIRE_FALSE(control.pending());
  REQUIRE_FALSE(control.service(103, true, reset));
  REQUIRE(control.enqueue(6, 1, 103, true) == ResetResult::busy);
  REQUIRE(control.observe({true, Availability::waiting, 2, 2, 103}));
  REQUIRE(control.enqueue(7, 1, 104, true) == ResetResult::stale);
  REQUIRE(control.enqueue(8, 2, 104, true) == ResetResult::unavailable);
  REQUIRE(control.observe({true, Availability::ready, 3, 2, 104}));
  REQUIRE_FALSE(control.enqueue(UINT64_MAX, 2, 105, true));
  REQUIRE(control.service(106, true, reset)->request_id == UINT64_MAX);
  REQUIRE(calls == 2);
}
TEST_CASE("Audio reset control rechecks epoch availability lifetime and finite clocks on service") {
  for (unsigned mode = 0; mode < 9; ++mode) {
    ResetControl control;
    unsigned calls = 0;
    REQUIRE(control.observe({true, Availability::ready, 1, 4, 10}));
    REQUIRE_FALSE(control.enqueue(9, 4, 100, true));
    if (mode == 0)
      REQUIRE(control.observe({true, Availability::ready, 2, 5, 11}));
    if (mode == 1)
      REQUIRE(control.observe({true, Availability::closed, 2, 4, 11}));
    const auto time = mode == 3 ? 100 + ResetControl::window_us : mode == 4 ? 99 : 101;
    const std::function<bool()> reset = mode == 7 ? std::function<bool()>{} : [&] {
      ++calls;
      if (mode == 6)
        throw std::runtime_error("fixture");
      return mode != 5;
    };
    const auto completion = control.service(time, mode != 2, reset);
    REQUIRE(completion);
    REQUIRE(completion->request_id == 9);
    const auto expected = mode == 0                ? ResetResult::stale
                          : mode == 3 || mode == 4 ? ResetResult::busy
                          : mode == 8              ? ResetResult::scheduled
                                                   : ResetResult::unavailable;
    REQUIRE(completion->result == expected);
    REQUIRE(calls == (mode == 5 || mode == 6 || mode == 8 ? 1U : 0U));
    REQUIRE_FALSE(control.pending());
    REQUIRE_FALSE(control.service(time, true, reset));
  }
}
TEST_CASE("Audio reset control refuses malformed observations exhaustion and deadline overflow") {
  ResetControl control;
  REQUIRE_FALSE(control.observe({true, Availability::ready, 0, 1, 1}));
  REQUIRE(control.observe({true, Availability::ready, 2, 3, 5}));
  for (const auto state : {bridge::ipc::audio::State{false, Availability::unavailable, 0, 0, 0},
                           {true, Availability::ready, 2, 3, 5},
                           {true, Availability::ready, 3, 2, 6},
                           {true, Availability::ready, 3, 3, 4},
                           {true, static_cast<Availability>(255), 3, 3, 6}})
    REQUIRE_FALSE(control.observe(state));
  REQUIRE_THROWS_AS(control.enqueue(0, 3, 10, true), bridge::ipc::ProtocolError);
  REQUIRE_THROWS_AS(control.enqueue(1, 0, 10, true), bridge::ipc::ProtocolError);
  REQUIRE(control.enqueue(1, 3, UINT64_MAX, true) == ResetResult::busy);
  REQUIRE_FALSE(control.pending());
  REQUIRE_FALSE(control.enqueue(2, 3, UINT64_MAX - ResetControl::window_us, true));
  REQUIRE(control.service(UINT64_MAX - 1, true, [] { return true; })->result ==
          ResetResult::scheduled);
  REQUIRE(control.observe({true, Availability::ready, 3, UINT64_MAX, 6}));
  REQUIRE(control.enqueue(3, UINT64_MAX, 10, true) == ResetResult::unavailable);
  REQUIRE_FALSE(control.pending());
}
