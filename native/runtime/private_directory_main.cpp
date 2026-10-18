#include "private_directory.hpp"
#include "process_cpu.hpp"
#include <cstdio>
#include <limits>
#include <optional>
#include <psapi.h>
#include <string_view>

namespace {
std::optional<DWORD> process_id(std::wstring_view text) noexcept {
  if (text.empty() || text.size() > 10)
    return std::nullopt;
  DWORD pid = 0;
  for (const auto ch : text) {
    if (ch < L'0' || ch > L'9' ||
        pid > ((std::numeric_limits<DWORD>::max)() - static_cast<DWORD>(ch - L'0')) / 10)
      return std::nullopt;
    pid = pid * 10 + static_cast<DWORD>(ch - L'0');
  }
  if (!pid)
    return std::nullopt;
  return pid;
}

class process_query final {
public:
  process_query(DWORD pid, DWORD &error) noexcept
      : process_(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid)), error_(error) {
    if (!process_)
      error_ = GetLastError();
  }
  process_query(const process_query &) = delete;
  process_query &operator=(const process_query &) = delete;
  ~process_query() noexcept {
    if (process_ && !CloseHandle(process_) && error_ == ERROR_SUCCESS)
      error_ = GetLastError();
  }
  HANDLE get() const noexcept { return process_; }

private:
  HANDLE process_;
  DWORD &error_;
};

int memory(std::wstring_view text) {
  const auto pid = process_id(text);
  if (!pid)
    return 2;
  DWORD error = ERROR_SUCCESS;
  PROCESS_MEMORY_COUNTERS counters{};
  counters.cb = sizeof(counters);
  {
    const process_query process(*pid, error);
    if (process.get() && !GetProcessMemoryInfo(process.get(), &counters, sizeof(counters)))
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

int cpu_time(std::wstring_view text) {
  const auto pid = process_id(text);
  if (!pid)
    return 2;
  DWORD error = ERROR_SUCCESS;
  FILETIME created{}, exited{}, kernel{}, user{};
  {
    const process_query process(*pid, error);
    if (process.get() && !GetProcessTimes(process.get(), &created, &exited, &kernel, &user))
      error = GetLastError();
  }
  unsigned long long micros = 0;
  if (error == ERROR_SUCCESS) {
    const auto kernel_ticks =
        (static_cast<unsigned long long>(kernel.dwHighDateTime) << 32) | kernel.dwLowDateTime;
    const auto user_ticks =
        (static_cast<unsigned long long>(user.dwHighDateTime) << 32) | user.dwLowDateTime;
    const auto converted = bridge::runtime::process_cpu_micros(kernel_ticks, user_ticks);
    if (!converted)
      error = ERROR_ARITHMETIC_OVERFLOW;
    else
      micros = *converted;
  }
  if (std::printf("{\"v\":1,\"micros\":%llu,\"error\":%lu}\n", micros,
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
  if (std::wstring_view(argv[1]) == L"--process-cpu-micros")
    return cpu_time(argv[2]);
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
