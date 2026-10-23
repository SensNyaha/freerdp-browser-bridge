#include "../compat/span.hpp"
#include "text_session.hpp"
#include "ingress.hpp"
#include <algorithm>
#include <exception>
#include <freerdp/channels/channels.h>
#include <freerdp/freerdp.h>
#include <limits>
#include <stdexcept>
#include <utility>
#include <winpr/error.h>

namespace bridge::clipboard {
namespace {
constexpr UINT32 unicode_text = 13;
constexpr std::uint64_t timeout_ms = 5000;
} // namespace
struct TextSession::Operation {
  TextSession &owner;
  bool entered;
  explicit Operation(TextSession &s) noexcept : owner(s), entered(s.begin()) {}
  ~Operation() {
    if (entered)
      owner.finish();
  }
  explicit operator bool() const noexcept { return entered; }
};
UINT16 TextSession::resolve_channel(freerdp *instance) {
  return freerdp_channels_get_id_by_name(instance, "cliprdr");
}
TextSession::TextSession(TextPolicy policy, Offer offer, Reply reply, Clock clock, Resolve resolve)
    : policy_(policy), offer_(std::move(offer)), reply_(std::move(reply)), clock_(std::move(clock)),
      resolve_(resolve) {
  if (!policy.maximum || policy.maximum > max_item_bytes || !offer_ || !reply_ || !clock_ ||
      !resolve_)
    throw std::invalid_argument("Invalid clipboard text owner");
}
TextSession::~TextSession() {
  if (thread_ != std::this_thread::get_id() || busy_)
    std::terminate();
  (void)close();
}
void TextSession::wipe_local() noexcept {
  std::fill(local_.begin(), local_.end(), 0);
  std::vector<std::uint8_t>{}.swap(local_);
  state_.local_accepted = false;
}
void TextSession::release() noexcept {
  wipe_local();
  request_ = request_revision_ = 0;
  state_.ready = state_.remote_text = state_.awaiting_local = state_.awaiting_remote = false;
  state_.local_response_ok = false;
  if (context_ && context_->custom == this) {
    context_->ServerCapabilities = saved_.ServerCapabilities;
    context_->MonitorReady = saved_.MonitorReady;
    context_->ServerFormatList = saved_.ServerFormatList;
    context_->ServerFormatListResponse = saved_.ServerFormatListResponse;
    context_->ServerFormatDataRequest = saved_.ServerFormatDataRequest;
    context_->ServerFormatDataResponse = saved_.ServerFormatDataResponse;
    context_->custom = saved_.custom;
  }
  context_ = nullptr;
}
bool TextSession::close() noexcept {
  if (thread_ != std::this_thread::get_id())
    return false;
  closed_ = true;
  if (!busy_)
    release();
  return true;
}
UINT TextSession::fail() noexcept {
  state_.failed = true;
  (void)close();
  return ERROR_INVALID_DATA;
}
bool TextSession::begin() noexcept {
  if (thread_ != std::this_thread::get_id() || busy_ || closed_ || !context_ ||
      context_->custom != this)
    return false;
  busy_ = true;
  try {
    const auto now = clock_();
    if ((clock_seen_ && now < now_) ||
        now > (std::numeric_limits<std::uint64_t>::max)() - timeout_ms ||
        (state_.awaiting_local && now >= local_deadline_) ||
        (state_.awaiting_remote && now >= remote_deadline_)) {
      (void)fail();
    } else {
      now_ = now;
      clock_seen_ = true;
    }
  } catch (...) {
    (void)fail();
  }
  if (closed_) {
    finish();
    return false;
  }
  return true;
}
void TextSession::finish() noexcept {
  busy_ = false;
  if (closed_)
    release();
}
UINT TextSession::bind(CliprdrClientContext &c) noexcept {
  if (thread_ != std::this_thread::get_id() || closed_ || bound_once_ || busy_ || c.custom ||
      c.ServerCapabilities || c.MonitorReady || c.ServerFormatList || c.ServerFormatListResponse ||
      c.ServerFormatDataRequest || c.ServerFormatDataResponse || c.ServerFileContentsRequest ||
      c.ServerFileContentsResponse || c.ServerLockClipboardData || c.ServerUnlockClipboardData ||
      !c.ClientCapabilities || !c.ClientFormatList || !c.ClientFormatListResponse ||
      !c.ClientFormatDataRequest || !c.ClientFormatDataResponse || !c.rdpcontext ||
      !c.rdpcontext->settings ||
      freerdp_settings_get_bool(c.rdpcontext->settings, FreeRDP_AsyncChannels) ||
      !(freerdp_settings_get_uint32(c.rdpcontext->settings, FreeRDP_ThreadingFlags) &
        THREADING_FLAGS_DISABLE_THREADS))
    return ERROR_INVALID_STATE;
  context_ = &c;
  saved_ = c;
  bound_once_ = true;
  c.custom = this;
  c.ServerCapabilities = capabilities;
  c.MonitorReady = ready;
  c.ServerFormatList = formats;
  c.ServerFormatListResponse = acknowledged;
  c.ServerFormatDataRequest = requested;
  c.ServerFormatDataResponse = received;
  return CHANNEL_RC_OK;
}
TextSession *TextSession::owner(CliprdrClientContext *c) noexcept {
  auto *s = c ? static_cast<TextSession *>(c->custom) : nullptr;
  return s && s->context_ == c ? s : nullptr;
}
UINT TextSession::advertise() noexcept {
  CLIPRDR_FORMAT format{unicode_text, nullptr};
  CLIPRDR_FORMAT_LIST list{};
  list.common.msgType = CB_FORMAT_LIST;
  list.numFormats = policy_.to_server && !local_.empty() ? 1 : 0;
  list.formats = list.numFormats ? &format : nullptr;
  state_.awaiting_local = true;
  state_.local_accepted = false;
  state_.local_response_ok = false;
  local_deadline_ = now_ + timeout_ms;
  try {
    const auto rc = context_->ClientFormatList(context_, &list);
    return rc == CHANNEL_RC_OK ? rc : fail();
  } catch (...) {
    return fail();
  }
}
UINT TextSession::capabilities(CliprdrClientContext *c, const CLIPRDR_CAPABILITIES *caps) noexcept {
  auto *s = owner(c);
  if (!s)
    return ERROR_INVALID_STATE;
  Operation op(*s);
  if (!op)
    return ERROR_INVALID_STATE;
  if (!caps || s->state_.ready || caps->cCapabilitiesSets != 1 || !caps->capabilitySets ||
      caps->capabilitySets->capabilitySetType != CB_CAPSTYPE_GENERAL ||
      caps->capabilitySets->capabilitySetLength != CB_CAPSTYPE_GENERAL_LEN)
    return s->fail();
  const auto &general =
      *reinterpret_cast<const CLIPRDR_GENERAL_CAPABILITY_SET *>(caps->capabilitySets);
  if (general.version != CB_CAPS_VERSION_1 && general.version != CB_CAPS_VERSION_2)
    return s->fail();
  s->capability_flags_ = general.generalFlags & CB_USE_LONG_FORMAT_NAMES;
  return CHANNEL_RC_OK;
}
UINT TextSession::ready(CliprdrClientContext *c, const CLIPRDR_MONITOR_READY *r) noexcept {
  auto *s = owner(c);
  if (!s)
    return ERROR_INVALID_STATE;
  Operation op(*s);
  if (!op)
    return ERROR_INVALID_STATE;
  if (!r || s->state_.ready || r->common.dataLen || r->common.msgFlags)
    return s->fail();
  CLIPRDR_GENERAL_CAPABILITY_SET general{CB_CAPSTYPE_GENERAL, CB_CAPSTYPE_GENERAL_LEN,
                                         CB_CAPS_VERSION_2, s->capability_flags_};
  CLIPRDR_CAPABILITIES caps{};
  caps.common.msgType = CB_CLIP_CAPS;
  caps.cCapabilitiesSets = 1;
  caps.capabilitySets = reinterpret_cast<CLIPRDR_CAPABILITY_SET *>(&general);
  try {
    if (c->ClientCapabilities(c, &caps) != CHANNEL_RC_OK)
      return s->fail();
  } catch (...) {
    return s->fail();
  }
  if (s->closed_)
    return CHANNEL_RC_OK;
  s->state_.ready = true;
  return s->advertise();
}
UINT TextSession::set_local(::bridge::compat::span<const std::uint8_t> text) noexcept {
  Operation op(*this);
  if (!op || !state_.ready || !policy_.to_server || state_.awaiting_local)
    return ERROR_INVALID_STATE;
  const auto measured = encode_unicode_text(text, {}, policy_.maximum);
  if (measured.status != TextStatus::capacity)
    return ERROR_INVALID_DATA;
  std::vector<std::uint8_t> value;
  try {
    value.resize(measured.bytes);
  } catch (...) {
    return ERROR_NOT_ENOUGH_MEMORY;
  }
  const auto converted = encode_unicode_text(text, value, policy_.maximum);
  if (converted.status != TextStatus::ok)
    return ERROR_INVALID_DATA;
  wipe_local();
  local_ = std::move(value);
  try {
    return advertise();
  } catch (...) {
    return fail();
  }
}
UINT TextSession::revoke_local() noexcept {
  Operation op(*this);
  if (!op || !state_.ready || state_.awaiting_local)
    return ERROR_INVALID_STATE;
  wipe_local();
  // A receive-only profile never retains or advertises a local value. Its
  // initial empty-list ACK has already completed at this admission point.
  if (!policy_.to_server) {
    state_.local_response_ok = true;
    return CHANNEL_RC_OK;
  }
  // Pinned 3.32.1 ClientFormatList silently suppresses every empty list after
  // the initial one. Send only this fixed PDU through the public RDP-thread API;
  // never borrow plugin internals or leave a fictitious ACK pending.
  try {
    auto *instance = context_->rdpcontext->instance;
    if (!instance)
      return fail();
    const auto channel = resolve_(instance);
    if (closed_)
      return CHANNEL_RC_OK;
    if (!channel || (revoke_channel_ && channel != revoke_channel_) || !instance->SendChannelData)
      return fail();
    revoke_channel_ = channel;
    // SDK replies use a channel write queue. Drain accepted older writes before
    // the direct empty list so none can overtake its peer-ACK barrier.
    if (freerdp_channels_process_pending_messages(instance) != 1)
      return fail();
    if (closed_)
      return CHANNEL_RC_OK;
    if (resolve_(instance) != channel)
      return fail();
    static constexpr BYTE empty_list[8]{CB_FORMAT_LIST, 0, 0, 0, 0, 0, 0, 0};
    state_.awaiting_local = true;
    state_.local_response_ok = false;
    local_deadline_ = now_ + timeout_ms;
    return instance->SendChannelData(instance, channel, empty_list, sizeof(empty_list))
               ? CHANNEL_RC_OK
               : fail();
  } catch (...) {
    return fail();
  }
}
UINT TextSession::acknowledged(CliprdrClientContext *c,
                               const CLIPRDR_FORMAT_LIST_RESPONSE *r) noexcept {
  auto *s = owner(c);
  if (!s)
    return ERROR_INVALID_STATE;
  Operation op(*s);
  if (!op)
    return ERROR_INVALID_STATE;
  if (!r || !s->state_.awaiting_local || r->common.dataLen ||
      (r->common.msgFlags != CB_RESPONSE_OK && r->common.msgFlags != CB_RESPONSE_FAIL))
    return s->fail();
  s->state_.awaiting_local = false;
  s->state_.local_response_ok = r->common.msgFlags == CB_RESPONSE_OK;
  s->state_.local_accepted = s->state_.local_response_ok && !s->local_.empty();
  if (!s->state_.local_accepted)
    s->wipe_local();
  return CHANNEL_RC_OK;
}
UINT TextSession::formats(CliprdrClientContext *c, const CLIPRDR_FORMAT_LIST *r) noexcept {
  auto *s = owner(c);
  if (!s)
    return ERROR_INVALID_STATE;
  Operation op(*s);
  if (!op)
    return ERROR_INVALID_STATE;
  if (!r || !s->state_.ready || r->numFormats > max_formats || (r->numFormats && !r->formats) ||
      s->state_.revision == (std::numeric_limits<std::uint64_t>::max)())
    return s->fail();
  ++s->state_.revision;
  s->state_.remote_text = false;
  for (UINT32 i = 0; i < r->numFormats; ++i)
    if (r->formats[i].formatId == unicode_text && s->policy_.from_server)
      s->state_.remote_text = true;
  CLIPRDR_FORMAT_LIST_RESPONSE response{{CB_FORMAT_LIST_RESPONSE, CB_RESPONSE_OK, 0}};
  try {
    if (c->ClientFormatListResponse(c, &response) != CHANNEL_RC_OK)
      return s->fail();
    if (!s->closed_ && !s->offer_(s->state_.revision, s->state_.remote_text))
      return s->fail();
  } catch (...) {
    return s->fail();
  }
  return CHANNEL_RC_OK;
}
UINT TextSession::request(std::uint64_t revision, std::uint64_t id) noexcept {
  Operation op(*this);
  if (!op || !id || !state_.ready || !policy_.from_server || !state_.remote_text ||
      state_.awaiting_remote || revision != state_.revision)
    return ERROR_INVALID_STATE;
  request_ = id;
  request_revision_ = revision;
  state_.awaiting_remote = true;
  remote_deadline_ = now_ + timeout_ms;
  CLIPRDR_FORMAT_DATA_REQUEST r{{CB_FORMAT_DATA_REQUEST, 0, 4}, unicode_text};
  try {
    const auto rc = context_->ClientFormatDataRequest(context_, &r);
    return rc == CHANNEL_RC_OK ? rc : fail();
  } catch (...) {
    return fail();
  }
}
UINT TextSession::requested(CliprdrClientContext *c,
                            const CLIPRDR_FORMAT_DATA_REQUEST *r) noexcept {
  auto *s = owner(c);
  if (!s)
    return ERROR_INVALID_STATE;
  Operation op(*s);
  if (!op)
    return ERROR_INVALID_STATE;
  if (!r || !s->state_.ready)
    return s->fail();
  CLIPRDR_FORMAT_DATA_RESPONSE response{};
  response.common.msgType = CB_FORMAT_DATA_RESPONSE;
  response.common.msgFlags = CB_RESPONSE_FAIL;
  if (s->policy_.to_server && s->state_.local_accepted && !s->state_.awaiting_local &&
      r->requestedFormatId == unicode_text && !s->local_.empty()) {
    response.common.msgFlags = CB_RESPONSE_OK;
    response.common.dataLen = static_cast<UINT32>(s->local_.size());
    response.requestedFormatData = s->local_.data();
  }
  try {
    return c->ClientFormatDataResponse(c, &response) == CHANNEL_RC_OK ? CHANNEL_RC_OK : s->fail();
  } catch (...) {
    return s->fail();
  }
}
UINT TextSession::received(CliprdrClientContext *c,
                           const CLIPRDR_FORMAT_DATA_RESPONSE *r) noexcept {
  auto *s = owner(c);
  if (!s)
    return ERROR_INVALID_STATE;
  Operation op(*s);
  if (!op)
    return ERROR_INVALID_STATE;
  if (!r || !s->state_.awaiting_remote || r->common.dataLen > s->policy_.maximum ||
      (r->common.dataLen && !r->requestedFormatData) ||
      (r->common.msgFlags != CB_RESPONSE_OK && r->common.msgFlags != CB_RESPONSE_FAIL) ||
      (r->common.msgFlags == CB_RESPONSE_FAIL && r->common.dataLen))
    return s->fail();
  const auto id = s->request_;
  s->request_ = 0;
  s->state_.awaiting_remote = false;
  std::vector<std::uint8_t> text;
  auto status = TextReply::refused;
  if (s->request_revision_ != s->state_.revision)
    status = TextReply::stale;
  else if (r->common.msgFlags == CB_RESPONSE_OK) {
    const ::bridge::compat::span<const std::uint8_t> wire{r->requestedFormatData, r->common.dataLen};
    const auto measured = decode_unicode_text(wire, {}, s->policy_.maximum);
    if (measured.status != TextStatus::capacity && measured.status != TextStatus::ok &&
        measured.status != TextStatus::too_large)
      return s->fail();
    if (measured.status != TextStatus::too_large) {
      try {
        text.resize(measured.bytes);
      } catch (...) {
        return s->fail();
      }
      if (decode_unicode_text(wire, text, s->policy_.maximum).status != TextStatus::ok)
        return s->fail();
      status = TextReply::ok;
    }
  }
  bool accepted = false;
  try {
    accepted = s->reply_(id, status, text);
  } catch (...) { /* Consumer fault retires below. */
  }
  std::fill(text.begin(), text.end(), 0);
  return accepted ? CHANNEL_RC_OK : s->fail();
}
bool TextSession::poll() noexcept {
  Operation op(*this);
  return static_cast<bool>(op);
}
std::optional<TextSnapshot> TextSession::snapshot() const noexcept {
  if (thread_ != std::this_thread::get_id() || busy_)
    return {};
  return state_;
}
} // namespace bridge::clipboard
