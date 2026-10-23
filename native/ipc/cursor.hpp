#pragma once
#include "protocol.hpp"
#include <functional>

namespace bridge::cursor {
constexpr std::size_t metadata_bytes = 40, max_dimension = 384;
constexpr std::size_t max_rgba_bytes = max_dimension * max_dimension * 4;
struct Shape {
  std::uint64_t id{};
  std::uint16_t width{}, height{}, hot_x{}, hot_y{};
  std::vector<std::uint8_t> rgba;
};
// RDP-thread owned: one current shape, no queue of pointer updates.
class State {
  Shape shape_;
  std::uint64_t revision_{};
  std::uint16_t x_{}, y_{};
  bool visible_ = true, positioned_ = false;
  std::function<void(const ipc::Packet &)> send_;
  void publish(bool include_shape);

public:
  explicit State(std::function<void(const ipc::Packet &)> send) : send_(std::move(send)) {}
  void initialize();
  void shape(Shape value);
  void visibility(bool visible);
  void default_shape();
  void position(std::uint32_t x, std::uint32_t y);
  std::uint64_t shape_id() const { return shape_.id; }
};
} // namespace bridge::cursor
