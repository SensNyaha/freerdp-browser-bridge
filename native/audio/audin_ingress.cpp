#include "audin_ingress.hpp"
#include <algorithm>

namespace bridge::audio {
namespace {
std::uint16_t word(std::span<const std::uint8_t> data, std::size_t at) noexcept {
  return static_cast<std::uint16_t>(static_cast<unsigned>(data[at]) |
                                    (static_cast<unsigned>(data[at + 1]) << 8));
}
std::uint32_t dword(std::span<const std::uint8_t> data, std::size_t at) noexcept {
  return static_cast<std::uint32_t>(word(data, at)) |
         (static_cast<std::uint32_t>(word(data, at + 2)) << 16);
}
void dword(std::span<std::uint8_t> data, std::size_t at, std::size_t value) noexcept {
  for (unsigned i = 0; i < 4; ++i)
    data[at + i] = static_cast<std::uint8_t>(value >> (8 * i));
}
bool supported(std::span<const std::uint8_t> data, std::size_t at) noexcept {
  const auto channels = word(data, at + 2);
  return word(data, at) == 1 && (channels == 1 || channels == 2) && dword(data, at + 4) == 48000 &&
         dword(data, at + 8) == 48000U * channels * 2 && word(data, at + 12) == channels * 2 &&
         word(data, at + 14) == 16 && word(data, at + 16) == 0;
}
std::optional<std::size_t> format_size(std::span<const std::uint8_t> data,
                                       std::size_t at) noexcept {
  if (at > data.size() || data.size() - at < 18)
    return {};
  const auto extra = word(data, at + 16);
  if (extra > AudinIngress::max_extra || extra > data.size() - at - 18 ||
      (word(data, at) == 0xfffe && extra != 22))
    return {};
  return 18U + extra;
}
} // namespace
std::optional<AudinPdu> AudinIngress::reject() noexcept {
  phase_ = AudinPhase::failed;
  return {};
}
void AudinIngress::reset() noexcept {
  offer_.fill(0);
  phase_ = AudinPhase::version;
  version_ = count_ = frames_ = 0;
}
std::optional<AudinPdu> AudinIngress::inspect(std::span<const std::uint8_t> data) noexcept {
  if (phase_ == AudinPhase::failed || data.empty() || data.size() > max_bytes)
    return reject();
  switch (data[0]) {
  case 1: {
    if (phase_ != AudinPhase::version || data.size() != 5)
      return reject();
    const auto version = dword(data, 1);
    if (version != 1 && version != 2)
      return reject();
    version_ = version;
    phase_ = AudinPhase::formats;
    return AudinPdu{AudinPduKind::version, data, version_};
  }
  case 2: {
    if (phase_ != AudinPhase::formats || data.size() < 9)
      return reject();
    const auto offered = dword(data, 1);
    if (!offered || offered > max_formats)
      return reject();
    std::size_t at = 9;
    std::uint32_t selected = 0;
    // First pass validates the whole table before changing retained output.
    for (std::uint32_t i = 0; i < offered; ++i) {
      const auto size = format_size(data, at);
      if (!size)
        return reject();
      if (supported(data, at))
        ++selected;
      at += *size;
    }
    // Server cbSizeFormatsPacket is reserved, and arbitrary trailing ExtraData
    // must be ignored. Both stay bounded by the complete-record limit.
    std::copy_n(data.begin(), 9, offer_.begin());
    const auto size = 9 + static_cast<std::size_t>(selected) * 18;
    dword(offer_, 1, selected);
    dword(offer_, 5, size);
    std::size_t written = 9;
    for (std::uint32_t i = 0, offset = 9; i < offered; ++i) {
      if (supported(data, offset)) {
        std::copy_n(data.begin() + offset, 18, offer_.begin() + written);
        written += 18;
      }
      offset += 18U + word(data, offset + 16);
    }
    count_ = selected;
    phase_ = count_ ? AudinPhase::open : AudinPhase::unsupported;
    return AudinPdu{
        AudinPduKind::formats, std::span(offer_).first(size), version_, count_, 0, 0, count_ != 0};
  }
  case 3: {
    if (phase_ != AudinPhase::open || data.size() < 27)
      return reject();
    const auto frames = dword(data, 1), index = dword(data, 5);
    const auto preferred = format_size(data, 9);
    if (!frames || frames > max_frames || index >= count_ || !preferred ||
        data.size() != 9 + *preferred)
      return reject();
    if (profile_ == AudinCaptureProfile::worker && frames < worker_min_frames)
      // A valid but too frequent request gets a failed Open Reply. Keep the
      // negotiated table so the server may retry Open with an admissible size.
      return AudinPdu{AudinPduKind::open, data, version_, count_, index, frames, false};
    // Capture preference is structurally checked; pinned AUDIN records from
    // the selected negotiated format. No preferred-format payload is retained.
    frames_ = frames;
    phase_ = AudinPhase::recording;
    return AudinPdu{AudinPduKind::open, data, version_, count_, index, frames_};
  }
  case 7: {
    if (phase_ != AudinPhase::recording || data.size() != 5 || dword(data, 1) >= count_)
      return reject();
    return AudinPdu{AudinPduKind::change, data, version_, count_, dword(data, 1), frames_};
  }
  default:
    return reject();
  }
}
} // namespace bridge::audio
