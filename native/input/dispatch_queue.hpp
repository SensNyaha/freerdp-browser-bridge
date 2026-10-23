#pragma once
#include "input.hpp"
#include "touch_ipc.hpp"
#include <optional>
#include <variant>

namespace bridge::input {
// External synchronization required. One fixed FIFO preserves mixed input/reset order.
class Queue {
public:
  using EventVariant = std::variant<Event, touch::Request>;
  struct Record {
    std::uint64_t request;
    EventVariant event;
  };
  static constexpr std::size_t capacity = 64;

private:
  std::array<Record, capacity> records_{};
  std::size_t head_ = 0, count_ = 0;

public:
  bool push(std::uint64_t request, EventVariant event) noexcept {
    if (count_ == capacity)
      return false;
    records_[(head_ + count_) % capacity] = {request, std::move(event)};
    ++count_;
    return true;
  }
  std::optional<Record> pop() noexcept {
    if (!count_)
      return std::nullopt;
    auto result = records_[head_];
    records_[head_] = {};
    head_ = (head_ + 1) % capacity;
    --count_;
    return result;
  }
};
} // namespace bridge::input
