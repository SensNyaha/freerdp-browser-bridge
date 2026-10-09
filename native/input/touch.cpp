#include "touch.hpp"
#include <algorithm>
#include <limits>

namespace bridge::touch {
bool valid(const Event &event) noexcept {
  return event.action >= Action::begin && event.action <= Action::cancel &&
         event.id <= static_cast<std::uint32_t>((std::numeric_limits<std::int32_t>::max)()) &&
         event.x < 7680 && event.y < 4320;
}
namespace {
bool dispatch(const State::Sink &send, const Event &event) noexcept {
  try {
    return send && send(event);
  } catch (...) {
    return false;
  }
}
} // namespace
Result State::apply(Event event, const Sink &send, std::uint32_t width,
                    std::uint32_t height) noexcept {
  if (!valid(event) || !send || !width || width > 7680 || !height || height > 4320)
    return Result::invalid;
  if (failed_)
    return Result::cleanup_required;
  auto slot = std::find_if(slots_.begin(), slots_.end(), [&](const auto &entry) {
    return entry.used && entry.event.id == event.id;
  });
  if (event.action == Action::begin) {
    if (slot != slots_.end())
      return Result::invalid;
    slot =
        std::find_if(slots_.begin(), slots_.end(), [](const auto &entry) { return !entry.used; });
    if (slot == slots_.end())
      return Result::full;
  } else if (slot == slots_.end()) {
    return Result::invalid;
  }
  event.x = (std::min)(event.x, width - 1);
  event.y = (std::min)(event.y, height - 1);
  failed_ = true; // A partial/uncertain API failure permits cleanup only, never input replay.
  if (event.action == Action::cancel) {
    event.x = slot->event.x;
    event.y = slot->event.y;
  } else if (event.action == Action::end &&
             (event.x != slot->event.x || event.y != slot->event.y)) {
    // MS-RDPEI forbids changing coordinates on the transition out of engagement.
    slot->event = {Action::update, event.id, event.x, event.y};
    if (!dispatch(send, slot->event))
      return Result::failed;
  }
  // Retain even a failed begin: an API may have accepted local state before failing a write.
  slot->used = true;
  slot->event = event;
  if (!dispatch(send, event))
    return Result::failed;
  if (event.action == Action::end || event.action == Action::cancel)
    *slot = {};
  failed_ = false;
  return Result::accepted;
}
bool State::release(const Sink &send) noexcept {
  bool ok = true;
  for (auto &slot : slots_) {
    if (!slot.used)
      continue;
    const Event cancel{Action::cancel, slot.event.id, slot.event.x, slot.event.y};
    if (dispatch(send, cancel))
      slot = {};
    else
      ok = false;
  }
  failed_ = !ok;
  return ok;
}
void State::abandon() noexcept {
  slots_ = {};
  failed_ = false;
}
std::size_t State::active() const noexcept {
  return static_cast<std::size_t>(
      std::count_if(slots_.begin(), slots_.end(), [](const auto &slot) { return slot.used; }));
}
} // namespace bridge::touch
