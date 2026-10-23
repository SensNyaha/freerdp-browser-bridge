// Test-only bounded process-tree evidence. Never shipped in the service payload.
#include <windows.h>
#include <tlhelp32.h>
#include <cstdio>
#include <cwchar>
#include <string>

namespace {
class Snapshot final {
public:
  explicit Snapshot(HANDLE value) noexcept : value_(value) {}
  ~Snapshot() { if (value_ != INVALID_HANDLE_VALUE) CloseHandle(value_); }
  Snapshot(const Snapshot&) = delete;
  Snapshot& operator=(const Snapshot&) = delete;
  HANDLE get() const noexcept { return value_; }
private:
  HANDLE value_;
};
const char* allowed_name(const wchar_t* name) noexcept {
  if (_wcsicmp(name, L"node.exe") == 0) return "node.exe";
  if (_wcsicmp(name, L"rdp-worker.exe") == 0) return "rdp-worker.exe";
  if (_wcsicmp(name, L"bridge-service.exe") == 0) return "bridge-service.exe";
  return nullptr;
}
}
int main(int argc, char**) {
  if (argc != 1) return 2;
  const Snapshot snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
  if (snapshot.get() == INVALID_HANDLE_VALUE) return 1;
  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  std::string output("[");
  std::size_t visited = 0, selected = 0;
  BOOL more = Process32FirstW(snapshot.get(), &entry);
  while (more != FALSE) {
    if (++visited > 65536) return 1;
    if (const char* name = allowed_name(entry.szExeFile)) {
      if (++selected > 4096) return 1;
      char row[192]{};
      const int bytes = std::snprintf(row, sizeof(row),
        "%s{\"ProcessId\":%lu,\"ParentProcessId\":%lu,\"Name\":\"%s\"}",
        selected == 1 ? "" : ",", entry.th32ProcessID, entry.th32ParentProcessID, name);
      if (bytes < 0 || static_cast<std::size_t>(bytes) >= sizeof(row) ||
          output.size() + static_cast<std::size_t>(bytes) + 2 > 262144) return 1;
      output.append(row, static_cast<std::size_t>(bytes));
    }
    more = Process32NextW(snapshot.get(), &entry);
  }
  if (GetLastError() != ERROR_NO_MORE_FILES) return 1;
  output += "]\n";
  return std::fwrite(output.data(), 1, output.size(), stdout) == output.size() ? 0 : 1;
}
