#pragma once
#include <chrono>
#include <cstddef>

namespace bridge {
struct PumpResult {
  bool healthy = true;
  std::size_t checks = 0;
  std::chrono::microseconds elapsed{};
};
// Coalesce ready RDP updates before encoding, without starving capture/input on a busy peer.
template <class Read, class Ready, class Stop, class Now>
PumpResult pump_ready_events(Read read, Ready ready, Stop stop, Now now) {
  constexpr std::size_t limit = 256;
  constexpr auto budget = std::chrono::milliseconds(8);
  const auto start = now();
  PumpResult result;
  while (!stop()) {
    ++result.checks;
    if (!read()) {
      result.healthy = false;
      break;
    }
    result.elapsed = std::chrono::duration_cast<std::chrono::microseconds>(now() - start);
    if (result.checks >= limit || result.elapsed >= budget || !ready())
      break;
  }
  result.elapsed = std::chrono::duration_cast<std::chrono::microseconds>(now() - start);
  return result;
}
} // namespace bridge
