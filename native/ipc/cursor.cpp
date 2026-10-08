#include "cursor.hpp"
#include <chrono>
#include <limits>

namespace bridge::cursor {
using namespace ipc;
void State::publish(bool include_shape) {
  if (revision_ == std::numeric_limits<std::uint64_t>::max())
    throw ProtocolError();
  std::vector<std::uint8_t> p;
  p.reserve(metadata_bytes + (include_shape ? shape_.rgba.size() : 0));
  append_be(p, 1, 2);
  append_be(p,
            (visible_ ? 1U : 0U) | (shape_.id == 0 ? 2U : 0U) | (positioned_ ? 4U : 0U) |
                (include_shape ? 8U : 0U),
            2);
  append_be(p, ++revision_, 8);
  append_be(p, shape_.id, 8);
  append_be(p,
            static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(
                                           std::chrono::steady_clock::now().time_since_epoch())
                                           .count()),
            8);
  for (const auto value : {x_, y_, shape_.width, shape_.height, shape_.hot_x, shape_.hot_y})
    append_be(p, value, 2);
  if (include_shape)
    p.insert(p.end(), shape_.rgba.begin(), shape_.rgba.end());
  send_({Kind::cursor_update, 0, std::move(p)});
}
void State::initialize() { publish(false); }
void State::shape(Shape value) {
  if (!value.id || !value.width || !value.height || value.width > max_dimension ||
      value.height > max_dimension || value.hot_x >= value.width || value.hot_y >= value.height ||
      value.rgba.size() != static_cast<std::size_t>(value.width) * value.height * 4)
    throw ProtocolError();
  if (value.id == shape_.id) {
    visibility(true);
    return;
  }
  shape_ = std::move(value);
  visible_ = true;
  publish(true);
}
void State::visibility(bool value) {
  if (visible_ == value)
    return;
  visible_ = value;
  publish(false);
}
void State::default_shape() {
  if (shape_.id == 0 && visible_)
    return;
  shape_ = {};
  visible_ = true;
  publish(false);
}
void State::position(std::uint32_t x, std::uint32_t y) {
  if (x > 65535 || y > 65535)
    throw ProtocolError();
  if (positioned_ && x_ == x && y_ == y)
    return;
  x_ = static_cast<std::uint16_t>(x);
  y_ = static_cast<std::uint16_t>(y);
  positioned_ = true;
  publish(false);
}
} // namespace bridge::cursor
