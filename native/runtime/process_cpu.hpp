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

// Linux /proc counters use sysconf(_SC_CLK_TCK), not a guessed tick frequency.
constexpr std::optional<std::uint64_t>
process_cpu_tick_micros(std::uint64_t kernel, std::uint64_t user, std::uint32_t hertz) noexcept {
  if (!hertz || kernel > (std::numeric_limits<std::uint64_t>::max)() - user)
    return std::nullopt;
  constexpr auto maximum = 9007199254740991ULL;
  const auto ticks = kernel + user;
  const auto seconds = ticks / hertz;
  if (seconds > maximum / 1000000)
    return std::nullopt;
  const auto micros = seconds * 1000000 + ((ticks % hertz) * 1000000) / hertz;
  if (micros > maximum)
    return std::nullopt;
  return micros;
}
} // namespace bridge::runtime
