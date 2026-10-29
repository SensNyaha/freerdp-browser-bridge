#pragma once
#ifdef __linux__
#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <sys/syscall.h>
#include <unistd.h>

namespace bridge::files::linux_abi {
// Stable Linux 5.6 syscall ABI. The GCC 8.3 SDK predates linux/openat2.h;
// using that SDK must not weaken beneath/no-mount/no-symlink resolution.
// Authority: Linux v5.6 include/uapi/linux/openat2.h and
// arch/x86/entry/syscalls/syscall_64.tbl (openat2 = 437, common ABI).
struct OpenHow {
  std::uint64_t flags = 0;
  std::uint64_t mode = 0;
  std::uint64_t resolve = 0;
};
static_assert(sizeof(OpenHow) == 24);
static_assert(offsetof(OpenHow, mode) == 8 && offsetof(OpenHow, resolve) == 16);
inline constexpr std::uint64_t no_xdev = 0x01;
inline constexpr std::uint64_t no_magiclinks = 0x02;
inline constexpr std::uint64_t no_symlinks = 0x04;
inline constexpr std::uint64_t beneath = 0x08;

inline long open_beneath(int parent, const char *name, const OpenHow &how) noexcept {
#if defined(SYS_openat2)
  return syscall(SYS_openat2, parent, name, &how, sizeof(how));
#elif defined(__x86_64__) && !defined(__ILP32__)
  return syscall(437L, parent, name, &how, sizeof(how));
#else
  (void)parent;
  (void)name;
  (void)how;
  errno = ENOSYS;
  return -1;
#endif
}
} // namespace bridge::files::linux_abi
#endif
