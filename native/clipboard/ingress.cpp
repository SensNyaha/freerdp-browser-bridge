#include "ingress.hpp"
#include <algorithm>
#include <exception>
#include <limits>
#include <stdexcept>
#include <utility>

namespace bridge::clipboard {
namespace {
std::uint16_t u16(std::span<const std::uint8_t> b, std::size_t p) noexcept {
  return static_cast<std::uint16_t>(b[p] | (std::uint16_t{b[p + 1]} << 8));
}
std::uint32_t u32(std::span<const std::uint8_t> b, std::size_t p) noexcept {
  return u16(b, p) | (std::uint32_t{u16(b, p + 2)} << 16);
}
void increment(std::uint64_t &v) noexcept {
  if (v != (std::numeric_limits<std::uint64_t>::max)())
    ++v;
}
bool header(std::span<const std::uint8_t> b, std::size_t total, std::size_t maximum) noexcept {
  if (!maximum || maximum > max_item_bytes || b.size() < 8 || total < 8 ||
      total > max_item_bytes + 8)
    return false;
  const auto kind = u16(b, 0), flags = u16(b, 2);
  const auto size = u32(b, 4);
  // XRDP 0.9.21.1 appends one zero DWORD outside dataLen. Body bounds still
  // use the declared size; inspect_pdu checks every trailer byte before use.
  if (size != total - 8 && (total < 12 || size != total - 12))
    return false;
  switch (kind) {
  case 1:
    return !flags && !size; // Monitor Ready
  case 2:
    return (flags == 0 || flags == 4) && size <= max_control_bytes;
  case 3:
    return (flags == 1 || flags == 2) && !size;
  case 4:
    return !flags && size == 4;
  case 5:
    return (flags == 1 && size <= max_item_bytes) || (flags == 2 && !size);
  case 7:
    return !flags && size >= 4 && size <= max_control_bytes;
  default:
    return false; // No file/lock/temp-directory profile is negotiated here.
  }
}
} // namespace
std::optional<PduInfo> inspect_pdu(std::span<const std::uint8_t> b, bool long_names,
                                   std::size_t maximum) noexcept {
  if (!header(b, b.size(), maximum))
    return {};
  const auto kind = u16(b, 0);
  const auto body = b.subspan(8, u32(b, 4));
  const auto trailer = b.subspan(8 + body.size());
  if (!std::all_of(trailer.begin(), trailer.end(), [](auto v) { return v == 0; }))
    return {};
  if (kind == 7) {
    const auto count = u16(body, 0);
    if (!count || count > 16 || u16(body, 2))
      return {};
    std::size_t at = 4;
    bool general = false;
    for (unsigned i = 0; i < count; ++i) {
      // The pinned client only implements the fixed general capability set.
      if (body.size() - at < 12 || u16(body, at) != 1 || u16(body, at + 2) != 12 || general)
        return {};
      const auto version = u32(body, at + 4);
      if (version != 1 && version != 2)
        return {};
      long_names = (u32(body, at + 8) & 2) != 0;
      general = true;
      at += 12;
    }
    if (at != body.size())
      return {};
  } else if (kind == 2) {
    if (!long_names) {
      if (body.size() % 36 || body.size() / 36 > max_formats)
        return {};
      // Fixed 32-byte names may be unterminated, as with mstsc/RDSH.
      // Their resource cost is bounded independently of their encoding.
    } else {
      if (u16(b, 2))
        return {};
      std::size_t at = 0, count = 0;
      while (at < body.size()) {
        // Pinned parser permits up to three trailing padding bytes.
        if (body.size() - at < 4) {
          if (!std::all_of(body.begin() + at, body.end(), [](auto v) { return v == 0; }))
            return {};
          break;
        }
        if (++count > max_formats)
          return {};
        at += 4;
        const auto start = at;
        for (;;) {
          if (body.size() - at < 2 || at - start > max_name_bytes)
            return {};
          const auto value = u16(body, at);
          at += 2;
          if (!value)
            break;
        }
      }
    }
  }
  return PduInfo{kind, long_names, kind == 5 && u16(b, 2) == 1 && body.size() > maximum};
}
ClipboardIngress::ClipboardIngress(Forward forward, std::size_t maximum, std::uint64_t timeout)
    : forward_(std::move(forward)), maximum_(maximum), timeout_(timeout) {
  if (!forward_ || !maximum || maximum > max_item_bytes || !timeout || timeout > 5000)
    throw std::invalid_argument("Invalid clipboard ingress");
}
ClipboardIngress::~ClipboardIngress() {
  if (busy_)
    std::terminate();
  release();
}
void ClipboardIngress::release() noexcept {
  std::fill(bytes_.begin(), bytes_.end(), 0);
  std::vector<std::uint8_t>{}.swap(bytes_);
  header_.fill(0);
  used_ = total_ = fragments_ = 0;
  discarding_ = false;
  deadline_.reset();
}
void ClipboardIngress::close() noexcept {
  closed_ = true;
  if (!busy_)
    release();
}
bool ClipboardIngress::fail() noexcept {
  if (!failed_) {
    failed_ = true;
    increment(counters_.rejected);
  }
  close();
  return false;
}
bool ClipboardIngress::poll(std::uint64_t now) noexcept {
  if (closed_)
    return false;
  if (busy_ || (observed_ && now < *observed_) ||
      now > (std::numeric_limits<std::uint64_t>::max)() - timeout_ ||
      (deadline_ && now >= *deadline_))
    return fail();
  observed_ = now;
  return true;
}
bool ClipboardIngress::dispatch(std::span<const std::uint8_t> b, bool quota_refused) noexcept {
  const auto info = inspect_pdu(b, long_names_, maximum_);
  if (!info)
    return fail();
  const std::array<std::uint8_t, 8> refused{5, 0, 2, 0, 0, 0, 0, 0};
  quota_refused = quota_refused || info->quota_refused;
  if (quota_refused)
    increment(counters_.quota_refused);
  discarding_ = quota_refused;
  busy_ = true;
  bool accepted = false;
  try {
    const auto normalized = b.first(8 + u32(b, 4));
    accepted = forward_(quota_refused ? std::span<const std::uint8_t>(refused) : normalized);
  } catch (...) {
    (void)fail();
  }
  busy_ = false;
  release();
  if (!accepted)
    return fail();
  if (closed_)
    return false;
  long_names_ = info->long_names;
  increment(counters_.forwarded);
  return true;
}
bool ClipboardIngress::receive(SvcFragment f, std::uint64_t now) noexcept {
  if (!poll(now))
    return false;
  if (f.total < 8 || f.total > max_item_bytes + 8 || f.bytes.empty() || f.bytes.size() > f.total ||
      (f.first && deadline_) || (!f.first && !deadline_))
    return fail();
  if (f.first && f.last) {
    if (f.bytes.size() != f.total)
      return fail();
    return dispatch(f.bytes);
  }
  if (f.first) {
    total_ = f.total;
    deadline_ = now + timeout_;
  }
  if (f.total != total_ || ++fragments_ > max_fragments || f.bytes.size() > total_ - used_)
    return fail();
  auto remaining = f.bytes;
  if (used_ < 8) {
    const auto n = (std::min)(remaining.size(), 8 - used_);
    std::copy_n(remaining.begin(), n, header_.begin() + used_);
    used_ += n;
    remaining = remaining.subspan(n);
    if (used_ == 8) {
      if (!header(header_, total_, maximum_))
        return fail();
      discarding_ = u16(header_, 0) == 5 && u16(header_, 2) == 1 && u32(header_, 4) > maximum_;
      if (!discarding_) {
        try {
          bytes_.resize(total_);
        } catch (...) {
          return fail();
        }
        std::copy(header_.begin(), header_.end(), bytes_.begin());
      }
    }
  }
  if (!remaining.empty()) {
    if (!discarding_)
      std::copy(remaining.begin(), remaining.end(), bytes_.begin() + used_);
    else {
      // Even an over-quota drain must validate padding before completing a
      // refusal. Never store or expose its body; inspect only trailer bytes.
      const auto end = 8 + static_cast<std::size_t>(u32(header_, 4));
      if (used_ + remaining.size() > end) {
        const auto trailer = remaining.subspan(end > used_ ? end - used_ : 0);
        if (!std::all_of(trailer.begin(), trailer.end(), [](auto v) { return v == 0; }))
          return fail();
      }
    }
    used_ += remaining.size();
  }
  if (!f.last)
    return true;
  if (used_ != total_)
    return fail();
  if (discarding_) {
    const std::array<std::uint8_t, 8> refused{5, 0, 2, 0, 0, 0, 0, 0};
    return dispatch(refused, true);
  }
  return dispatch(bytes_);
}
IngressStats ClipboardIngress::stats() const noexcept {
  auto result = counters_;
  result.stored = discarding_ ? (std::min)(used_, header_.size()) : used_;
  result.allocated = bytes_.capacity();
  result.fragments = fragments_;
  result.partial = deadline_.has_value();
  result.closed = closed_;
  result.failed = failed_;
  result.discarding = discarding_;
  return result;
}
} // namespace bridge::clipboard
