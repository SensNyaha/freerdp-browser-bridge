#include "text_session.hpp"
#include "../compat/span.hpp"
#include "ingress.hpp"
#include <algorithm>
#include <array>
#include <exception>
#include <freerdp/channels/channels.h>
#include <freerdp/freerdp.h>
#include <limits>
#include <stdexcept>
#include <utility>
#include <winpr/error.h>
#include <winpr/user.h>

namespace bridge::clipboard {
namespace {
constexpr UINT32 unicode_text = 13;
constexpr UINT32 local_html = 0xc001;
constexpr std::uint64_t timeout_ms = 5000;
void wipe(std::vector<std::uint8_t> &bytes) noexcept {
  volatile std::uint8_t *output = bytes.data();
  for (std::size_t i = 0; i < bytes.size(); ++i)
    output[i] = 0;
  std::vector<std::uint8_t>{}.swap(bytes);
}
bool html_name(const char *name) noexcept {
  if (!name)
    return false;
  // Registered Windows format names compare case-insensitively. Match only
  // this fixed ASCII name and its terminator, never scan a peer string to EOF.
  constexpr char expected[] = "html format";
  for (std::size_t i = 0; i < sizeof(expected); ++i) {
    auto c = static_cast<unsigned char>(name[i]);
    if (c >= 'A' && c <= 'Z')
      c = static_cast<unsigned char>(c - 'A' + 'a');
    if (c != static_cast<unsigned char>(expected[i]))
      return false;
    if (!c)
      return true;
  }
  return false;
}
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
TextSession::TextSession(TextPolicy policy, Offer offer, Reply reply, Clock clock, Resolve resolve,
                         HtmlReply html_reply, ImageReply image_reply)
    : policy_(policy), offer_(std::move(offer)), reply_(std::move(reply)),
      html_reply_(std::move(html_reply)), image_reply_(std::move(image_reply)),
      clock_(std::move(clock)), resolve_(resolve) {
  if (!policy.maximum || policy.maximum > max_item_bytes || !offer_ || !reply_ || !clock_ ||
      !resolve_ || (policy.html && policy.from_server && !html_reply_) ||
      (policy.image && policy.from_server && !image_reply_))
    throw std::invalid_argument("Invalid clipboard text owner");
}
TextSession::~TextSession() {
  if (thread_ != std::this_thread::get_id() || busy_)
    std::terminate();
  (void)close();
}
void TextSession::wipe_local() noexcept {
  wipe(local_);
  wipe(local_html_);
  wipe(local_image_);
  state_.local_accepted = false;
  state_.local_html_accepted = false;
  state_.local_image_accepted = false;
}
void TextSession::release() noexcept {
  wipe_local();
  request_ = request_revision_ = 0;
  remote_html_id_ = 0;
  remote_image_id_ = 0;
  request_format_ = Format::text;
  state_.ready = state_.remote_text = state_.awaiting_local = state_.awaiting_remote = false;
  state_.local_response_ok = false;
  state_.remote_html = false;
  state_.remote_image = false;
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
  char name[] = "HTML Format";
  std::array<CLIPRDR_FORMAT, 3> formats{};
  CLIPRDR_FORMAT_LIST list{};
  list.common.msgType = CB_FORMAT_LIST;
  if (policy_.to_server) {
    if (policy_.image && !local_image_.empty())
      formats[list.numFormats++] = {CF_DIBV5, nullptr};
    if (policy_.html && !local_html_.empty())
      formats[list.numFormats++] = {local_html, name};
    if (!local_.empty())
      formats[list.numFormats++] = {unicode_text, nullptr};
  }
  list.formats = list.numFormats ? formats.data() : nullptr;
  state_.awaiting_local = true;
  state_.local_accepted = false;
  state_.local_html_accepted = false;
  state_.local_image_accepted = false;
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
UINT TextSession::set_local_html(
    ::bridge::compat::span<const std::uint8_t> fragment,
    std::optional<::bridge::compat::span<const std::uint8_t>> text) noexcept {
  Operation op(*this);
  if (!op || !state_.ready || !policy_.to_server || !policy_.html || state_.awaiting_local)
    return ERROR_INVALID_STATE;
  if (fragment.size() > policy_.maximum ||
      (text && text->size() > policy_.maximum - fragment.size()))
    return ERROR_INVALID_DATA;
  const auto html_size = encode_html_clipboard(fragment, {}, policy_.maximum);
  if (html_size.status != TextStatus::capacity)
    return ERROR_INVALID_DATA;
  const auto text_size =
      text ? encode_unicode_text(*text, {}, policy_.maximum) : TextResult{TextStatus::capacity, 0};
  if (text_size.status != TextStatus::capacity ||
      text_size.bytes > policy_.maximum - html_size.bytes)
    return ERROR_INVALID_DATA;
  // Validate both representations and their aggregate before allocating either.
  std::vector<std::uint8_t> value, html;
  try {
    value.resize(text_size.bytes);
    html.resize(html_size.bytes);
  } catch (...) {
    return ERROR_NOT_ENOUGH_MEMORY;
  }
  if ((text && encode_unicode_text(*text, value, policy_.maximum).status != TextStatus::ok) ||
      encode_html_clipboard(fragment, html, policy_.maximum).status != TextStatus::ok) {
    wipe(value);
    wipe(html);
    return ERROR_INVALID_DATA;
  }
  wipe_local();
  local_ = std::move(value);
  local_html_ = std::move(html);
  return advertise();
}
UINT TextSession::set_local_image(::bridge::compat::span<const std::uint8_t> rgba,
                                  std::uint32_t width, std::uint32_t height) noexcept {
  Operation op(*this);
  if (!op || !state_.ready || !policy_.to_server || !policy_.image || state_.awaiting_local)
    return ERROR_INVALID_STATE;
  const auto measured = encode_dibv5_clipboard(rgba, width, height, {}, policy_.maximum);
  if (measured.status != ImageStatus::capacity)
    return ERROR_INVALID_DATA;
  std::vector<std::uint8_t> value;
  try {
    value.resize(measured.bytes);
  } catch (...) {
    return ERROR_NOT_ENOUGH_MEMORY;
  }
  if (encode_dibv5_clipboard(rgba, width, height, value, policy_.maximum).status !=
      ImageStatus::ok) {
    wipe(value);
    return ERROR_INVALID_DATA;
  }
  wipe_local();
  local_image_ = std::move(value);
  return advertise();
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
  s->state_.local_accepted =
      s->state_.local_response_ok &&
      (!s->local_.empty() || !s->local_html_.empty() || !s->local_image_.empty());
  s->state_.local_html_accepted = s->state_.local_response_ok && !s->local_html_.empty();
  s->state_.local_image_accepted = s->state_.local_response_ok && !s->local_image_.empty();
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
  s->state_.remote_html = false;
  s->state_.remote_image = false;
  s->remote_html_id_ = 0;
  s->remote_image_id_ = 0;
  for (UINT32 i = 0; i < r->numFormats; ++i)
    if (r->formats[i].formatId == unicode_text && s->policy_.from_server)
      s->state_.remote_text = true;
  if (s->policy_.html && s->policy_.from_server) {
    for (UINT32 i = 0; i < r->numFormats; ++i) {
      const auto &format = r->formats[i];
      if (!html_name(format.formatName))
        continue;
      if (!format.formatId || format.formatId == unicode_text || s->remote_html_id_)
        return s->fail();
      // A named format ID is supplied by the peer, not by Windows on this host.
      // No assumption about the peer OS's registered-ID range is made here.
      for (UINT32 j = 0; j < r->numFormats; ++j)
        if (j != i && r->formats[j].formatId == format.formatId)
          return s->fail();
      s->remote_html_id_ = format.formatId;
    }
    s->state_.remote_html = s->remote_html_id_ != 0;
  }
  if (s->policy_.image && s->policy_.from_server) {
    UINT32 dib = 0, dibv5 = 0;
    for (UINT32 i = 0; i < r->numFormats; ++i) {
      const auto &format = r->formats[i];
      if (format.formatId != CF_DIB && format.formatId != CF_DIBV5)
        continue;
      // These are fixed standard IDs, never peer-registered named formats.
      if ((format.formatName && *format.formatName) || format.formatId == s->remote_html_id_)
        return s->fail();
      auto &selected = format.formatId == CF_DIBV5 ? dibv5 : dib;
      if (selected)
        return s->fail();
      selected = format.formatId;
    }
    s->remote_image_id_ = dibv5 ? dibv5 : dib;
    s->state_.remote_image = s->remote_image_id_ != 0;
  }
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
  return request_format(revision, id, Format::text);
}
UINT TextSession::request_html(std::uint64_t revision, std::uint64_t id) noexcept {
  return request_format(revision, id, Format::html);
}
UINT TextSession::request_image(std::uint64_t revision, std::uint64_t id) noexcept {
  return request_format(revision, id, Format::image);
}
UINT TextSession::request_format(std::uint64_t revision, std::uint64_t id, Format format) noexcept {
  Operation op(*this);
  if (!op)
    return ERROR_INVALID_STATE;
  const bool available = format == Format::html    ? policy_.html && state_.remote_html
                         : format == Format::image ? policy_.image && state_.remote_image
                                                   : state_.remote_text;
  if (!id || !state_.ready || !policy_.from_server || !available || state_.awaiting_remote ||
      revision != state_.revision)
    return ERROR_INVALID_STATE;
  request_ = id;
  request_revision_ = revision;
  request_format_ = format;
  state_.awaiting_remote = true;
  remote_deadline_ = now_ + timeout_ms;
  const auto id_format = format == Format::html    ? remote_html_id_
                         : format == Format::image ? remote_image_id_
                                                   : unicode_text;
  CLIPRDR_FORMAT_DATA_REQUEST r{{CB_FORMAT_DATA_REQUEST, 0, 4}, id_format};
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
  if (s->policy_.to_server && s->state_.local_accepted && !s->state_.awaiting_local) {
    const auto *value = r->requestedFormatId == unicode_text                    ? &s->local_
                        : s->policy_.html && r->requestedFormatId == local_html ? &s->local_html_
                        : s->policy_.image && r->requestedFormatId == CF_DIBV5  ? &s->local_image_
                                                                                : nullptr;
    if (value && !value->empty()) {
      response.common.msgFlags = CB_RESPONSE_OK;
      response.common.dataLen = static_cast<UINT32>(value->size());
      response.requestedFormatData = value->data();
    }
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
  const auto format = s->request_format_;
  s->request_format_ = Format::text;
  if (format == Format::html) {
    return s->received_html(*r, id);
  }
  if (format == Format::image)
    return s->received_image(*r, id);
  std::vector<std::uint8_t> text;
  auto status = TextReply::refused;
  if (s->request_revision_ != s->state_.revision)
    status = TextReply::stale;
  else if (r->common.msgFlags == CB_RESPONSE_OK) {
    const ::bridge::compat::span<const std::uint8_t> wire{r->requestedFormatData,
                                                          r->common.dataLen};
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
  wipe(text);
  return accepted ? CHANNEL_RC_OK : s->fail();
}
UINT TextSession::received_html(const CLIPRDR_FORMAT_DATA_RESPONSE &r, std::uint64_t id) noexcept {
  HtmlView view;
  auto status = TextReply::refused;
  if (request_revision_ != state_.revision)
    status = TextReply::stale;
  else if (r.common.msgFlags == CB_RESPONSE_OK) {
    const ::bridge::compat::span<const std::uint8_t> wire{r.requestedFormatData, r.common.dataLen};
    const auto inspection = inspect_html_clipboard(wire, policy_.maximum);
    if (inspection.status != TextStatus::ok)
      return fail();
    view = {wire.subspan(inspection.body_offset, inspection.body_bytes),
            inspection.fragment_offset - inspection.body_offset,
            inspection.fragment_bytes,
            inspection.selection ? inspection.selection_offset - inspection.body_offset : 0,
            inspection.selection_bytes,
            inspection.context,
            inspection.selection,
            wire.size()};
    status = TextReply::ok;
  }
  bool accepted = false;
  try {
    accepted = html_reply_(id, status, view);
  } catch (...) { /* Consumer fault retires both formats below. */
  }
  return accepted ? CHANNEL_RC_OK : fail();
}
UINT TextSession::received_image(const CLIPRDR_FORMAT_DATA_RESPONSE &r, std::uint64_t id) noexcept {
  ImageView view;
  std::vector<std::uint8_t> pixels;
  auto status = TextReply::refused;
  if (request_revision_ != state_.revision)
    status = TextReply::stale;
  else if (r.common.msgFlags == CB_RESPONSE_OK) {
    const ::bridge::compat::span<const std::uint8_t> wire{r.requestedFormatData, r.common.dataLen};
    const auto measured = decode_dib_clipboard(wire, {}, policy_.maximum);
    if (measured.status != ImageStatus::capacity && measured.status != ImageStatus::unsupported &&
        measured.status != ImageStatus::too_large)
      return fail();
    if (measured.status == ImageStatus::capacity) {
      try {
        pixels.resize(measured.bytes);
      } catch (...) {
        return fail();
      }
      if (decode_dib_clipboard(wire, pixels, policy_.maximum).status != ImageStatus::ok) {
        wipe(pixels);
        return fail();
      }
      view = {measured.width, measured.height, pixels, wire.size()};
      status = TextReply::ok;
    }
  }
  bool accepted = false;
  try {
    accepted = image_reply_(id, status, view);
  } catch (...) { /* Consumer faults retire shared ownership below. */
  }
  wipe(pixels);
  return accepted ? CHANNEL_RC_OK : fail();
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
