#pragma once
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
namespace bridge::runtime {
// Root permits trusted administrators and read-only grants. A session directory
// requires the helper's protected current-user/LocalSystem boundary.
// A marker may retain the elevated token's default Administrators owner; its
// ACL remains limited to the individual user and LocalSystem. No directory or
// arbitrary group receives that exception.
bool private_runtime_owner(HANDLE handle, bool protected_directory, bool root = false);
} // namespace bridge::runtime
#endif
