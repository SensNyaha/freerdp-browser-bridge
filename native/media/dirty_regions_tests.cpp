#include "dirty_regions.hpp"
#include <catch2/catch_test_macros.hpp>
using namespace bridge::media;
TEST_CASE("Dirty snapshots clip safely, ignore empty paints and resize to a full desktop") {
  DirtyRegions dirty;
  REQUIRE(dirty.snapshot().revision == 0);
  REQUIRE_THROWS_AS(dirty.resize(0, 48), bridge::ipc::ProtocolError);
  REQUIRE_THROWS_AS(dirty.resize(7681, 48), bridge::ipc::ProtocolError);
  dirty.resize(64, 48);
  auto first = dirty.snapshot();
  REQUIRE(first.revision == 1);
  REQUIRE(first.area == 64 * 48);
  REQUIRE(first.count == 1);
  dirty.consume(first.revision);
  const std::array empty{DirtyRect{-100, -100, 1, 1}, DirtyRect{0, 0, -1, 20},
                         DirtyRect{64, 48, INT32_MAX, INT32_MAX}};
  REQUIRE_FALSE(dirty.paint(empty));
  REQUIRE(dirty.snapshot().revision == first.revision);
  const std::array clipped{DirtyRect{-4, -5, 10, 10}, DirtyRect{60, 40, INT32_MAX, INT32_MAX}};
  REQUIRE(dirty.paint(clipped));
  auto next = dirty.snapshot();
  REQUIRE(next.count == 2);
  REQUIRE(next.area == 6 * 5 + 4 * 8);
  REQUIRE(first.count == 1); // A previous snapshot owns its metadata.
  dirty.resize(32, 16);
  REQUIRE(dirty.snapshot().area == 512);
  REQUIRE(dirty.snapshot().rectangles[0] == DirtyRect{0, 0, 32, 16});
}
TEST_CASE("Dirty unions merge transitively and preserve changes after a stale snapshot") {
  DirtyRegions dirty;
  dirty.resize(80, 48);
  dirty.consume(1);
  const std::array separate{DirtyRect{0, 0, 10, 10}, DirtyRect{20, 0, 10, 10},
                            DirtyRect{40, 0, 10, 10}};
  REQUIRE(dirty.paint(separate));
  const auto old = dirty.snapshot();
  REQUIRE(old.count == 3);
  const std::array bridge{DirtyRect{10, 0, 30, 10}};
  REQUIRE(dirty.paint(bridge));
  auto next = dirty.snapshot();
  REQUIRE(next.count == 1);
  REQUIRE(next.rectangles[0] == DirtyRect{0, 0, 50, 10});
  dirty.consume(old.revision);
  REQUIRE(dirty.snapshot().area == 500);
  // A failed encode discards its snapshot without consuming pending dirty rectangles.
  const std::array later{DirtyRect{70, 40, 2, 2}};
  REQUIRE(dirty.paint(later));
  REQUIRE(dirty.snapshot().area == 504);
  dirty.consume(dirty.snapshot().revision);
  REQUIRE(dirty.snapshot().count == 0);
}
TEST_CASE("Dirty capacity overflow conservatively collapses and resets after consumption") {
  DirtyRegions dirty;
  dirty.resize(400, 100);
  dirty.consume(1);
  for (std::int32_t x = 0; x < 65 * 4; x += 4) {
    const std::array rect{DirtyRect{x, 0, 1, 1}};
    REQUIRE(dirty.paint(rect));
  }
  auto state = dirty.snapshot();
  REQUIRE(state.collapsed);
  REQUIRE(state.count == 1);
  REQUIRE(state.rectangles[0] == DirtyRect{0, 0, 257, 1});
  const std::array extra{DirtyRect{399, 99, 1, 1}};
  REQUIRE(dirty.paint(extra));
  REQUIRE(dirty.snapshot().area == 400 * 100);
  dirty.consume(dirty.snapshot().revision);
  REQUIRE_FALSE(dirty.snapshot().collapsed);
  REQUIRE(dirty.paint(extra));
  REQUIRE(dirty.snapshot().area == 1);
}
TEST_CASE("Bounded dirty snapshots never omit a changed pixel under mixed rectangle input") {
  DirtyRegions dirty;
  dirty.resize(80, 48);
  dirty.consume(1);
  std::array<bool, 80 * 48> changed{};
  std::uint32_t seed = 0x12345678;
  const auto random = [&] {
    seed = seed * 1664525U + 1013904223U;
    return seed;
  };
  for (int paint = 0; paint < 200; ++paint) {
    const DirtyRect rect{static_cast<int>(random() % 100) - 10,
                         static_cast<int>(random() % 68) - 10, static_cast<int>(random() % 15),
                         static_cast<int>(random() % 15)};
    const std::array update{rect};
    dirty.paint(update);
    for (int y = 0; y < 48; ++y)
      for (int x = 0; x < 80; ++x)
        if (x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height)
          changed[static_cast<std::size_t>(y * 80 + x)] = true;
    const auto state = dirty.snapshot();
    REQUIRE(state.count <= DirtyRegions::capacity);
    REQUIRE(state.area <= 80 * 48);
    bool covered = true;
    for (int y = 0; y < 48; ++y)
      for (int x = 0; x < 80; ++x) {
        if (!changed[static_cast<std::size_t>(y * 80 + x)])
          continue;
        bool found = false;
        for (std::size_t i = 0; i < state.count; ++i) {
          const auto &r = state.rectangles[i];
          found |= x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
        }
        covered &= found;
      }
    REQUIRE(covered);
    if (paint % 17 == 16) {
      dirty.consume(state.revision);
      changed.fill(false);
    }
  }
}
