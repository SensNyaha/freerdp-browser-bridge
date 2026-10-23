#include "../compat/span.hpp"
#include "contacts.hpp"
#include "rdpei.hpp"
#include <algorithm>
#include <exception>
#include <stdexcept>
#include <winpr/error.h>

namespace bridge::touch {
Contacts::Contacts(PluginRegistration &registration)
    : registration_(registration), sink_([this](const Event &event) { return send(event); }) {
  GateObserver observer{
      this,
      [](void *p, ::bridge::compat::span<const BYTE> bytes, FrameDisposition disposition) noexcept -> UINT {
        return static_cast<Contacts *>(p)->frame(bytes, disposition);
      },
      [](void *p, Phase value) noexcept { static_cast<Contacts *>(p)->phase(value); }};
  if (registration_.gate().observe(observer) != CHANNEL_RC_OK)
    throw std::logic_error("Touch observer requires a closed idle gate");
}
Contacts::~Contacts() {
  if (!on_thread())
    std::terminate(); // A dangling observer must never survive a broken lifetime contract.
  (void)registration_.gate().close();
  if (registration_.gate().observe({}) != CHANNEL_RC_OK)
    std::terminate();
}
bool Contacts::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
std::size_t Contacts::owned() const noexcept {
  if (!on_thread())
    return 0;
  return static_cast<std::size_t>(
      std::count_if(slots_.begin(), slots_.end(), [](const auto &s) { return s.used; }));
}
bool Contacts::ready() const noexcept {
  const auto negotiated = registration_.gate().negotiated();
  return on_thread() && registration_.gate().ready() &&
         registration_.gate().timestamps_disabled() && negotiated &&
         negotiated->version > RDPINPUT_PROTOCOL_V10 && !reset_ && !lost_ && !failed_ &&
         !state_.cleanup_required();
}
void Contacts::phase(Phase value) noexcept {
  if (value == Phase::suspended)
    reset();
  if (value == Phase::closed || value == Phase::failed)
    lost_ = true;
}
void Contacts::reset() noexcept {
  if (!on_thread())
    return;
  reset_ = true;
  if (registration_.gate().hold(true) != CHANNEL_RC_OK)
    failed_ = true;
}
Result Contacts::apply(Event event, std::uint32_t width, std::uint32_t height) noexcept {
  if (!on_thread() || !ready())
    return Result::cleanup_required;
  if (!valid(event))
    return Result::invalid;
  auto slot = std::find_if(slots_.begin(), slots_.end(),
                           [&](const auto &s) { return s.used && s.event.id == event.id; });
  const bool begin = event.action == Action::begin;
  if (begin) {
    if (slot != slots_.end())
      return slot->terminal ? Result::cleanup_required : Result::invalid;
    slot = std::find_if(slots_.begin(), slots_.end(), [](const auto &s) { return !s.used; });
    if (slot == slots_.end())
      return Result::full;
    slot->used = true;
    slot->event = event;
  } else if (slot == slots_.end() || slot->terminal)
    return Result::invalid;
  const auto result = state_.apply(event, sink_, width, height);
  if (result == Result::invalid && begin)
    *slot = {};
  if (result == Result::failed)
    reset();
  return result;
}
bool Contacts::send(const Event &event) noexcept {
  auto slot = std::find_if(slots_.begin(), slots_.end(),
                           [&](const auto &s) { return s.used && s.event.id == event.id; });
  if (slot == slots_.end())
    return false;
  slot->event = event;
  slot->terminal = event.action == Action::end || event.action == Action::cancel;
  const auto submission = submit_rdpei(registration_.client(), event);
  if (submission.contact_id >= 0 && submission.contact_id < 64) {
    if (slot->native >= 0 && slot->native != submission.contact_id)
      return false;
    for (const auto &other : slots_)
      if (&other != &*slot && other.used && other.native == submission.contact_id)
        return false;
    slot->native = submission.contact_id;
  }
  return submission.accepted();
}
UINT Contacts::frame(::bridge::compat::span<const BYTE> bytes, FrameDisposition disposition) noexcept {
  if (!on_thread())
    return ERROR_INVALID_STATE;
  const auto parsed = read_touch_frame(bytes);
  if (!parsed)
    return ERROR_INVALID_DATA;
  // Validate the entire frame before committing any terminal ownership changes.
  for (std::size_t i = 0; i < parsed->count; ++i) {
    const auto &contact = parsed->contacts[i];
    const auto slot = std::find_if(slots_.begin(), slots_.end(),
                                   [&](const auto &s) { return s.used && s.native == contact.id; });
    if (slot == slots_.end())
      return ERROR_INVALID_DATA;
    const bool up = contact.flags == RDPINPUT_CONTACT_FLAG_UP ||
                    contact.flags == (RDPINPUT_CONTACT_FLAG_UP | RDPINPUT_CONTACT_FLAG_CANCELED);
    if (!up &&
        contact.flags != (RDPINPUT_CONTACT_FLAG_DOWN | RDPINPUT_CONTACT_FLAG_INRANGE |
                          RDPINPUT_CONTACT_FLAG_INCONTACT) &&
        contact.flags != (RDPINPUT_CONTACT_FLAG_UPDATE | RDPINPUT_CONTACT_FLAG_INRANGE |
                          RDPINPUT_CONTACT_FLAG_INCONTACT))
      return ERROR_INVALID_DATA;
    if ((up && (!slot->terminal || contact.x != static_cast<INT32>(slot->event.x) ||
                contact.y != static_cast<INT32>(slot->event.y))) ||
        (disposition == FrameDisposition::cleanup_prepare && !up))
      return ERROR_INVALID_DATA;
  }
  if (disposition == FrameDisposition::prepare || disposition == FrameDisposition::cleanup_prepare)
    return CHANNEL_RC_OK;
  for (std::size_t i = 0; i < parsed->count; ++i) {
    const auto &contact = parsed->contacts[i];
    if (!(contact.flags & RDPINPUT_CONTACT_FLAG_UP))
      continue;
    auto slot = std::find_if(slots_.begin(), slots_.end(),
                             [&](const auto &s) { return s.used && s.native == contact.id; });
    if (disposition == FrameDisposition::delivered)
      *slot = {};
    else {
      slot->record.size = contact.encoded.size();
      std::copy(contact.encoded.begin(), contact.encoded.end(), slot->record.bytes.begin());
    }
  }
  return CHANNEL_RC_OK;
}
Drain Contacts::service(std::chrono::steady_clock::time_point now) noexcept {
  if (!on_thread() || !registration_.gate().quiescent())
    return Drain::failed;
  const auto phase = registration_.gate().phase();
  if (lost_ || phase == Phase::closed || phase == Phase::failed) {
    state_.abandon();
    slots_ = {};
    reset_ = lost_ = false;
    deadline_.reset();
    if (registration_.gate().hold(false) != CHANNEL_RC_OK)
      return Drain::failed;
    return phase == Phase::failed ? Drain::failed : Drain::unavailable;
  }
  if (failed_)
    return Drain::failed;
  const auto negotiated = registration_.gate().negotiated();
  if (phase == Phase::running && (!registration_.gate().timestamps_disabled() || !negotiated ||
                                  negotiated->version <= RDPINPUT_PROTOCOL_V10))
    return Drain::unavailable;
  if (!reset_)
    return Drain::idle;
  if (phase == Phase::running) {
    if (!deadline_)
      deadline_ = now + std::chrono::seconds(2);
    if (now >= *deadline_) {
      failed_ = true;
      return Drain::failed;
    }
  } else
    deadline_.reset(); // Server suspension may legitimately last longer than a local deadline.
  if (!state_.release(sink_)) {
    failed_ = true;
    return Drain::failed;
  }
  if (registration_.gate().phase() == Phase::failed || lost_)
    return Drain::failed;
  if (phase != Phase::running)
    return Drain::pending;
  std::array<TerminalRecord, State::max_contacts> records{};
  std::size_t count = 0;
  for (const auto &slot : slots_) {
    if (!slot.used)
      continue;
    if (!slot.terminal || !slot.record.size)
      return Drain::pending;
    records[count++] = slot.record;
  }
  if (count) {
    const auto packet = terminal_packet(::bridge::compat::span(records).first(count));
    if (!packet || registration_.gate().submit_cleanup(
                       ::bridge::compat::span(packet->bytes).first(packet->size)) != CHANNEL_RC_OK) {
      failed_ = true;
      return Drain::failed;
    }
  }
  if (owned())
    return Drain::pending;
  reset_ = false;
  deadline_.reset();
  if (registration_.gate().hold(false) != CHANNEL_RC_OK) {
    failed_ = true;
    return Drain::failed;
  }
  return Drain::ready;
}
} // namespace bridge::touch
