#include "basic.hpp"
#include <chrono>

namespace bridge::files {
std::uint64_t file_time_now() noexcept {
  const auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(
      std::chrono::system_clock::now().time_since_epoch()).count();
  constexpr std::uint64_t epoch = 116444736000000000ULL;
  if (elapsed < 0 || static_cast<std::uint64_t>(elapsed) >
      (static_cast<std::uint64_t>((std::numeric_limits<std::int64_t>::max)()) - epoch) / 10) return 0;
  return epoch + static_cast<std::uint64_t>(elapsed) * 10;
}
bool valid_basic(const FileBasic &basic, bool controls) noexcept {
  if (basic.attributes & ~basic_attribute_mask) return false;
  for (const auto value : basic.times)
    if (value > static_cast<std::uint64_t>((std::numeric_limits<std::int64_t>::max)()) &&
        !(controls && (value == preserve_file_time || value == resume_file_time))) return false;
  return true;
}
std::uint32_t basic_attributes(std::uint32_t requested, bool directory) noexcept {
  auto value = requested & ~file_normal;
  value = directory ? value | file_directory : value & ~file_directory;
  return value ? value : file_normal;
}
} // namespace bridge::files
