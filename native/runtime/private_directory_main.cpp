#include "private_directory.hpp"
#include "process_cpu.hpp"
#include "process_ids.hpp"
#include <cstdio>
#include <psapi.h>
#include <string_view>

namespace {
using bridge::runtime::process_id;

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

struct ResourceSample {
  unsigned long long bytes = 0, micros = 0;
  DWORD error = ERROR_SUCCESS;
};

ResourceSample read_resources(DWORD pid) noexcept {
  ResourceSample result;
  DWORD error = ERROR_SUCCESS;
  PROCESS_MEMORY_COUNTERS memory{};
  memory.cb = sizeof(memory);
  FILETIME created{}, exited{}, kernel{}, user{};
  {
    const process_query process(pid, error);
    if (process.get()) {
      if (!GetProcessMemoryInfo(process.get(), &memory, sizeof(memory)) ||
          !GetProcessTimes(process.get(), &created, &exited, &kernel, &user))
        error = GetLastError();
    }
  }
  if (error == ERROR_SUCCESS) {
    const auto converted = bridge::runtime::process_cpu_micros(
        (static_cast<unsigned long long>(kernel.dwHighDateTime) << 32) | kernel.dwLowDateTime,
        (static_cast<unsigned long long>(user.dwHighDateTime) << 32) | user.dwLowDateTime);
    if (!converted || memory.WorkingSetSize > 9007199254740991ULL)
      error = ERROR_ARITHMETIC_OVERFLOW;
    else {
      result.micros = *converted;
      result.bytes = static_cast<unsigned long long>(memory.WorkingSetSize);
    }
  }
  result.error = error;
  return result;
}

int resources(std::wstring_view text) {
  const auto pid = process_id(text);
  if (!pid)
    return 2;
  const auto result = read_resources(*pid);
  if (std::printf("{\"v\":1,\"bytes\":%llu,\"micros\":%llu,\"error\":%lu}\n", result.bytes,
                  result.micros, static_cast<unsigned long>(result.error)) < 0 ||
      std::fflush(stdout))
    return 3;
  return result.error == ERROR_SUCCESS ? 0 : 1;
}

int resource_batch(std::wstring_view text) {
  const auto pids = bridge::runtime::process_ids(text);
  if (!pids)
    return 2;
  std::array<ResourceSample, bridge::runtime::process_batch_limit> samples{};
  for (std::size_t i = 0; i < pids->size; ++i) {
    samples[i] = read_resources(pids->values[i]);
    // A successful batch item must be an actionable resident sample.
    if (samples[i].error == ERROR_SUCCESS && !samples[i].bytes)
      samples[i] = {0, 0, ERROR_INVALID_DATA};
  }
  // All target handles have retired before any record is published.
  if (std::printf("{\"v\":1,\"items\":[") < 0)
    return 3;
  for (std::size_t i = 0; i < pids->size; ++i) {
    const auto &sample = samples[i];
    if (std::printf("%s{\"bytes\":%llu,\"micros\":%llu,\"error\":%lu}", i ? "," : "", sample.bytes,
                    sample.micros, static_cast<unsigned long>(sample.error)) < 0)
      return 3;
  }
  if (std::printf("]}\n") < 0 || std::fflush(stdout))
    return 3;
  // Target errors are per item; grammar/output/process failures remain distinct.
  return 0;
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
  if (std::wstring_view(argv[1]) == L"--process-resources")
    return resources(argv[2]);
  if (std::wstring_view(argv[1]) == L"--process-resources-batch")
    return resource_batch(argv[2]);
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
