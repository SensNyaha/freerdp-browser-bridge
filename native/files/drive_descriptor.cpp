#include "drive_descriptor.hpp"
#include <algorithm>
namespace bridge::files {
bool valid_drive_name(std::string_view name) noexcept {
  return !name.empty() && name.size() <= maximum_drive_name && valid_relative_path(name) &&
      valid_relative_path(name.substr(0, maximum_drive_dos_name)) && std::all_of(name.begin(), name.end(), [](char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-' || c == ' ';
      });
}
bool valid_drive_subdir(std::string_view path) noexcept {
  return !path.empty() && path.size() <= maximum_drive_subdir && valid_relative_path(path) &&
      std::count(path.begin(), path.end(), '/') < 31 &&
      std::all_of(path.begin(), path.end(), [](char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-' || c == '/';
      });
}
std::string drive_dos_key(std::string_view name) {
  std::string key(name.substr(0, maximum_drive_dos_name));
  for (auto &c : key) if (c >= 'a' && c <= 'z') c = static_cast<char>(c - 'a' + 'A');
  return key;
}
} // namespace bridge::files
