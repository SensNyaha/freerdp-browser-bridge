#include "pcm_offer.hpp"
#include <algorithm>

namespace bridge::audio {
namespace {
std::uint16_t u16(std::span<const std::uint8_t> bytes, std::size_t at) noexcept {
  return static_cast<std::uint16_t>(static_cast<unsigned>(bytes[at]) |
                                    (static_cast<unsigned>(bytes[at + 1]) << 8));
}
std::uint32_t u32(std::span<const std::uint8_t> bytes, std::size_t at) noexcept {
  return static_cast<std::uint32_t>(u16(bytes, at)) |
         (static_cast<std::uint32_t>(u16(bytes, at + 2)) << 16);
}
bool supported(std::span<const std::uint8_t> bytes, std::size_t at) noexcept {
  const auto tag = u16(bytes, at), channels = u16(bytes, at + 2), bits = u16(bytes, at + 14);
  const auto rate = u32(bytes, at + 4);
  if (tag != 1 || (channels != 1 && channels != 2) || (bits != 8 && bits != 16) || rate < 8000 ||
      rate > 48000 || u16(bytes, at + 16) != 0)
    return false;
  const auto align = channels * (bits / 8U);
  return u16(bytes, at + 12) == align && u32(bytes, at + 8) == rate * align;
}
void word(std::span<std::uint8_t> bytes, std::size_t at, std::size_t value) noexcept {
  bytes[at] = static_cast<std::uint8_t>(value);
  bytes[at + 1] = static_cast<std::uint8_t>(value >> 8);
}
} // namespace
std::optional<PcmOffer> select_pcm_offers(std::span<const std::uint8_t> input,
                                          std::span<std::uint8_t> output) noexcept {
  AudioPduValidator validator;
  const auto pdu = validator.validate(input);
  if (!pdu || pdu->kind != AudioPduKind::formats)
    return {};
  std::uint16_t selected = 0;
  for (std::size_t i = 0, at = 24; i < pdu->format_count; ++i) {
    if (supported(input, at))
      ++selected;
    at += 18 + u16(input, at + 16);
  }
  const auto size = 24 + static_cast<std::size_t>(selected) * 18;
  if (output.size() < size)
    return {};
  std::copy_n(input.begin(), 24, output.begin());
  word(output, 2, size - 4);
  word(output, 18, selected);
  std::size_t written = 24;
  for (std::size_t i = 0, at = 24; i < pdu->format_count; ++i) {
    if (supported(input, at)) {
      std::copy_n(input.begin() + static_cast<std::ptrdiff_t>(at), 18,
                  output.begin() + static_cast<std::ptrdiff_t>(written));
      written += 18;
    }
    at += 18 + u16(input, at + 16);
  }
  return PcmOffer{output.first(size), selected};
}
} // namespace bridge::audio
