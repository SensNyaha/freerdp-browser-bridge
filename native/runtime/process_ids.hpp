#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>
#include <string_view>

namespace bridge::runtime {
inline constexpr std::size_t process_batch_limit = 16;
inline constexpr std::size_t process_batch_text_limit = process_batch_limit * 11 - 1;

constexpr std::optional<std::uint32_t> process_id(std::wstring_view text) noexcept {
  if (text.empty() || text.size() > 10)
    return std::nullopt;
  std::uint32_t pid = 0;
  for (const auto ch : text) {
    if (ch < L'0' || ch > L'9')
      return std::nullopt;
    const auto digit = static_cast<std::uint32_t>(ch - L'0');
    if (pid > ((std::numeric_limits<std::uint32_t>::max)() - digit) / 10)
      return std::nullopt;
    pid = pid * 10 + digit;
  }
  return pid ? std::optional<std::uint32_t>{pid} : std::nullopt;
}

struct ProcessIds {
  std::array<std::uint32_t, process_batch_limit> values{};
  std::size_t size = 0;
};

// Fixed storage; validate the entire private PID list before querying any target.
constexpr std::optional<ProcessIds> process_ids(std::wstring_view text) noexcept {
  if (text.empty() || text.size() > process_batch_text_limit)
    return std::nullopt;
  ProcessIds result;
  std::size_t start = 0;
  for (;;) {
    if (result.size == result.values.size())
      return std::nullopt;
    const auto end = text.find(L',', start);
    const auto pid = process_id(text.substr(start, end == text.npos ? end : end - start));
    if (!pid)
      return std::nullopt;
    result.values[result.size++] = *pid;
    if (end == text.npos)
      return result;
    start = end + 1;
  }
}
} // namespace bridge::runtime
