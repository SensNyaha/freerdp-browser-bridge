#pragma once
#include <optional>
#include <string_view>

namespace bridge::standalone {
enum class StartupRecord { ready, recovery_complete, recovery_incomplete };
namespace startup_detail {
inline bool take(std::string_view &input, std::string_view text) noexcept {
  if (input.substr(0, text.size()) != text)
    return false;
  input.remove_prefix(text.size());
  return true;
}
inline std::optional<bool> boolean(std::string_view &input) noexcept {
  if (take(input, "true"))
    return true;
  if (take(input, "false"))
    return false;
  return {};
}
inline std::optional<unsigned> count(std::string_view &input) noexcept {
  unsigned value = 0;
  std::size_t used = 0;
  for (const auto c : input) {
    if (c < '0' || c > '9')
      break;
    if (used == 4 || (used && input.front() == '0'))
      return {};
    value = value * 10 + static_cast<unsigned>(c - '0');
    if (value > 1024)
      return {};
    ++used;
  }
  if (!used)
    return {};
  input.remove_prefix(used);
  return value;
}
} // namespace startup_detail
// Private fixed producer contract, not a generic JSON/log parser. Never expose
// unknown fields, paths or arbitrary child output through the service host.
inline std::optional<StartupRecord> parse_startup_record(std::string_view line) noexcept {
  using namespace startup_detail;
  if (line.empty() || line.size() > 256 || line.back() != '\n')
    return {};
  line.remove_suffix(1);
  if (!line.empty() && line.back() == '\r')
    line.remove_suffix(1);
  if (line == "{\"code\":\"STANDALONE_READY\"}")
    return StartupRecord::ready;
  if (!take(line, "{\"code\":\"STANDALONE_RUNTIME_RECOVERY\",\"supported\":"))
    return {};
  const auto supported = boolean(line);
  if (!supported || !take(line, ",\"complete\":"))
    return {};
  const auto complete = boolean(line);
  if (!complete || !take(line, ",\"scanned\":"))
    return {};
  const auto scanned = count(line);
  if (!scanned || !take(line, ",\"removed\":"))
    return {};
  const auto removed = count(line);
  if (!removed || !take(line, ",\"active\":"))
    return {};
  const auto active = count(line);
  if (!active || !take(line, ",\"retained\":"))
    return {};
  const auto retained = count(line);
  if (!retained || !take(line, "}") || !line.empty() ||
      *removed + *active + *retained != *scanned || (!*supported && (*complete || *scanned)))
    return {};
  return *supported && *complete ? StartupRecord::recovery_complete
                                 : StartupRecord::recovery_incomplete;
}
} // namespace bridge::standalone
