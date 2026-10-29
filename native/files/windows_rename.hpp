#pragma once
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winternl.h>

// Documented Native API: ntifs.h exposes this declaration in the WDK, while
// the user-mode SDK's winternl.h supplies its argument types but not the export.
// https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntsetinformationfile
extern "C" NTSYSAPI NTSTATUS NTAPI NtSetInformationFile(HANDLE, PIO_STATUS_BLOCK, PVOID, ULONG,
                                                      FILE_INFORMATION_CLASS);
namespace bridge::files::windows_abi {
inline NTSTATUS rename_entry(HANDLE source, FILE_RENAME_INFO *info, ULONG length) noexcept {
  IO_STATUS_BLOCK result{};
  // The FileRenameInformation value and buffer layout are documented by the
  // Native API. FILE_RENAME_INFO has the matching layout for these fields.
  // The caller owns a synchronous handle and keeps the target parent anchored.
  return NtSetInformationFile(source, &result, info, length,
                               static_cast<FILE_INFORMATION_CLASS>(10));
}
} // namespace bridge::files::windows_abi
#endif
