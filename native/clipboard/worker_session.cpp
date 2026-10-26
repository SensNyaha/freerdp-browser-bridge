#include "../compat/span.hpp"
#include "worker_session.hpp"
#include <algorithm>
#include <limits>
#include <stdexcept>
#include <utility>
#include <winpr/error.h>

namespace bridge::clipboard {
namespace {
namespace wire = ipc::clipboard;
void wipe(std::vector<std::uint8_t> &b) noexcept {
  volatile std::uint8_t *output = b.data();
  for (std::size_t i = 0; i < b.size(); ++i)
    output[i] = 0;
  std::vector<std::uint8_t>{}.swap(b);
}
constexpr std::uint64_t dispatch_ms = 250, publication_ms = 1000, html_read_ms = 10000;
} // namespace
WorkerSession::WorkerSession(TextPolicy policy, Send send, Clock clock,
                             TextSession::Resolve resolve)
    : policy_(policy), send_(std::move(send)), clock_(std::move(clock)), resolve_(resolve) {
  if ((!policy.to_server && !policy.from_server) || !policy.maximum ||
      policy.maximum > max_item_bytes || !send_ || !clock_ || !resolve_)
    throw std::invalid_argument("Invalid clipboard worker owner");
}
WorkerSession::~WorkerSession() {
  // The inner public callback owner must be destroyed on its RDP thread.
  if (text_)
    std::terminate();
  release_job();
}
bool WorkerSession::current_thread() const noexcept {
  return started_ && owner_ == std::this_thread::get_id();
}
bool WorkerSession::observe() noexcept {
  try {
    const auto t = clock_();
    if ((seen_clock_ && t < now_) || t > (std::numeric_limits<std::uint64_t>::max)() - html_read_ms)
      return false;
    now_ = t;
    seen_clock_ = true;
    return true;
  } catch (...) {
    return false;
  }
}
bool WorkerSession::start(std::uint64_t generation) noexcept {
  if (started_ || !generation)
    return false;
  started_ = true;
  owner_ = std::this_thread::get_id();
  generation_ = generation;
  if (!observe())
    return false;
  try {
    text_ = std::make_unique<TextSession>(
        policy_, [](auto, auto) { return true; },
        [this](auto id, auto status, auto bytes) { return reply(id, status, bytes); }, clock_,
        resolve_, [this](auto id, auto status, HtmlView view) { return reply_html(id, status, view); });
  } catch (...) {
    return false;
  }
  std::lock_guard lock(mutex_);
  stopped_ = false;
  return true;
}
UINT WorkerSession::bind(CliprdrClientContext &c) noexcept {
  if (!current_thread() || pumping_ || !text_ || bound_)
    return ERROR_INVALID_STATE;
  const auto rc = text_->bind(c);
  bound_ = rc == CHANNEL_RC_OK;
  return rc;
}
std::optional<wire::Status> WorkerSession::submit(std::uint64_t id,
                                                  std::vector<std::uint8_t> &payload) noexcept {
  try {
    const auto c = wire::decode_command(payload);
    if (!id)
      return wire::Status::invalid;
    if (wire::is_html(c.operation) && !policy_.html)
      return wire::Status::unavailable;
    if (c.operation == wire::Operation::set &&
        encode_unicode_text(c.text, {}, policy_.maximum).status != TextStatus::capacity)
      return wire::Status::refused;
    if (c.operation == wire::Operation::set_html) {
      wire::HtmlItem item;
      try {
        item = wire::decode_html_item(c.text, policy_.maximum);
      } catch (const ipc::ProtocolError &) {
        return wire::Status::refused;
      }
      const auto html = encode_html_clipboard(item.body, {}, policy_.maximum);
      const auto text = item.text ? encode_unicode_text(*item.text, {}, policy_.maximum)
                                  : TextResult{TextStatus::capacity, 0};
      if (html.status != TextStatus::capacity || text.status != TextStatus::capacity ||
          text.bytes > policy_.maximum - html.bytes)
        return wire::Status::refused;
    }
    const auto t = clock_();
    if (t > (std::numeric_limits<std::uint64_t>::max)() - dispatch_ms)
      return wire::Status::unavailable;
    // Never wait for an owner operation on the root IPC thread.
    std::unique_lock lock(mutex_, std::try_to_lock);
    if (!lock.owns_lock())
      return wire::Status::busy;
    if (stopped_ || !admitted_ || !admitted_->ready)
      return wire::Status::unavailable;
    if (c.generation != admitted_->generation ||
        (wire::is_read(c.operation) && c.revision != admitted_->revision))
      return wire::Status::stale;
    if (occupied_)
      return wire::Status::busy;
    if (wire::is_read(c.operation)
            ? (!policy_.from_server || admitted_->remote_pending ||
               (c.operation == wire::Operation::read_html ? !admitted_->remote_html : !admitted_->remote_text))
            : (((c.operation == wire::Operation::set || c.operation == wire::Operation::set_html) && !policy_.to_server) ||
               admitted_->local_pending))
      return wire::Status::refused;
    queued_.emplace(
        Job{c.operation, c.generation, c.revision, id, t + dispatch_ms, std::move(payload)});
    occupied_ = true;
    return {};
  } catch (...) {
    return wire::Status::invalid;
  }
}
bool WorkerSession::complete(wire::Status status, ::bridge::compat::span<const std::uint8_t> bytes) noexcept {
  if (!active_ || !result_.empty())
    return false;
  try {
    result_ = wire::encode_result(
        {active_->operation, status, active_->generation, active_->revision, bytes});
    wipe(active_->payload);
    wipe(html_result_);
    html_wire_bytes_ = 0;
    html_deadline_ = 0;
    html_fallback_ = html_text_pending_ = false;
    return true;
  } catch (...) {
    return false;
  }
}
bool WorkerSession::reply(std::uint64_t id, TextReply status,
                          ::bridge::compat::span<const std::uint8_t> bytes) noexcept {
  if (!current_thread() || !active_ || active_->id != id ||
      !wire::is_read(active_->operation))
    return false;
  if (active_->operation == wire::Operation::read_html) {
    if (!observe() || !html_deadline_ || now_ >= html_deadline_)
      return false;
    if (html_result_.empty())
      return false;
    if (status != TextReply::ok)
      return complete(status == TextReply::stale ? wire::Status::stale : wire::Status::refused);
    try {
      auto item = wire::decode_html_item(html_result_, policy_.maximum);
      item.text = bytes;
      return complete_html(item);
    } catch (...) {
      return false;
    }
  }
  return complete(status == TextReply::ok      ? wire::Status::accepted
                  : status == TextReply::stale ? wire::Status::stale
                                               : wire::Status::refused,
                  bytes);
}
bool WorkerSession::complete_html(const wire::HtmlItem &item) noexcept {
  try {
    wire::validate_html_item(item, policy_.maximum);
    const auto text = item.text ? encode_unicode_text(*item.text, {}, policy_.maximum)
                                : TextResult{TextStatus::capacity, 0};
    if (text.status != TextStatus::capacity || html_wire_bytes_ > policy_.maximum ||
        text.bytes > policy_.maximum - html_wire_bytes_)
      return complete(wire::Status::refused);
    auto encoded = wire::encode_html_item(item, policy_.maximum);
    const auto ok = complete(wire::Status::accepted, encoded);
    wipe(encoded);
    return ok;
  } catch (const ipc::ProtocolError &) {
    return complete(wire::Status::refused);
  } catch (...) {
    return false;
  }
}
bool WorkerSession::reply_html(std::uint64_t id, TextReply status, HtmlView view) noexcept {
  if (!current_thread() || !active_ || active_->id != id ||
      active_->operation != wire::Operation::read_html || !html_result_.empty())
    return false;
  if (!observe() || !html_deadline_ || now_ >= html_deadline_)
    return false;
  if (status != TextReply::ok)
    return complete(status == TextReply::stale ? wire::Status::stale : wire::Status::refused);
  const wire::HtmlItem item{view.body, view.fragment_offset, view.fragment_bytes,
                            view.selection_offset, view.selection_bytes, view.context, view.selection, {}};
  html_wire_bytes_ = view.wire_bytes;
  if (!html_fallback_)
    return complete_html(item);
  try {
    html_result_ = wire::encode_html_item(item, policy_.maximum);
    html_text_pending_ = true;
    return true;
  } catch (const ipc::ProtocolError &) {
    return complete(wire::Status::refused);
  } catch (...) {
    return false;
  }
}
bool WorkerSession::publish(const TextSnapshot &s) {
  const wire::State state{generation_,
                          s.revision,
                          static_cast<std::uint32_t>(policy_.maximum),
                          s.ready,
                          policy_.to_server,
                          policy_.from_server,
                          s.ready && s.remote_text,
                          s.ready && s.local_accepted,
                          s.ready && policy_.to_server && s.awaiting_local,
                          s.ready && policy_.from_server &&
                              (s.awaiting_remote || (active_ && active_->operation == wire::Operation::read_html && result_.empty())),
                          policy_.html, s.ready && s.remote_html, s.ready && s.local_html_accepted};
  const auto bytes = wire::encode_state(state);
  if (published_ && *published_ == bytes)
    return true;
  if (!send_(ipc::Kind::clipboard_state, 0, bytes))
    return false;
  published_ = bytes;
  std::lock_guard lock(mutex_);
  if (!stopped_)
    admitted_ = state;
  return true;
}
bool WorkerSession::pump() noexcept {
  if (!current_thread() || pumping_ || !text_)
    return false;
  pumping_ = true;
  bool ok = false;
  try {
    ok = [&] {
      if (!observe())
        return false;
      if (bound_ && !text_->poll())
        return false;
      auto s = text_->snapshot();
      if (!s || s->failed)
        return false;
      if (html_deadline_ && now_ >= html_deadline_)
        return false;
      if (!active_) {
        std::lock_guard lock(mutex_);
        if (queued_) {
          active_ = std::move(queued_);
          queued_.reset();
        }
      }
      if (active_ && !active_->payload.empty()) {
        const auto &job = *active_;
        if (now_ < job.deadline - dispatch_ms)
          return false;
        auto refusal = wire::Status::accepted;
        if (now_ >= job.deadline)
          refusal = wire::Status::timeout;
        else if (!s->ready)
          refusal = wire::Status::unavailable;
        else if (job.generation != generation_ ||
                 (wire::is_read(job.operation) && job.revision != s->revision))
          refusal = wire::Status::stale;
        else if (wire::is_read(job.operation) ?
                     (job.operation == wire::Operation::read_html ? !s->remote_html : !s->remote_text) || s->awaiting_remote
                                                        : s->awaiting_local)
          refusal = wire::Status::busy;
        if (refusal != wire::Status::accepted) {
          if (!complete(refusal))
            return false;
        } else {
          UINT rc = ERROR_INVALID_STATE;
          if (job.operation == wire::Operation::read_html) {
            html_fallback_ = s->remote_text;
            html_deadline_ = now_ + html_read_ms;
            rc = text_->request_html(job.revision, job.id);
          } else if (job.operation == wire::Operation::read)
            rc = text_->request(job.revision, job.id);
          else if (job.operation == wire::Operation::set_html) {
            const auto item = wire::decode_html_item(
                ::bridge::compat::span(job.payload).subspan(wire::metadata_bytes), policy_.maximum);
            rc = text_->set_local_html(item.body, item.text);
          } else if (job.operation == wire::Operation::set)
            rc = text_->set_local(::bridge::compat::span(job.payload).subspan(wire::metadata_bytes));
          else
            rc = text_->revoke_local();
          // The delegate may synchronously complete a read into result_.
          if (rc != CHANNEL_RC_OK)
            return false;
          wipe(active_->payload);
        }
        s = text_->snapshot();
        if (!s || s->failed)
          return false;
      }
      if (html_text_pending_ && active_ && result_.empty()) {
        if (active_->revision != s->revision) {
          if (!complete(wire::Status::stale))
            return false;
        } else {
          html_text_pending_ = false;
          if (text_->request(active_->revision, active_->id) != CHANNEL_RC_OK)
            return false;
        }
        s = text_->snapshot();
        if (!s || s->failed)
          return false;
      }
      if (active_ && !wire::is_read(active_->operation) && result_.empty() &&
          !s->awaiting_local &&
          !complete(s->local_response_ok ? wire::Status::accepted : wire::Status::refused))
        return false;
      // An offered value can change while an encoded result awaits output.
      if (active_ && wire::is_read(active_->operation) && !result_.empty() &&
          active_->revision != s->revision) {
        wipe(result_);
        if (!complete(wire::Status::stale))
          return false;
      }
      const bool state_sent = publish(*s);
      bool result_sent = result_.empty();
      if (state_sent && !result_.empty()) {
        result_sent = send_(ipc::Kind::clipboard_result, active_->id, result_);
        if (result_sent) {
          wipe(result_);
          active_.reset();
          std::lock_guard lock(mutex_);
          occupied_ = false;
        }
      }
      if (state_sent && result_sent)
        output_deadline_ = 0;
      else if (!output_deadline_)
        output_deadline_ = now_ + publication_ms;
      return !output_deadline_ || now_ < output_deadline_;
    }();
  } catch (...) {
    ok = false;
  }
  pumping_ = false;
  if (retire_requested_)
    return fail();
  return ok || fail();
}
void WorkerSession::release_job() noexcept {
  if (queued_)
    wipe(queued_->payload);
  queued_.reset();
  if (active_)
    wipe(active_->payload);
  active_.reset();
  wipe(result_);
  wipe(html_result_);
  html_wire_bytes_ = 0;
  html_deadline_ = 0;
  html_fallback_ = html_text_pending_ = false;
  occupied_ = false;
}
void WorkerSession::retire() noexcept {
  if (!current_thread())
    return;
  retire_requested_ = true;
  {
    std::lock_guard lock(mutex_);
    stopped_ = true;
    admitted_.reset();
  }
  if (pumping_)
    return; // The current transport borrow must finish first.
  if (text_) {
    (void)text_->close();
    text_.reset();
  }
  bound_ = false;
  std::lock_guard lock(mutex_);
  release_job();
}
bool WorkerSession::fail() noexcept {
  retire();
  return false;
}
std::optional<wire::State> WorkerSession::admitted() const noexcept {
  std::lock_guard lock(mutex_);
  return admitted_;
}
} // namespace bridge::clipboard
