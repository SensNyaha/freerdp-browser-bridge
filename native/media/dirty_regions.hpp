#pragma once
#include "../compat/span.hpp"
#include "protocol.hpp"
#include <algorithm>
#include <array>
#include <cstdint>
#include <limits>

namespace bridge::media {
struct DirtyRect {
  std::int32_t x, y, width, height;
  bool operator==(const DirtyRect &other) const noexcept {
    return x == other.x && y == other.y && width == other.width && height == other.height;
  }
  bool operator!=(const DirtyRect &other) const noexcept { return !(*this == other); }
};
class DirtyRegions {
public:
  static constexpr std::size_t capacity = 64;
  struct Snapshot {
    std::uint64_t revision = 0, area = 0;
    std::uint32_t width = 0, height = 0;
    std::array<DirtyRect, capacity> rectangles{};
    std::size_t count = 0;
    bool collapsed = false;
  };

private:
  Snapshot state_;
  static DirtyRect unite(const DirtyRect &a, const DirtyRect &b) {
    const auto x = (std::min)(a.x, b.x), y = (std::min)(a.y, b.y);
    return {x, y, (std::max)(a.x + a.width, b.x + b.width) - x,
            (std::max)(a.y + a.height, b.y + b.height) - y};
  }
  static bool touches(const DirtyRect &a, const DirtyRect &b) {
    return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height &&
           b.y <= a.y + a.height;
  }
  void advance() {
    if (state_.revision == (std::numeric_limits<std::uint64_t>::max)())
      throw ipc::ProtocolError();
    ++state_.revision;
  }
  bool add(DirtyRect rect) {
    if (rect.width <= 0 || rect.height <= 0)
      return false;
    const auto left = std::max<std::int64_t>(rect.x, 0);
    const auto top = std::max<std::int64_t>(rect.y, 0);
    const auto right =
        std::min<std::int64_t>(static_cast<std::int64_t>(rect.x) + rect.width, state_.width);
    const auto bottom =
        std::min<std::int64_t>(static_cast<std::int64_t>(rect.y) + rect.height, state_.height);
    if (left >= right || top >= bottom)
      return false;
    rect = {static_cast<std::int32_t>(left), static_cast<std::int32_t>(top),
            static_cast<std::int32_t>(right - left), static_cast<std::int32_t>(bottom - top)};
    if (state_.collapsed) {
      state_.rectangles[0] = unite(state_.rectangles[0], rect);
      return true;
    }
    for (std::size_t i = 0; i < state_.count;) {
      if (touches(rect, state_.rectangles[i])) {
        rect = unite(rect, state_.rectangles[i]);
        state_.rectangles[i] = state_.rectangles[--state_.count];
        i = 0; // The new union may touch an earlier rectangle.
      } else
        ++i;
    }
    if (state_.count == capacity) {
      for (std::size_t i = 0; i < state_.count; ++i)
        rect = unite(rect, state_.rectangles[i]);
      state_.count = 0;
      state_.collapsed = true;
    }
    state_.rectangles[state_.count++] = rect;
    return true;
  }

public:
  std::uint64_t revision() const noexcept { return state_.revision; }
  void resize(std::uint32_t width, std::uint32_t height) {
    if (!width || !height || width > 7680 || height > 4320)
      throw ipc::ProtocolError();
    advance();
    state_.width = width;
    state_.height = height;
    state_.count = 1;
    state_.collapsed = false;
    state_.rectangles[0] = {0, 0, static_cast<std::int32_t>(width),
                            static_cast<std::int32_t>(height)};
  }
  bool paint(::bridge::compat::span<const DirtyRect> rectangles) {
    bool changed = false;
    for (const auto &rect : rectangles)
      changed = add(rect) || changed;
    if (changed)
      advance();
    return changed;
  }
  Snapshot snapshot() const {
    auto result = state_;
    result.area = 0;
    for (std::size_t i = 0; i < result.count; ++i)
      result.area += static_cast<std::uint64_t>(result.rectangles[i].width) *
                     static_cast<std::uint64_t>(result.rectangles[i].height);
    return result;
  }
  void consume(std::uint64_t revision) {
    if (revision != state_.revision)
      return;
    state_.count = 0;
    state_.collapsed = false;
  }
};
} // namespace bridge::media
