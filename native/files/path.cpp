#include "safe_root.hpp"
#include <array>
#include <string>

namespace bridge::files {
namespace {
bool utf8(std::string_view value) noexcept {
  for (std::size_t i = 0; i < value.size();) {
    const auto first = static_cast<unsigned char>(value[i++]);
    if (first < 0x80)
      continue;
    unsigned following = 0;
    std::uint32_t scalar = 0, minimum = 0;
    if (first >= 0xc2 && first <= 0xdf) {
      following = 1;
      scalar = first & 0x1fU;
      minimum = 0x80;
    } else if (first >= 0xe0 && first <= 0xef) {
      following = 2;
      scalar = first & 0x0fU;
      minimum = 0x800;
    } else if (first >= 0xf0 && first <= 0xf4) {
      following = 3;
      scalar = first & 0x07U;
      minimum = 0x10000;
    } else
      return false;
    if (following > value.size() - i)
      return false;
    while (following--) {
      const auto next = static_cast<unsigned char>(value[i++]);
      if ((next & 0xc0U) != 0x80U)
        return false;
      scalar = (scalar << 6U) | (next & 0x3fU);
    }
    if (scalar < minimum || scalar > 0x10ffff || (scalar >= 0xd800 && scalar <= 0xdfff))
      return false;
  }
  return true;
}
bool component(std::string_view part) noexcept {
  if (part.empty() || part.size() > maximum_component_bytes || part == "." || part == ".." ||
      part.back() == '.' || part.back() == ' ')
    return false;
  for (const unsigned char ch : part)
    if (ch < 0x20 || ch == 0x7f ||
        std::string_view("\\:<>\"|?*").find(static_cast<char>(ch)) != std::string_view::npos)
      return false;
  // DOS names remain reserved even with an extension or different ASCII case.
  auto base = part.substr(0, part.find('.'));
  while (!base.empty() && base.back() == ' ')
    base.remove_suffix(1);
  std::array<char, 8> upper{};
  if (base.size() >= upper.size())
    return true;
  for (std::size_t i = 0; i < base.size(); ++i)
    upper[i] = base[i] >= 'a' && base[i] <= 'z' ? static_cast<char>(base[i] - 'a' + 'A') : base[i];
  const std::string_view name(upper.data(), base.size());
  if (name == "CON" || name == "PRN" || name == "AUX" || name == "NUL" || name == "CONIN$" ||
      name == "CONOUT$")
    return false;
  if (name.substr(0, 3) == "COM" || name.substr(0, 3) == "LPT") {
    const auto suffix = name.substr(3);
    if ((suffix.size() == 1 && suffix[0] >= '0' && suffix[0] <= '9') || suffix == "\xc2\xb9" ||
        suffix == "\xc2\xb2" || suffix == "\xc2\xb3")
      return false;
  }
  return true;
}
} // namespace
bool valid_relative_path(std::string_view path) noexcept {
  if (path.empty() || path.size() > maximum_path_bytes || !utf8(path))
    return false;
  std::size_t depth = 0;
  while (true) {
    const auto end = path.find('/');
    if (++depth > maximum_path_depth || !component(path.substr(0, end)))
      return false;
    if (end == path.npos)
      return true;
    path.remove_prefix(end + 1);
  }
}
} // namespace bridge::files
