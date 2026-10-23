#pragma once
#include <algorithm>
#include <cstdint>
#include <optional>

namespace bridge::audio {
// Preserve other owners' shorter waits. A due audio deadline permits a bounded
// 1 ms retry, never an unbounded zero-timeout loop or catch-up packet queue.
inline std::uint32_t publication_wait_ms(std::uint64_t now, std::optional<std::uint64_t> deadline,
                                         std::uint32_t maximum) noexcept {
  if (!deadline || maximum == 0)
    return maximum;
  const auto remaining = *deadline > now ? *deadline - now : 0;
  const auto rounded = remaining / 1000 + (remaining % 1000 != 0 ? 1U : 0U);
  return static_cast<std::uint32_t>(
      std::min<std::uint64_t>(maximum, std::max<std::uint64_t>(1, rounded)));
}
} // namespace bridge::audio
