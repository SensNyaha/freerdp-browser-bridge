#pragma once
#include <charconv>
#include <cstdint>
#include <optional>
#include <string_view>

namespace bridge::runtime {
struct ProcessCpuTicks {
  std::uint64_t user;
  std::uint64_t kernel;
};

inline std::optional<ProcessCpuTicks> process_stat_cpu(std::string_view text,
                                                       std::uint32_t expected_pid) noexcept {
  if (!expected_pid || expected_pid > 0x7fffffff || text.empty() || text.size() > 8192 ||
      text.find('\0') != std::string_view::npos)
    return std::nullopt;
  const auto opening = text.find(" (");
  const auto closing = text.rfind(')');
  if (opening == std::string_view::npos || closing == std::string_view::npos ||
      closing < opening + 2 || closing + 2 >= text.size() || text[closing + 1] != ' ')
    return std::nullopt;
  std::uint32_t pid = 0;
  const auto parsed_pid = std::from_chars(text.data(), text.data() + opening, pid);
  if (parsed_pid.ec != std::errc{} || parsed_pid.ptr != text.data() + opening ||
      pid != expected_pid)
    return std::nullopt;
  auto rest = text.substr(closing + 2);
  auto token = [&rest]() noexcept {
    const auto end = rest.find_first_of(" \t\n");
    const auto value = rest.substr(0, end);
    if (end == std::string_view::npos)
      rest = {};
    else {
      rest.remove_prefix(end);
      const auto next = rest.find_first_not_of(" \t\n");
      rest = next == std::string_view::npos ? std::string_view{} : rest.substr(next);
    }
    return value;
  };
  const auto state = token(); // /proc stat field 3; comm may contain spaces, ')' or newlines.
  if (state.size() != 1 ||
      !((state[0] >= 'A' && state[0] <= 'Z') || (state[0] >= 'a' && state[0] <= 'z')))
    return std::nullopt;
  auto number = [](std::string_view value) noexcept -> std::optional<std::uint64_t> {
    if (value.empty() || value.size() > 20 || value[0] < '0' || value[0] > '9')
      return std::nullopt;
    std::uint64_t result = 0;
    const auto parsed = std::from_chars(value.data(), value.data() + value.size(), result);
    if (parsed.ec != std::errc{} || parsed.ptr != value.data() + value.size())
      return std::nullopt;
    return result;
  };
  for (unsigned field = 4; field <= 13; ++field) {
    auto value = token();
    if (!value.empty() && value[0] == '-')
      value.remove_prefix(1);
    if (!number(value))
      return std::nullopt;
  }
  const auto user = number(token()); // Fields 14/15 exclude children's CPU time.
  const auto kernel = number(token());
  if (!user || !kernel)
    return std::nullopt;
  return ProcessCpuTicks{*user, *kernel};
}
} // namespace bridge::runtime
