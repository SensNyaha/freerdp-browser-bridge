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
  std::fill(b.begin(), b.end(), 0);
  std::vector<std::uint8_t>{}.swap(b);
}
constexpr std::uint64_t dispatch_ms = 250, publication_ms = 1000;
} // namespace
WorkerSession::WorkerSession(TextPolicy policy, Send send, Clock clock)
    : policy_(policy), send_(std::move(send)), clock_(std::move(clock)) {
  if ((!policy.to_server && !policy.from_server) || !policy.maximum ||
      policy.maximum > max_item_bytes || !send_ || !clock_)
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
    if ((seen_clock_ && t < now_) || t > (std::numeric_limits<std::uint64_t>::max)() - 5000)
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
        [this](auto id, auto status, auto bytes) { return reply(id, status, bytes); }, clock_);
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
    if (c.operation == wire::Operation::set &&
        encode_unicode_text(c.text, {}, policy_.maximum).status != TextStatus::capacity)
      return wire::Status::refused;
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
        (c.operation == wire::Operation::read && c.revision != admitted_->revision))
      return wire::Status::stale;
    if (occupied_)
      return wire::Status::busy;
    if (c.operation == wire::Operation::read
            ? (!policy_.from_server || !admitted_->remote_text || admitted_->remote_pending)
            : (!policy_.to_server || admitted_->local_pending))
      return wire::Status::refused;
    queued_.emplace(
        Job{c.operation, c.generation, c.revision, id, t + dispatch_ms, std::move(payload)});
    occupied_ = true;
    return {};
  } catch (...) {
    return wire::Status::invalid;
  }
}
bool WorkerSession::complete(wire::Status status, std::span<const std::uint8_t> bytes) noexcept {
  if (!active_ || !result_.empty())
    return false;
  try {
    result_ = wire::encode_result(
        {active_->operation, status, active_->generation, active_->revision, bytes});
    wipe(active_->payload);
    return true;
  } catch (...) {
    return false;
  }
}
bool WorkerSession::reply(std::uint64_t id, TextReply status,
                          std::span<const std::uint8_t> bytes) noexcept {
  if (!current_thread() || !active_ || active_->id != id ||
      active_->operation != wire::Operation::read)
    return false;
  return complete(status == TextReply::ok      ? wire::Status::accepted
                  : status == TextReply::stale ? wire::Status::stale
                                               : wire::Status::refused,
                  bytes);
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
                          s.ready && policy_.from_server && s.awaiting_remote};
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
                 (job.operation == wire::Operation::read && job.revision != s->revision))
          refusal = wire::Status::stale;
        else if (job.operation == wire::Operation::read ? !s->remote_text || s->awaiting_remote
                                                        : s->awaiting_local)
          refusal = wire::Status::busy;
        if (refusal != wire::Status::accepted) {
          if (!complete(refusal))
            return false;
        } else {
          const auto rc =
              job.operation == wire::Operation::read
                  ? text_->request(job.revision, job.id)
                  : text_->set_local(std::span(job.payload).subspan(wire::metadata_bytes));
          // The delegate may synchronously complete a read into result_.
          if (rc != CHANNEL_RC_OK)
            return false;
          wipe(active_->payload);
        }
        s = text_->snapshot();
        if (!s || s->failed)
          return false;
      }
      if (active_ && active_->operation == wire::Operation::set && result_.empty() &&
          !s->awaiting_local &&
          !complete(s->local_accepted ? wire::Status::accepted : wire::Status::refused))
        return false;
      // An offered value can change while an encoded result awaits output.
      if (active_ && active_->operation == wire::Operation::read && !result_.empty() &&
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
