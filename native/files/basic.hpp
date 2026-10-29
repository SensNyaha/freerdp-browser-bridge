#pragma once
#include <array>
#include <cstdint>
#include <limits>

namespace bridge::files {
inline constexpr std::uint32_t file_readonly = 1, file_hidden = 2, file_system = 4,
    file_directory = 16, file_archive = 32, file_normal = 128, file_temporary = 256;
inline constexpr std::uint32_t basic_attribute_mask = file_readonly | file_hidden | file_system |
    file_directory | file_archive | file_normal | file_temporary;
inline constexpr std::uint64_t preserve_file_time = (std::numeric_limits<std::uint64_t>::max)(),
    resume_file_time = preserve_file_time - 1;
struct FileBasic {
  // FILETIME UTC ticks. Session-owned VFS metadata, independent of host POSIX
  // ctime/DOS attributes. Zero setters leave a field unchanged.
  std::array<std::uint64_t, 4> times{}; // creation, access, write, change
  std::uint32_t attributes = 0;
};
std::uint64_t file_time_now() noexcept;
bool valid_basic(const FileBasic &, bool controls = false) noexcept;
std::uint32_t basic_attributes(std::uint32_t requested, bool directory) noexcept;
} // namespace bridge::files
