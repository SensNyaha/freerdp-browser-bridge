#include "touch.hpp"
#include <catch2/catch_test_macros.hpp>
#include <limits>
#include <stdexcept>
#include <type_traits>
#include <vector>
using namespace bridge::touch;
static_assert(!std::is_copy_constructible_v<State> && !std::is_move_constructible_v<State>);
namespace {
struct Fixture {
  State state;
  std::vector<Event> sent;
  State::Sink sink = [this](const auto &event) {
    sent.push_back(event);
    return true;
  };
  Result apply(Event event, std::uint32_t width = 1920, std::uint32_t height = 1080) {
    return state.apply(event, sink, width, height);
  }
};
} // namespace
TEST_CASE("Touch validates bounds and transitions before dispatch") {
  Fixture f;
  for (const auto event : {Event{static_cast<Action>(255), 0, 0, 0},
                           {Action::begin, 0x80000000U, 0, 0},
                           {Action::begin, 0, 7680, 0},
                           {Action::begin, 0, 0, 4320},
                           {Action::update, 1, 1, 1},
                           {Action::end, 1, 1, 1},
                           {Action::cancel, 1, 1, 1}})
    REQUIRE(f.apply(event) == Result::invalid);
  for (const auto dimensions : {std::array<std::uint32_t, 2>{0, 1}, {1, 0}, {7681, 1}, {1, 4321}})
    REQUIRE(f.apply({Action::begin, 1, 1, 1}, dimensions[0], dimensions[1]) == Result::invalid);
  REQUIRE(f.state.apply({Action::begin, 1, 1, 1}, {}, 1, 1) == Result::invalid);
  REQUIRE(f.sent.empty());
  REQUIRE(f.state.active() == 0);
  REQUIRE_FALSE(f.state.cleanup_required());
  REQUIRE(f.apply({Action::begin, 0x7fffffffU, 7679, 4319}, 7680, 4320) == Result::accepted);
  REQUIRE(f.sent.back() == Event{Action::begin, 0x7fffffffU, 7679, 4319});
}
TEST_CASE("Touch clamps desktop positions and updates before the terminal transition") {
  Fixture f;
  REQUIRE(f.apply({Action::begin, 7, 7679, 4319}) == Result::accepted);
  REQUIRE(f.sent.back() == Event{Action::begin, 7, 1919, 1079});
  REQUIRE(f.apply({Action::begin, 7, 10, 10}) == Result::invalid);
  REQUIRE(f.sent.size() == 1);
  REQUIRE(f.apply({Action::update, 7, 40, 50}) == Result::accepted);
  REQUIRE(f.apply({Action::end, 7, 80, 90}) == Result::accepted);
  REQUIRE(f.sent == std::vector<Event>{{Action::begin, 7, 1919, 1079},
                                       {Action::update, 7, 40, 50},
                                       {Action::update, 7, 80, 90},
                                       {Action::end, 7, 80, 90}});
  REQUIRE(f.state.active() == 0);
  REQUIRE(f.apply({Action::end, 7, 80, 90}) == Result::invalid);
  REQUIRE(f.apply({Action::begin, 7, 80, 90}) == Result::accepted);
  REQUIRE(f.apply({Action::end, 7, 80, 90}) == Result::accepted);
  REQUIRE(f.sent.size() == 6); // Unchanged terminal coordinates need no extra UPDATE.
}
TEST_CASE("Ten simultaneous contacts are bounded and independent") {
  Fixture f;
  for (std::uint32_t id = 0; id < State::max_contacts; ++id)
    REQUIRE(f.apply({Action::begin, id, id * 10, id * 20}) == Result::accepted);
  REQUIRE(f.state.active() == State::max_contacts);
  REQUIRE(f.apply({Action::begin, 100, 0, 0}) == Result::full);
  REQUIRE(f.sent.size() == State::max_contacts);
  REQUIRE(f.apply({Action::update, 6, 201, 203}) == Result::accepted);
  REQUIRE(f.apply({Action::end, 3, 30, 60}) == Result::accepted);
  REQUIRE(f.apply({Action::begin, 100, 100, 101}) == Result::accepted);
  REQUIRE(f.state.active() == State::max_contacts);
  REQUIRE(f.state.release(f.sink));
  REQUIRE(f.state.active() == 0);
  REQUIRE(f.sent.size() == 23);
  REQUIRE(f.sent[16] == Event{Action::cancel, 100, 100, 101});
  REQUIRE(f.sent[19] == Event{Action::cancel, 6, 201, 203});
  REQUIRE(f.state.release(f.sink));
  REQUIRE(f.sent.size() == 23);
}
TEST_CASE("Cancellation uses the last contact position without a new engagement update") {
  Fixture f;
  REQUIRE(f.apply({Action::begin, 1, 40, 60}) == Result::accepted);
  REQUIRE(f.apply({Action::cancel, 1, 500, 700}) == Result::accepted);
  REQUIRE(f.sent.back() == Event{Action::cancel, 1, 40, 60});
  REQUIRE(f.sent.size() == 2);
  REQUIRE(f.state.active() == 0);
}
TEST_CASE("Failed begin retains uncertain state and gates input until cleanup succeeds") {
  Fixture f;
  REQUIRE(f.state.apply(
              {Action::begin, 42, 11, 12}, [](const auto &) { return false; }, 1920, 1080) ==
          Result::failed);
  REQUIRE(f.state.active() == 1);
  REQUIRE(f.state.cleanup_required());
  REQUIRE(f.apply({Action::begin, 43, 0, 0}) == Result::cleanup_required);
  REQUIRE(f.apply({Action::update, 42, 90, 100}) == Result::cleanup_required);
  REQUIRE(f.sent.empty());
  REQUIRE_FALSE(f.state.release({}));
  REQUIRE(f.state.active() == 1);
  REQUIRE(f.state.release(f.sink));
  REQUIRE(f.sent == std::vector<Event>{{Action::cancel, 42, 11, 12}});
  REQUIRE_FALSE(f.state.cleanup_required());
  REQUIRE(f.apply({Action::begin, 43, 0, 0}) == Result::accepted);
}
TEST_CASE("Failed final UPDATE and UP preserve contacts for cancellation without replay") {
  for (const auto failure : {Action::update, Action::end}) {
    Fixture f;
    REQUIRE(f.apply({Action::begin, 1, 5, 6}) == Result::accepted);
    std::vector<Event> attempts;
    REQUIRE(f.state.apply(
                {Action::end, 1, 10, 20},
                [&](const auto &event) {
                  attempts.push_back(event);
                  return event.action != failure;
                },
                1920, 1080) == Result::failed);
    REQUIRE(attempts.size() == (failure == Action::update ? 1 : 2));
    REQUIRE(attempts.front() == Event{Action::update, 1, 10, 20});
    REQUIRE(f.state.active() == 1);
    REQUIRE(f.state.cleanup_required());
    REQUIRE(f.state.release(f.sink));
    REQUIRE(f.sent.back() == Event{Action::cancel, 1, 10, 20});
    REQUIRE(f.sent.size() == 2);
    REQUIRE(f.state.active() == 0);
  }
}
TEST_CASE("Failed cancellation retains only unsuccessful contacts and attempts all others") {
  Fixture f;
  for (std::uint32_t id = 0; id < 3; ++id)
    REQUIRE(f.apply({Action::begin, id, id + 10, id + 20}) == Result::accepted);
  std::vector<Event> attempts;
  REQUIRE_FALSE(f.state.release([&](const auto &event) {
    attempts.push_back(event);
    return event.id != 1;
  }));
  REQUIRE(attempts == std::vector<Event>{{Action::cancel, 0, 10, 20},
                                         {Action::cancel, 1, 11, 21},
                                         {Action::cancel, 2, 12, 22}});
  REQUIRE(f.state.active() == 1);
  REQUIRE(f.state.cleanup_required());
  REQUIRE(f.state.release(f.sink));
  REQUIRE(f.sent.back() == Event{Action::cancel, 1, 11, 21});
  REQUIRE(f.state.active() == 0);
  REQUIRE_FALSE(f.state.cleanup_required());
}
TEST_CASE("Sink exceptions fail closed and cannot erase active contacts") {
  Fixture f;
  const State::Sink throws = [](const auto &) -> bool { throw std::runtime_error("fixture"); };
  REQUIRE(f.state.apply({Action::begin, 1, 3, 4}, throws, 1920, 1080) == Result::failed);
  REQUIRE_FALSE(f.state.release(throws));
  REQUIRE(f.state.active() == 1);
  REQUIRE(f.state.release(f.sink));
  REQUIRE(f.sent.back() == Event{Action::cancel, 1, 3, 4});
}
TEST_CASE("Contact reuse has no cumulative storage or stale transitions") {
  State state;
  std::uint32_t calls = 0;
  const State::Sink sink = [&](const auto &) {
    ++calls;
    return true;
  };
  for (std::uint32_t cycle = 0; cycle < 1000; ++cycle) {
    for (std::uint32_t id = 0; id < State::max_contacts; ++id)
      REQUIRE(state.apply({Action::begin, id, cycle, cycle}, sink, 1920, 1080) == Result::accepted);
    REQUIRE(state.active() == State::max_contacts);
    REQUIRE(state.release(sink));
    REQUIRE(state.active() == 0);
  }
  REQUIRE(calls == 20000);
}
TEST_CASE("Abandonment clears only local ownership after channel loss") {
  Fixture f;
  REQUIRE(f.apply({Action::begin, 1, 10, 20}) == Result::accepted);
  f.state.abandon();
  REQUIRE(f.state.active() == 0);
  REQUIRE_FALSE(f.state.cleanup_required());
  REQUIRE(f.sent.size() == 1);
  REQUIRE(f.apply({Action::update, 1, 10, 20}) == Result::invalid);
  REQUIRE(f.state.release(f.sink));
  REQUIRE(f.sent.size() == 1);
}
