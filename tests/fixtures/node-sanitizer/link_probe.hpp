// Small reproducer for the GCC 12 ASan/COMDAT failure seen in V8 mksnapshot.
#include <string_view>
#include <utility>

constexpr char section_name[] = "build_id";
constexpr char section_other[] = "external_debug_info";

inline __attribute__((noinline)) int identify(std::string_view name) {
  static constexpr std::pair<std::string_view, int> sections[]{
      {section_name, 7}, {section_other, 8}};
  for (const auto &section : sections)
    if (section.first == name)
      return section.second;
  return 0;
}
