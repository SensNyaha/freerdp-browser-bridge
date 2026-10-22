#pragma once
#if __has_include(<numbers>)
#include <numbers>
#endif

namespace bridge::compat::numbers {
#if defined(__cpp_lib_math_constants) && __cpp_lib_math_constants >= 201907L &&                       \
    !defined(BRIDGE_COMPAT_FORCE_FALLBACK)
using std::numbers::pi;
#else
// Exact binary64 value used by the owned Opus test tone, matching std::numbers::pi.
inline constexpr double pi = 0x1.921fb54442d18p+1;
#endif
} // namespace bridge::compat::numbers
