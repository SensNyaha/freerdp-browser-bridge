#pragma once
#include <cstring>
#include <type_traits>
#if __has_include(<bit>)
#include <bit>
#endif
namespace bridge::compat {
#if defined(__cpp_lib_bit_cast) && __cpp_lib_bit_cast >= 201806L &&                                \
    !defined(BRIDGE_COMPAT_FORCE_FALLBACK)
using std::bit_cast;
#else
template <class To, class From,
          std::enable_if_t<sizeof(To) == sizeof(From) && std::is_trivially_copyable_v<To> &&
                               std::is_trivially_copyable_v<From>,
                           int> = 0>
To bit_cast(const From &value) noexcept {
  // memcpy preserves object representation without violating aliasing rules.
  // The bridge uses this only for equal-size trivially copyable pointer APIs.
  To output;
  std::memcpy(&output, &value, sizeof(output));
  return output;
}
#endif
} // namespace bridge::compat
