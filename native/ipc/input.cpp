#include "../compat/span.hpp"
#include "input.hpp"
#include <algorithm>

namespace bridge::input {
bool initialize_pointer(const State::Sink &send, std::uint16_t x, std::uint16_t y) {
  for (std::uint16_t button = 0; button < 3; ++button) {
    if (!send({Type::button, 0, x, y, button}))
      return false;
  }
  return true;
}
Event decode(::bridge::compat::span<const std::uint8_t> p) {
  using namespace ipc;
  if (p.size() != 12 || read_be(p.subspan(8, 4)) != 0)
    throw ProtocolError();
  Event e{static_cast<Type>(p[0]), p[1], static_cast<std::uint16_t>(read_be(p.subspan(2, 2))),
          static_cast<std::uint16_t>(read_be(p.subspan(4, 2))),
          static_cast<std::uint16_t>(read_be(p.subspan(6, 2)))};
  bool valid = false;
  switch (e.type) {
  case Type::key:
    valid = e.flags <= 3 && (e.flags != 2) && e.a < 512 && (e.a & 255) > 0 && (e.a & 255) <= 127 &&
            e.b == 0 && e.c == 0;
    break;
  case Type::move:
    valid = e.flags == 0 && e.c == 0 && e.a < 7680 && e.b < 4320;
    break;
  case Type::button:
    valid = e.flags <= 1 && e.c < 5 && e.a < 7680 && e.b < 4320;
    break;
  case Type::wheel:
    // Signed two's complement wheel delta, limited to one protocol rotation field.
    valid = e.flags <= 1 && e.b == 0 && e.c == 0 && e.a != 0 && (e.a <= 255 || e.a >= 65536 - 255);
    break;
  case Type::reset:
    valid = e.flags == 0 && e.a == 0 && e.b == 0 && e.c == 0;
    break;
  case Type::sync:
    valid = e.flags == 0 && e.a <= 7 && e.b == 0 && e.c == 0;
    break;
  case Type::text:
  case Type::unicode:
    break;
  }
  if (!valid)
    throw ProtocolError();
  return e;
}
Event decode_text(::bridge::compat::span<const std::uint8_t> p) {
  if (p.empty() || p.size() > max_text_units * 2 || p.size() % 2)
    throw ipc::ProtocolError();
  Event e{Type::text};
  e.a = static_cast<std::uint16_t>(p.size() / 2);
  bool surrogate = false;
  for (std::size_t i = 0; i < e.a; ++i) {
    const auto unit = static_cast<std::uint16_t>(ipc::read_be(p.subspan(i * 2, 2)));
    if ((unit < 32 && unit != 9 && unit != 10 && unit != 13) || (unit >= 127 && unit <= 159))
      throw ipc::ProtocolError();
    if (surrogate) {
      if (unit < 0xdc00 || unit > 0xdfff)
        throw ipc::ProtocolError();
      surrogate = false;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      surrogate = true;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw ipc::ProtocolError();
    }
    e.text[i] = unit;
  }
  if (surrogate)
    throw ipc::ProtocolError();
  return e;
}
bool State::release(const Sink &send) {
  bool ok = true;
  if (unicode_pressed_) {
    if (send({Type::unicode, 0, *unicode_pressed_}))
      unicode_pressed_.reset();
    else
      ok = false;
  }
  for (std::size_t i = 0; i < keys_.size(); ++i) {
    if (keys_[i]) {
      if (send({Type::key, 0, static_cast<std::uint16_t>(i)}))
        keys_.reset(i);
      else
        ok = false;
    }
  }
  for (std::size_t i = 0; i < buttons_.size(); ++i) {
    if (buttons_[i]) {
      if (send({Type::button, 0, x_, y_, static_cast<std::uint16_t>(i)}))
        buttons_.reset(i);
      else
        ok = false;
    }
  }
  return ok;
}
bool State::apply(Event e, const Sink &send, std::uint16_t width, std::uint16_t height) {
  if (e.type == Type::reset)
    return release(send) && initialize_pointer(send, x_, y_);
  if (e.type == Type::text) {
    if (!e.a || e.a > max_text_units || unicode_pressed_)
      return false;
    // Text entry releases physical modifiers first; it is not a shortcut sequence.
    if (!release(send))
      return false;
    for (std::size_t i = 0; i < e.a; ++i) {
      if (!send({Type::unicode, 1, e.text[i]}))
        return false;
      unicode_pressed_ = e.text[i];
      if (!send({Type::unicode, 0, e.text[i]}))
        return false;
      unicode_pressed_.reset();
    }
    return true;
  }
  if (e.type == Type::key) {
    const bool down = (e.flags & 1) != 0;
    if (!down && !keys_[e.a])
      return true;
    if (down && keys_[e.a] && !(e.flags & 2))
      return true;
    e.flags = down ? static_cast<std::uint8_t>(keys_[e.a] ? 3 : 1) : 0;
    if (!send(e))
      return false;
    keys_[e.a] = down;
    return true;
  }
  if (e.type == Type::move || e.type == Type::button) {
    if (!width || !height)
      return false;
    e.a = std::min(e.a, static_cast<std::uint16_t>(width - 1));
    e.b = std::min(e.b, static_cast<std::uint16_t>(height - 1));
    x_ = e.a;
    y_ = e.b;
    if (e.type == Type::button && buttons_[e.c] == (e.flags != 0))
      return true;
    if (!send(e))
      return false;
    if (e.type == Type::button)
      buttons_[e.c] = e.flags != 0;
    return true;
  }
  return send(e);
}
} // namespace bridge::input
