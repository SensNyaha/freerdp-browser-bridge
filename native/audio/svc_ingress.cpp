#include "svc_ingress.hpp"
#include <exception>
#include <limits>
#include <stdexcept>
#include <utility>

namespace bridge::audio {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
} // namespace
AudioSvcIngress::AudioSvcIngress(Forward forward, std::uint64_t timeout)
    : forward_(std::move(forward)), timeout_ms_(timeout) {
  if (!forward_ || !timeout || timeout > 5000)
    throw std::invalid_argument("Invalid audio SVC ingress");
}
AudioSvcIngress::~AudioSvcIngress() {
  if (busy_)
    std::terminate();
  wipe();
}
void AudioSvcIngress::wipe() noexcept {
  assembler_.reset();
  validator_.reset();
  counters_.stored_bytes = 0;
  deadline_.reset();
}
void AudioSvcIngress::close() noexcept {
  closed_ = true;
  if (!busy_)
    wipe();
}
bool AudioSvcIngress::fail(bool abandoned) noexcept {
  if (!failed_) {
    failed_ = true;
    increment(counters_.rejected);
    if (abandoned)
      increment(counters_.abandoned);
  }
  close();
  return false;
}
bool AudioSvcIngress::poll(std::uint64_t now) noexcept {
  if (closed_)
    return false;
  if (busy_ || (observed_ && now < *observed_) ||
      now > (std::numeric_limits<std::uint64_t>::max)() - timeout_ms_)
    return fail();
  observed_ = now;
  if (deadline_ && now >= *deadline_)
    return fail(true);
  return true;
}
bool AudioSvcIngress::receive(AudioSvcFragment fragment, std::uint64_t now) noexcept {
  if (!poll(now))
    return false;
  increment(counters_.fragments);
  if (fragment.first && !assembler_.assembling() && !validator_.awaiting_wave())
    deadline_ = now + timeout_ms_;
  const auto record =
      assembler_.push(fragment.bytes, fragment.total_bytes, fragment.first, fragment.last);
  if (record.status == FragmentStatus::invalid)
    return fail();
  counters_.stored_bytes += fragment.bytes.size(); // Assembler already bounded the whole total.
  if (record.status == FragmentStatus::collecting)
    return true;
  if (!validator_.validate(record.bytes))
    return fail();
  const auto pending_wave = validator_.awaiting_wave();
  busy_ = true;
  bool accepted = false;
  try {
    accepted = forward_(record.bytes);
  } catch (...) {
    (void)fail();
  }
  busy_ = false;
  if (!accepted && !failed_)
    return fail();
  if (closed_) {
    wipe();
    return false;
  }
  assembler_.reset(); // Completed sample bytes do not remain in the fixed arena.
  counters_.stored_bytes = 0;
  if (!pending_wave)
    deadline_.reset();
  increment(counters_.forwarded);
  return true;
}
AudioSvcStats AudioSvcIngress::stats() const noexcept {
  auto result = counters_;
  result.partial = assembler_.assembling();
  result.awaiting_wave = validator_.awaiting_wave();
  result.dispatching = busy_;
  result.closed = closed_;
  result.failed = failed_;
  return result;
}
} // namespace bridge::audio
