#pragma once
#include <string_view>
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
namespace bridge::runtime {
// New directory only; caller supplies a trusted absolute path/parent. Existing
// objects are never repaired or reused. No worker/Node selection is installed.
DWORD create_private_directory(std::wstring_view path) noexcept;
} // namespace bridge::runtime
#endif
