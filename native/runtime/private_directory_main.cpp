#include "private_directory.hpp"
#include <cstdio>
#include <limits>
#include <psapi.h>
#include <string_view>

namespace {
int memory(std::wstring_view text) {
  if (text.empty() || text.size() > 10)
    return 2;
  DWORD pid = 0;
  for (const auto ch : text) {
    if (ch < L'0' || ch > L'9' ||
        pid > ((std::numeric_limits<DWORD>::max)() - static_cast<DWORD>(ch - L'0')) / 10)
      return 2;
    pid = pid * 10 + static_cast<DWORD>(ch - L'0');
  }
  if (!pid)
    return 2;
  DWORD error = ERROR_SUCCESS;
  PROCESS_MEMORY_COUNTERS counters{};
  counters.cb = sizeof(counters);
  const auto process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!process)
    error = GetLastError();
  else {
    if (!GetProcessMemoryInfo(process, &counters, sizeof(counters)))
      error = GetLastError();
    if (!CloseHandle(process) && error == ERROR_SUCCESS)
      error = GetLastError();
  }
  if (std::printf("{\"v\":1,\"bytes\":%llu,\"error\":%lu}\n",
                  error == ERROR_SUCCESS ? static_cast<unsigned long long>(counters.WorkingSetSize)
                                         : 0ULL,
                  static_cast<unsigned long>(error)) < 0 ||
      std::fflush(stdout))
    return 3;
  return error == ERROR_SUCCESS ? 0 : 1;
}
} // namespace

// Private host bootstrap only. No RDP, credentials, environment mutation or
// existing-object repair. argv contains an internal nonsecret directory path or PID.
int wmain(int argc, wchar_t **argv) {
  if (argc != 3 || !argv || !argv[1] || !argv[2])
    return 2;
  if (std::wstring_view(argv[1]) == L"--process-resident-bytes")
    return memory(argv[2]);
  if (std::wstring_view(argv[1]) != L"--create-private-directory")
    return 2;
  const auto status = bridge::runtime::create_private_directory(argv[2]);
  if (std::printf("{\"v\":1,\"created\":%s,\"error\":%lu}\n",
                  status == ERROR_SUCCESS ? "true" : "false",
                  static_cast<unsigned long>(status)) < 0 ||
      std::fflush(stdout))
    return 3;
  return status == ERROR_SUCCESS ? 0 : 1;
}
