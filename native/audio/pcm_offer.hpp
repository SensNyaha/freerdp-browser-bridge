#pragma once
#include "ingress.hpp"

namespace bridge::audio {
struct PcmOffer {
  std::span<const std::uint8_t> bytes;
  std::uint16_t count;
};
inline constexpr std::size_t max_pcm_offer_bytes = 24 + AudioPduValidator::max_formats * 18;
// Allocation-free baseline negotiation filter. Input and output must not overlap.
// Failure leaves output unchanged. Results borrow output until caller overwrites it.
std::optional<PcmOffer> select_pcm_offers(std::span<const std::uint8_t> input,
                                          std::span<std::uint8_t> output) noexcept;
} // namespace bridge::audio
