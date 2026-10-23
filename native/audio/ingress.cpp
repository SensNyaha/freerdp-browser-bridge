#include "../compat/span.hpp"
#include "ingress.hpp"
#include <algorithm>

namespace bridge::audio {
AudioAssembler::AudioAssembler()
    : bytes_(std::make_unique<std::array<std::uint8_t, max_bytes>>()) {}
void AudioAssembler::reset() noexcept {
  used_ = total_ = fragments_ = 0;
  active_ = failed_ = false;
  bytes_->fill(0);
}
FragmentResult AudioAssembler::reject() noexcept {
  used_ = total_ = fragments_ = 0;
  active_ = false;
  failed_ = true;
  return {FragmentStatus::invalid, {}};
}
FragmentResult AudioAssembler::push(::bridge::compat::span<const std::uint8_t> input, std::size_t total,
                                    bool first, bool last) noexcept {
  if (failed_ || total == 0 || total > max_bytes || input.size() > total ||
      (first ? active_ : !active_))
    return reject();
  if (first) {
    total_ = total;
    used_ = fragments_ = 0;
    active_ = true;
  }
  if (total != total_ || fragments_ >= max_fragments || input.size() > total_ - used_ ||
      (last && input.size() != total_ - used_))
    return reject();
  // Complete bounds/ordering validation precedes copying; fixed storage never grows.
  std::copy(input.begin(), input.end(), bytes_->begin() + static_cast<std::ptrdiff_t>(used_));
  used_ += input.size();
  ++fragments_;
  if (!last)
    return {FragmentStatus::collecting, {}};
  const auto result = ::bridge::compat::span(*bytes_).first(used_);
  used_ = total_ = fragments_ = 0;
  active_ = false;
  return {FragmentStatus::complete, result};
}
namespace {
std::uint16_t u16(::bridge::compat::span<const std::uint8_t> bytes, std::size_t at) noexcept {
  return static_cast<std::uint16_t>(static_cast<unsigned>(bytes[at]) |
                                    (static_cast<unsigned>(bytes[at + 1]) << 8));
}
std::uint32_t u32(::bridge::compat::span<const std::uint8_t> bytes, std::size_t at) noexcept {
  return static_cast<std::uint32_t>(u16(bytes, at)) |
         (static_cast<std::uint32_t>(u16(bytes, at + 2)) << 16);
}
} // namespace
void AudioPduValidator::reset() noexcept {
  failed_ = false;
  pending_wave_ = 0;
  wave_ = {AudioPduKind::wave};
}
std::optional<AudioPdu> AudioPduValidator::reject() noexcept {
  failed_ = true;
  pending_wave_ = 0;
  return {};
}
std::optional<AudioPdu> AudioPduValidator::validate(::bridge::compat::span<const std::uint8_t> bytes) noexcept {
  if (failed_ || bytes.size() < 4 || bytes.size() > AudioAssembler::max_bytes)
    return reject();
  if (pending_wave_) {
    if (bytes.size() != pending_wave_)
      return reject();
    pending_wave_ = 0;
    return wave_;
  }
  const auto body = u16(bytes, 2);
  // Legacy WaveInfo contains only the first four sample bytes; BodySize includes
  // the following raw Wave record. Other supported PDUs have exact body lengths.
  if (bytes[0] == 2) {
    if (bytes.size() != 16 || body < 12)
      return reject();
    pending_wave_ = body - 8U;
    wave_ = {AudioPduKind::wave, u16(bytes, 4), u16(bytes, 6), 0, bytes[8], 16, pending_wave_};
    auto info = wave_;
    info.kind = AudioPduKind::wave_info;
    return info;
  }
  if (body != bytes.size() - 4)
    return reject();
  switch (bytes[0]) {
  case 1:
    if (body != 0)
      return reject();
    return AudioPdu{AudioPduKind::close};
  case 3:
    if (body != 4)
      return reject();
    return AudioPdu{AudioPduKind::volume};
  case 6:
    // Server Training includes two fixed words followed by optional opaque
    // padding. wPackSize is echoed by FreeRDP, never used for allocation here.
    if (body < 4)
      return reject();
    return AudioPdu{AudioPduKind::training};
  case 7:
  case 39: {
    // XRDP's optional legacy recording proposal uses the same bounded
    // WAVEFORMATEX table after a shorter, version-5 header. Pinned RDPSND
    // ignores this unsupported control: admitting its structure enables no
    // capture device, negotiation response or legacy recording data path.
    const bool legacy_input = bytes[0] == 39;
    const std::size_t header = legacy_input ? 16 : 24;
    if (bytes.size() < header || (legacy_input && u16(bytes, 14) != 5))
      return reject();
    const auto count = u16(bytes, legacy_input ? 12 : 18);
    if (count > max_formats)
      return reject();
    std::size_t at = header;
    for (std::size_t i = 0; i < count; ++i) {
      if (bytes.size() - at < 18)
        return reject();
      const auto extra = u16(bytes, at + 16);
      at += 18;
      if (extra > max_format_extra || extra > bytes.size() - at)
        return reject();
      at += extra;
    }
    if (at != bytes.size())
      return reject();
    AudioPdu result{legacy_input ? AudioPduKind::legacy_input_formats : AudioPduKind::formats};
    result.format_count = count;
    return result;
  }
  case 13:
    if (body <= 12)
      return reject();
    return AudioPdu{AudioPduKind::wave2, u32(bytes, 12), u16(bytes, 6), 0, bytes[8], 32,
                    bytes.size() - 16};
  default:
    return reject();
  }
}
} // namespace bridge::audio
