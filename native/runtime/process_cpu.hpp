#pragma once
#include <cstdint>
#include <limits>
#include <optional>

namespace bridge::runtime {
// Windows process counters are cumulative 100 ns units. Preserve the carry
// before flooring to microseconds and admit only exact JSON integer scalars.
constexpr std::optional<std::uint64_t> process_cpu_micros(std::uint64_t kernel,
                                                          std::uint64_t user) noexcept {
  if (kernel > (std::numeric_limits<std::uint64_t>::max)() - user)
    return std::nullopt;
  const auto micros = (kernel + user) / 10;
  if (micros > 9007199254740991ULL)
    return std::nullopt;
  return micros;
}
} // namespace bridge::runtime
