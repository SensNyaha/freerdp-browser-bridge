#pragma once
#ifdef __linux__
#include <cerrno>
#include <sys/syscall.h>
#include <unistd.h>

namespace bridge::files::linux_abi {
// Linux UAPI RENAME_NOREPLACE and the x86-64 common syscall table. Do not
// emulate exclusive rename with an existence check followed by renameat.
inline constexpr unsigned rename_no_replace = 1;
inline long rename_entry(int source_parent, const char *source, int target_parent,
                         const char *target, bool replace) noexcept {
  const auto flags = replace ? 0U : rename_no_replace;
#if defined(SYS_renameat2)
  return syscall(SYS_renameat2, source_parent, source, target_parent, target, flags);
#elif defined(__x86_64__) && !defined(__ILP32__)
  // https://github.com/torvalds/linux/blob/v5.6/arch/x86/entry/syscalls/syscall_64.tbl
  return syscall(316L, source_parent, source, target_parent, target, flags);
#else
  (void)source_parent;
  (void)source;
  (void)target_parent;
  (void)target;
  (void)flags;
  errno = ENOSYS;
  return -1;
#endif
}
} // namespace bridge::files::linux_abi
#endif
