#pragma once
#include "safe_root.hpp"
#include <string>

namespace bridge::files {
inline constexpr std::size_t maximum_drives = 32;
inline constexpr std::size_t maximum_drive_name = 64;
inline constexpr std::size_t maximum_drive_dos_name = 7; // eighth byte is the NUL terminator
inline constexpr std::size_t maximum_drive_subdir = 253;
bool valid_drive_name(std::string_view) noexcept;
bool valid_drive_subdir(std::string_view) noexcept;
std::string drive_dos_key(std::string_view);
} // namespace bridge::files
