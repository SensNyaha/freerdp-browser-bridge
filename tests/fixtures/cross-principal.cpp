// Test-only actor. Never installed or used for production session admission.
#include "ownership.hpp"
#include "recovery.hpp"
#include <array>
#include <cstdio>
#include <filesystem>
#include <string_view>
#ifdef _WIN32
#include <windows.h>
#else
#include <cerrno>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace {
template <class Char> bool bounded(const Char *value, std::size_t maximum) {
  if (!value)
    return false;
  for (std::size_t i = 0; i <= maximum; ++i)
    if (!value[i])
      return i != 0;
  return false;
}
#ifdef _WIN32
struct Handle {
  HANDLE value = INVALID_HANDLE_VALUE;
  ~Handle() {
    if (value != INVALID_HANDLE_VALUE && value && !CloseHandle(value))
      std::terminate();
  }
};
bool local_service() {
  Handle token;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token.value))
    return false;
  alignas(TOKEN_USER) std::array<BYTE, sizeof(TOKEN_USER) + SECURITY_MAX_SID_SIZE> user{};
  DWORD size = 0;
  return GetTokenInformation(token.value, TokenUser, user.data(),
                             static_cast<DWORD>(user.size()), &size) &&
         IsWellKnownSid(reinterpret_cast<const TOKEN_USER *>(user.data())->User.Sid,
                        WinLocalServiceSid);
}
bool open_denied(const std::filesystem::path &path, DWORD access) {
  Handle file;
  file.value = CreateFileW(path.c_str(), access, FILE_SHARE_READ | FILE_SHARE_WRITE,
                            nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
  return file.value == INVALID_HANDLE_VALUE && GetLastError() == ERROR_ACCESS_DENIED;
}
#else
struct Fd {
  int value = -1;
  ~Fd() {
    if (value >= 0 && ::close(value) != 0 && errno != EINTR)
      std::terminate();
  }
};
bool open_denied(const std::filesystem::path &path, int flags) {
  Fd file{::open(path.c_str(), flags | O_CLOEXEC | O_NOFOLLOW)};
  return file.value == -1 && errno == EACCES;
}
#endif

unsigned probe(const std::filesystem::path &root, const std::filesystem::path &component) {
  const auto directory = root / component;
  const auto marker = directory / ".rdp-worker-owned";
  unsigned result = 0;
#ifdef _WIN32
  if (local_service())
    result |= 1;
  {
    Handle readable;
    readable.value = CreateFileW(root.c_str(), FILE_LIST_DIRECTORY,
                                 FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                                 nullptr, OPEN_EXISTING,
                                 FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (readable.value != INVALID_HANDLE_VALUE)
      result |= 2;
  }
  if (open_denied(marker, GENERIC_READ))
    result |= 4;
  if (open_denied(marker, GENERIC_WRITE))
    result |= 8;
  {
    Handle session;
    session.value = CreateFileW(directory.c_str(), FILE_LIST_DIRECTORY,
                                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                                nullptr, OPEN_EXISTING,
                                FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (session.value == INVALID_HANDLE_VALUE && GetLastError() == ERROR_ACCESS_DENIED)
      result |= 128;
  }
  if (!CreateDirectoryW((directory / "foreign-probe").c_str(), nullptr) &&
      GetLastError() == ERROR_ACCESS_DENIED)
    result |= 16;
#else
  struct stat metadata{};
  std::array<gid_t, 128> groups{};
  const auto count = ::getgroups(static_cast<int>(groups.size()), groups.data());
  bool other_group = count >= 0;
  if (::stat(root.c_str(), &metadata) == 0) {
    for (int i = 0; i < count; ++i)
      other_group = other_group && groups[static_cast<std::size_t>(i)] != metadata.st_gid;
    if (::getuid() == ::geteuid() && ::geteuid() != 0 && ::geteuid() != metadata.st_uid &&
        ::getegid() != metadata.st_gid && other_group)
      result |= 1;
  }
  {
    Fd readable{::open(root.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)};
    if (readable.value >= 0)
      result |= 2;
  }
  if (open_denied(marker, O_RDONLY))
    result |= 4;
  if (open_denied(marker, O_WRONLY))
    result |= 8;
  if (open_denied(directory, O_RDONLY | O_DIRECTORY))
    result |= 128;
  if (::mkdir((directory / "foreign-probe").c_str(), 0700) != 0 && errno == EACCES)
    result |= 16;
#endif
  try {
    const bridge::runtime::RuntimeLease lease(directory);
  } catch (const bridge::runtime::RuntimeOwnershipError &) {
    result |= 32;
  }
  if (bridge::runtime::recover_runtime_directory(root, component) !=
      bridge::runtime::RecoveryResult::removed)
    result |= 64;
  return result;
}
} // namespace
#ifdef _WIN32
int wmain(int argc, wchar_t **argv) {
#else
int main(int argc, char **argv) {
#endif
  try {
    if (argc !=
#ifdef _WIN32
            5
#else
            4
#endif
        || !argv || !bounded(argv[1], 16) || !bounded(argv[2], 4096) ||
        !bounded(argv[3], 74) || std::filesystem::path(argv[1]) != "--probe")
      return 2;
    const std::filesystem::path root(argv[2]), component(argv[3]);
    if (!root.is_absolute() || component.has_parent_path() ||
        !bridge::runtime::runtime_identity(component.native()))
      return 2;
#ifdef _WIN32
    if (!bounded(argv[4], 4096))
      return 2;
    const std::filesystem::path receipt(argv[4]);
    if (!receipt.is_absolute())
      return 2;
#endif
    const auto result = probe(root, component);
#ifdef _WIN32
    Handle file;
    file.value = CreateFileW(receipt.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
                              FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    const std::array<unsigned, 2> record{1, result};
    DWORD written = 0;
    if (file.value == INVALID_HANDLE_VALUE ||
        !WriteFile(file.value, record.data(), static_cast<DWORD>(sizeof(record)), &written, nullptr) ||
        written != sizeof(record))
      return 3;
#else
    if (std::printf("{\"v\":1,\"checks\":%u}\n", result) < 0 || std::fflush(stdout))
      return 3;
#endif
    return result == 255 ? 0 : 1;
  } catch (...) {
    return 3;
  }
}
