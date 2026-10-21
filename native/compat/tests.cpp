#include "bit.hpp"
#include "ranges.hpp"
#include "span.hpp"
#include "thread.hpp"
#include <atomic>
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <cstring>
#include <future>
#include <optional>
#include <vector>
namespace c = bridge::compat;
static_assert(!std::is_constructible_v<c::span<int>, const std::vector<int> &>);
static_assert(!std::is_constructible_v<c::span<int>, std::vector<int> &&>);
static_assert(std::is_constructible_v<c::span<const int>, c::span<int>>);
static_assert(!std::is_constructible_v<c::span<int>, c::span<const int>>);
static_assert(!std::is_copy_constructible_v<c::jthread>);
static_assert(!std::is_copy_assignable_v<c::jthread>);
constexpr int fixed[] = {1, 2, 3};
static_assert(c::span<const int>(fixed).subspan(1).size() == 2);

TEST_CASE(
    "Compiler compatibility borrowed views preserve storage, constness, zero lengths and offsets") {
  std::vector<int> values{1, 2, 3, 4};
  c::span mutable_view(values);
  c::span<const int> readonly = mutable_view;
  REQUIRE(readonly.data() == values.data());
  mutable_view.subspan(1, 2)[1] = 9;
  REQUIRE(values[2] == 9);
  REQUIRE(readonly.first(2).size_bytes() == 2 * sizeof(int));
  REQUIRE(readonly.last(1).front() == 4);
  REQUIRE(readonly.back() == 4);
  REQUIRE(readonly.subspan(4).empty());
  const std::array<int, 2> constant{{5, 6}};
  c::span inferred(constant);
  static_assert(std::is_const_v<std::remove_reference_t<decltype(inferred[0])>>);
  REQUIRE(inferred[1] == 6);
  c::span<int> empty;
  REQUIRE(empty.data() == nullptr);
  REQUIRE(empty.begin() == empty.end());
  REQUIRE(empty.subspan(0).empty());
  REQUIRE(empty.first(0).empty());
  REQUIRE(empty.last(0).empty());
#if !defined(__cpp_lib_span) || defined(BRIDGE_COMPAT_FORCE_FALLBACK)
  REQUIRE_THROWS_AS(mutable_view.subspan(5), std::out_of_range);
  REQUIRE_THROWS_AS(mutable_view.subspan(3, 2), std::out_of_range);
  REQUIRE_THROWS_AS(mutable_view.last(5), std::out_of_range);
  REQUIRE_THROWS_AS(empty[0], std::out_of_range);
#endif
}

namespace {
int add(int n) { return n + 7; }
} // namespace
TEST_CASE(
    "Compiler representation copy preserves function pointers and binary data without aliasing") {
  using Function = int (*)(int);
  const Function original = add;
  const auto representation = c::bit_cast<std::array<unsigned char, sizeof(Function)>>(original);
  const auto restored = c::bit_cast<Function>(representation);
  REQUIRE(restored(5) == 12);
  REQUIRE(restored == original);
  const auto number = c::bit_cast<std::uint32_t>(1.0F);
  REQUIRE(number == 0x3f800000);
  std::array<int, 3> first{{1, 2, 3}}, second{};
  c::ranges::copy(first, second.begin());
  REQUIRE(c::ranges::equal(first, second));
  REQUIRE_FALSE(c::ranges::equal(first, c::span(second).first(2)));
  REQUIRE(c::ranges::find(first, 2) == first.begin() + 1);
  REQUIRE(c::ranges::all_of(first, [](int n) { return n > 0; }));
  REQUIRE(c::ranges::any_of(first, [](int n) { return n == 2; }));
}

TEST_CASE("Compiler joining thread retains shared stop authority through moves and joins before "
          "destruction") {
  std::atomic<bool> completed{false};
  c::stop_token observed;
  {
    c::jthread source([&](c::stop_token token) {
      while (!token.stop_requested())
        std::this_thread::yield();
      completed = true;
    });
    observed = source.get_stop_token();
    c::jthread destination = std::move(source);
    REQUIRE_FALSE(source.joinable());
    REQUIRE(destination.joinable());
    REQUIRE_FALSE(observed.stop_requested());
  }
  REQUIRE(completed.load());
  REQUIRE(observed.stop_requested());
  std::atomic<int> sum{0};
  {
    c::jthread without_token([&](int n) { sum = n; }, 19);
  }
  REQUIRE(sum.load() == 19);
  {
    c::jthread first([&](c::stop_token t) {
      while (!t.stop_requested())
        std::this_thread::yield();
    });
    c::jthread next([] {});
    first = std::move(next);
  }
}

