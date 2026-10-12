#include "dvc_svc_ingress.hpp"
#include <algorithm>
#include <limits>
#include <stdexcept>
#include <utility>

namespace bridge::channels {
namespace {
void increment(std::uint64_t &value) noexcept {
  if (value != (std::numeric_limits<std::uint64_t>::max)())
    ++value;
}
} // namespace
DvcSvcIngress::DvcSvcIngress(Forward forward, DvcAllocationLimits limits, std::uint64_t timeout_ms)
    : forward_(std::move(forward)), limits_(limits), timeout_ms_(timeout_ms) {
  if (!forward_ || !limits_.valid() || timeout_ms == 0 || timeout_ms > 5000)
    throw std::invalid_argument("Invalid DVC SVC ingress");
}
DvcSvcIngress::~DvcSvcIngress() { release(); }
void DvcSvcIngress::release() noexcept {
  std::fill(bytes_.begin(), bytes_.end(), 0);
  std::vector<std::uint8_t>{}.swap(bytes_);
  used_ = total_ = 0;
  deadline_.reset();
}
void DvcSvcIngress::close() noexcept {
  closed_ = true;
  // A reentrant retirement cannot wipe a span still borrowed by the dispatcher.
  if (!busy_)
    release();
}
bool DvcSvcIngress::fail(bool abandoned) noexcept {
  if (!failed_) {
    failed_ = true;
    increment(counters_.rejected);
    if (abandoned)
      increment(counters_.abandoned);
  }
  close();
  return false;
}
bool DvcSvcIngress::clock(std::uint64_t now) noexcept {
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
bool DvcSvcIngress::poll(std::uint64_t now) noexcept { return clock(now); }
bool DvcSvcIngress::dispatch(std::span<const std::uint8_t> payload) noexcept {
  if (!inspect_dvc_allocations(payload, limits_))
    return fail();
  busy_ = true;
  bool accepted = false;
  try {
    accepted = forward_(payload);
  } catch (...) {
    if (!failed_) {
      failed_ = true;
      increment(counters_.rejected);
    }
    closed_ = true;
  }
  busy_ = false;
  release();
  if (!accepted && !failed_)
    return fail();
  if (closed_)
    return false;
  increment(counters_.forwarded);
  return true;
}
bool DvcSvcIngress::receive(DvcSvcFragment fragment, std::uint64_t now) noexcept {
  if (!clock(now))
    return false;
  increment(counters_.fragments);
  if (!fragment.total_bytes || fragment.total_bytes > limits_.encoded_bytes ||
      fragment.bytes.size() > fragment.total_bytes || (fragment.first && deadline_) ||
      (!fragment.first && !deadline_))
    return fail();
  if (fragment.first && fragment.last) {
    if (fragment.bytes.size() != fragment.total_bytes)
      return fail();
    return dispatch(fragment.bytes); // Synchronous whole packets need no staging allocation.
  }
  if (fragment.first) {
    if (fragment.bytes.empty())
      return fail();
    total_ = fragment.total_bytes;
    deadline_ = now + timeout_ms_;
    try {
      bytes_.resize(total_);
    } catch (...) {
      return fail();
    }
  }
  if (fragment.total_bytes != total_ || fragment.bytes.size() > total_ - used_ ||
      (fragment.bytes.empty() && (!fragment.last || used_ != total_)))
    return fail();
  std::copy(fragment.bytes.begin(), fragment.bytes.end(), bytes_.begin() + used_);
  used_ += fragment.bytes.size();
  if (!fragment.last)
    return true;
  if (used_ != total_)
    return fail();
  return dispatch(std::span(bytes_).first(used_));
}
DvcSvcStats DvcSvcIngress::stats() const noexcept {
  auto result = counters_;
  result.stored_bytes = used_;
  result.allocated_bytes = bytes_.capacity();
  result.partial = deadline_.has_value();
  result.dispatching = busy_;
  result.closed = closed_;
  result.failed = failed_;
  return result;
}
} // namespace bridge::channels
