#include "../compat/span.hpp"
#include "avc_admission.hpp"
#include <algorithm>

namespace bridge::media {
namespace {
class Bits {
  ::bridge::compat::span<const std::uint8_t> data_;
  std::size_t cursor_ = 0;
  unsigned remaining_ = 0, zeros_ = 0;
  std::uint8_t byte_ = 0;

public:
  explicit Bits(::bridge::compat::span<const std::uint8_t> data) : data_(data) {}
  bool read(unsigned count, std::uint32_t &value) noexcept {
    value = 0;
    for (unsigned i = 0; i < count; ++i) {
      if (!remaining_) {
        if (cursor_ == data_.size())
          return false;
        byte_ = data_[cursor_++];
        if (zeros_ == 2 && byte_ == 3) {
          if (cursor_ == data_.size() || data_[cursor_] > 3)
            return false;
          zeros_ = 0;
          byte_ = data_[cursor_++];
        }
        zeros_ = byte_ == 0 ? std::min(zeros_ + 1, 2U) : 0;
        remaining_ = 8;
      }
      value = (value << 1) | ((byte_ >> --remaining_) & 1U);
    }
    return true;
  }
  bool ue(std::uint32_t &value) noexcept {
    unsigned zeros = 0;
    std::uint32_t bit = 0;
    while (true) {
      if (!read(1, bit))
        return false;
      if (bit)
        break;
      if (++zeros > 31)
        return false;
    }
    if (!read(zeros, value))
      return false;
    value += (std::uint32_t{1} << zeros) - 1;
    return true;
  }
  bool se(std::int32_t &value) noexcept {
    std::uint32_t code = 0;
    if (!ue(code) || code == UINT32_MAX)
      return false;
    const auto magnitude = static_cast<std::int32_t>((code + 1U) / 2U);
    value = (code & 1U) ? magnitude : -magnitude;
    return true;
  }
};
bool sps(::bridge::compat::span<const std::uint8_t> bytes, const AvcDecodeLimits &limits) noexcept {
  Bits bits(bytes);
  std::uint32_t profile = 0, value = 0;
  if (!bits.read(8, profile) || !bits.read(8, value) || !bits.read(8, value) || !bits.ue(value) ||
      value >= 32)
    return false;
  // Exact profiles/chroma/depth accepted by pinned OpenH264 2.6 ParseSps.
  if (profile != 66 && profile != 77 && profile != 88 && profile != 83 && profile != 86 &&
      profile != 100)
    return false;
  if (profile == 83 || profile == 86 || profile == 100) {
    if (!bits.ue(value) || value > 1 || !bits.ue(value) || value != 0 || !bits.ue(value) ||
        value != 0 || !bits.read(1, value) || !bits.read(1, value))
      return false;
    if (value) {
      for (unsigned list = 0; list < 8; ++list) {
        if (!bits.read(1, value))
          return false;
        if (!value)
          continue;
        std::int32_t last = 8, next = 8;
        for (unsigned i = 0; i < (list < 6 ? 16U : 64U); ++i) {
          if (next) {
            std::int32_t delta = 0;
            if (!bits.se(delta) || delta < -128 || delta > 127)
              return false;
            next = (last + delta + 256) % 256;
          }
          if (next)
            last = next;
        }
      }
    }
  }
  std::uint32_t poc = 0;
  if (!bits.ue(value) || value > 12 || !bits.ue(poc) || poc > 2)
    return false;
  if (poc == 0) {
    if (!bits.ue(value) || value > 12)
      return false;
  } else if (poc == 1) {
    std::int32_t offset = 0;
    if (!bits.read(1, value) || !bits.se(offset) || !bits.se(offset) || !bits.ue(value) ||
        value > 255)
      return false;
    for (std::uint32_t i = 0; i < value; ++i)
      if (!bits.se(offset))
        return false;
  }
  std::uint32_t width = 0, height = 0;
  if (!bits.ue(value) || value > 16 || !bits.read(1, value) || !bits.ue(width) ||
      !bits.ue(height) || !bits.read(1, value) || value != 1)
    return false; // Pinned decoder refuses interlaced/MBAFF SPS.
  // Compare before adding/multiplying remote UE fields. Cropping cannot reduce allocations.
  return width < limits.width / 16U && height < limits.height / 16U;
}
std::size_t start(::bridge::compat::span<const std::uint8_t> bytes, std::size_t from) noexcept {
  for (std::size_t i = from; i + 2 < bytes.size(); ++i)
    if (bytes[i] == 0 && bytes[i + 1] == 0 && bytes[i + 2] == 1)
      return i;
  return bytes.size();
}
} // namespace
bool admit_avc_decode(::bridge::compat::span<const std::uint8_t> bytes, AvcDecodeLimits limits) noexcept {
  if (!limits.bytes || limits.bytes > AvcDecodeLimits::hard_bytes || !limits.nals ||
      limits.nals > AvcDecodeLimits::hard_nals || limits.width < 16 ||
      limits.width > AvcDecodeLimits::hard_width || limits.height < 16 ||
      limits.height > AvcDecodeLimits::hard_height || bytes.empty() || bytes.size() > limits.bytes)
    return false;
  auto prefix = start(bytes, 0);
  if (prefix == bytes.size() ||
      !std::all_of(bytes.begin(), bytes.begin() + prefix, [](auto byte) { return byte == 0; }))
    return false;
  std::size_t count = 0;
  while (prefix != bytes.size()) {
    if (++count > limits.nals)
      return false;
    const auto body = prefix + 3;
    const auto next = start(bytes, body);
    auto end = next;
    while (end > body && bytes[end - 1] == 0)
      --end; // Annex-B trailing_zero_8bits / optional fourth start-code byte.
    if (end == body || (bytes[body] & 0x80U))
      return false;
    const auto type = bytes[body] & 0x1fU;
    if ((type == 7 || type == 15) && !sps(bytes.subspan(body + 1, end - body - 1), limits))
      return false;
    prefix = next;
  }
  return true;
}
} // namespace bridge::media