TEST_CASE(
    "Compiler stop callbacks run once, retire registrations and invoke immediately after stop") {
  c::stop_source source;
  const auto token = source.get_token();
  std::atomic<int> calls{0};
  {
    c::stop_callback removed(token, [&] { calls += 100; });
  }
  c::stop_callback live(token, [&] { ++calls; });
  REQUIRE(source.request_stop());
  REQUIRE_FALSE(source.request_stop());
  REQUIRE(calls.load() == 1);
  {
    c::stop_callback immediate(token, [&] { ++calls; });
  }
  REQUIRE(calls.load() == 2);
  c::stop_token absent;
  REQUIRE_FALSE(absent.stop_requested());
  {
    c::stop_callback inactive(absent, [&] { calls += 100; });
  }
  REQUIRE(calls.load() == 2);
}

TEST_CASE("Compiler stop possibility follows source ownership and survives requested source death") {
  c::stop_token orphan;
  REQUIRE_FALSE(orphan.stop_possible());
  {
    std::optional<c::stop_source> original;
    original.emplace();
    orphan = original->get_token();
    c::stop_source copy = *original;
    original.reset();
    REQUIRE(orphan.stop_possible());
    c::stop_source moved = std::move(copy);
    REQUIRE_FALSE(copy.request_stop());
    REQUIRE(orphan.stop_possible());
  }
  REQUIRE_FALSE(orphan.stop_possible());
  REQUIRE_FALSE(orphan.stop_requested());
  c::stop_token requested;
  {
    c::stop_source source;
    requested = source.get_token();
    REQUIRE(source.request_stop());
  }
  REQUIRE(requested.stop_possible());
  REQUIRE(requested.stop_requested());
}

#if !defined(__cpp_lib_jthread) || defined(BRIDGE_COMPAT_FORCE_FALLBACK)
TEST_CASE("Compiler fallback refuses callback capacity before registration and reuses retired slots") {
  c::stop_source source;
  int calls = 0;
  using Callback = c::stop_callback<std::function<void()>>;
  std::vector<std::unique_ptr<Callback>> callbacks;
  for (std::size_t i = 0; i < 64; ++i)
    callbacks.push_back(std::make_unique<Callback>(source.get_token(), [&] { ++calls; }));
  REQUIRE_THROWS_AS(Callback(source.get_token(), [&] { calls += 100; }), std::length_error);
  callbacks.front().reset();
  callbacks.front() = std::make_unique<Callback>(source.get_token(), [&] { ++calls; });
  REQUIRE(source.request_stop());
  REQUIRE(calls == 64);
}
#endif

TEST_CASE("Compiler callback destruction joins an in-flight stop notification before releasing "
          "captured storage") {
  c::stop_source source;
  std::promise<void> entered, release;
  auto entered_future = entered.get_future();
  auto release_future = release.get_future();
  std::atomic<bool> callback_done{false}, retired{false};
  std::promise<void> retirement_started, retirement_completed;
  auto retirement_started_future = retirement_started.get_future();
  auto retirement_completed_future = retirement_completed.get_future();
  auto fn = [&] {
    entered.set_value();
    release_future.wait();
    callback_done = true;
  };
  auto callback = std::make_unique<c::stop_callback<decltype(fn)>>(source.get_token(), fn);
  c::jthread requester([&] { source.request_stop(); });
  const auto ready = entered_future.wait_for(std::chrono::seconds(2));
  if (ready != std::future_status::ready) {
    release.set_value();
    FAIL("Stop callback did not enter");
  }
  c::jthread retire([&] {
    retirement_started.set_value();
    callback.reset();
    retired = true;
    retirement_completed.set_value();
  });
  const auto started = retirement_started_future.wait_for(std::chrono::seconds(2));
  const bool early = retirement_completed_future.wait_for(std::chrono::milliseconds(50)) ==
                     std::future_status::ready;
  release.set_value();
  retire.join();
  requester.join();
  REQUIRE(started == std::future_status::ready);
  REQUIRE_FALSE(early);
  REQUIRE(callback_done.load());
  REQUIRE(retired.load());
}
