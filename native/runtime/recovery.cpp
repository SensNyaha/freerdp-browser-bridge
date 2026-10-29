#include "recovery.hpp"
#include "ownership.hpp"
#include "../files/recovery.hpp"
#include <array>
#include <cerrno>
#include <chrono>
#include <cstring>
#include <exception>
#include <string>
#ifdef _WIN32
#include "windows_ownership.hpp"
#elif defined(__linux__)
#include <dirent.h>
#include <fcntl.h>
#include <poll.h>
#include <sys/file.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>
#endif

namespace bridge::runtime {
namespace {
constexpr std::string_view marker_bytes = "runtime-v1";
enum class OwnerStatus { absent, live, unknown };
RecoveryResult clean_managed_files(files::SafeRoot, const RuntimeIdentity &);
bool known_marker(const std::array<char, 11> &bytes, std::size_t size) noexcept {
  return size <= marker_bytes.size() &&
         std::string_view(bytes.data(), size) == marker_bytes.substr(0, size);
}
#ifdef _WIN32
struct Handle {
  HANDLE value = INVALID_HANDLE_VALUE;
  void close() noexcept {
    if (value != INVALID_HANDLE_VALUE && !CloseHandle(value))
      std::terminate();
    value = INVALID_HANDLE_VALUE;
  }
  ~Handle() { close(); }
  Handle() = default;
  Handle(const Handle &) = delete;
  Handle &operator=(const Handle &) = delete;
};
OwnerStatus owner_status(const RuntimeIdentity &identity) {
  std::wstring pipe = L"\\\\.\\pipe\\freerdp-bridge-owner-";
  for (const auto c : identity.owner)
    pipe.push_back(static_cast<wchar_t>(c));
  Handle peer;
  peer.value = CreateFileW(pipe.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING,
                           FILE_FLAG_OVERLAPPED, nullptr);
  if (peer.value != INVALID_HANDLE_VALUE)
    return OwnerStatus::live;
  const auto error = GetLastError();
  if (error == ERROR_PIPE_BUSY)
    return OwnerStatus::live;
  return error == ERROR_FILE_NOT_FOUND ? OwnerStatus::absent : OwnerStatus::unknown;
}
bool directory_information(HANDLE handle, bool root) {
  BY_HANDLE_FILE_INFORMATION info{};
  return GetFileInformationByHandle(handle, &info) &&
         (info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) &&
         !(info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) &&
         private_runtime_owner(handle, !root, root);
}
bool known_contents(HANDLE directory, bool has_marker, bool &has_managed) {
  // Bounded handle-relative enumeration; never traverse any returned path.
  alignas(FILE_ID_BOTH_DIR_INFO) std::array<BYTE, 4096> storage{};
  std::size_t entries = 0;
  bool marker_found = false, container_found = false, claim_found = false;
  for (int page = 0; page < 4; ++page) {
    if (!GetFileInformationByHandleEx(directory, FileIdBothDirectoryInfo, storage.data(),
                                      static_cast<DWORD>(storage.size())))
      return GetLastError() == ERROR_NO_MORE_FILES && marker_found == has_marker;
    std::size_t offset = 0;
    for (;;) {
      constexpr auto header_size = offsetof(FILE_ID_BOTH_DIR_INFO, FileName);
      if (offset > storage.size() - header_size || ++entries > 7)
        return false;
      const auto *entry = reinterpret_cast<const FILE_ID_BOTH_DIR_INFO *>(storage.data() + offset);
      if (entry->FileNameLength % sizeof(wchar_t) ||
          entry->FileNameLength > storage.size() - offset - header_size)
        return false;
      const std::wstring_view name(entry->FileName, entry->FileNameLength / sizeof(wchar_t));
      if (name != L"." && name != L"..") {
        if (name == L".rdp-worker-owned" && !marker_found && has_marker) marker_found = true;
        else if (name == L"managed-files" && !container_found) container_found = has_managed = true;
        else if (name == L".managed-files-owned" && !claim_found) claim_found = has_managed = true;
        else return false;
      }
      if (!entry->NextEntryOffset)
        break;
      if (entry->NextEntryOffset < header_size ||
          entry->NextEntryOffset % alignof(FILE_ID_BOTH_DIR_INFO) ||
          entry->NextEntryOffset > storage.size() - offset - header_size)
        return false;
      offset += entry->NextEntryOffset;
    }
  }
  return false;
}
RecoveryResult recover(const std::filesystem::path &root, const std::filesystem::path &component,
                       const RuntimeIdentity &identity) {
  // Same local drive-path boundary as the private-directory helper. No UNC or
  // device namespace, and no trust in an attacker-controlled path component.
  const auto &name = root.native();
  if (name.size() < 3 || name.size() > 32767 || name[1] != L':' || name[2] != L'\\' ||
      !((name[0] >= L'A' && name[0] <= L'Z') || (name[0] >= L'a' && name[0] <= L'z')) ||
      name.find(L'\0') != name.npos)
    return RecoveryResult::retained;
  const auto status = owner_status(identity);
  if (status != OwnerStatus::absent)
    return status == OwnerStatus::live ? RecoveryResult::busy : RecoveryResult::retained;
  Handle root_handle;
  root_handle.value = CreateFileW(
      root.c_str(), FILE_READ_ATTRIBUTES | READ_CONTROL, FILE_SHARE_READ | FILE_SHARE_WRITE,
      nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
  if (root_handle.value == INVALID_HANDLE_VALUE || !directory_information(root_handle.value, true))
    return RecoveryResult::retained;
  Handle directory;
  const auto path = root / component;
  directory.value =
      CreateFileW(path.c_str(), FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | READ_CONTROL | DELETE,
                  FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING,
                  FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
  if (directory.value == INVALID_HANDLE_VALUE)
    return GetLastError() == ERROR_SHARING_VIOLATION ? RecoveryResult::busy
                                                     : RecoveryResult::retained;
  if (!directory_information(directory.value, false))
    return RecoveryResult::retained;
  Handle marker;
  marker.value =
      CreateFileW((path / L".rdp-worker-owned").c_str(), GENERIC_READ | READ_CONTROL | DELETE, 0,
                  nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
  const bool has_marker = marker.value != INVALID_HANDLE_VALUE;
  if (!has_marker) {
    const auto error = GetLastError();
    if (error == ERROR_SHARING_VIOLATION)
      return RecoveryResult::busy;
    if (error != ERROR_FILE_NOT_FOUND)
      return RecoveryResult::retained;
  } else {
    BY_HANDLE_FILE_INFORMATION info{};
    if (!GetFileInformationByHandle(marker.value, &info) ||
        (info.dwFileAttributes & (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DIRECTORY)) ||
        info.nNumberOfLinks != 1 || info.nFileSizeHigh || info.nFileSizeLow > 10 ||
        !private_runtime_owner(marker.value, false))
      return RecoveryResult::retained;
    std::array<char, 11> bytes{};
    DWORD used = 0;
    if (!ReadFile(marker.value, bytes.data(), static_cast<DWORD>(bytes.size()), &used, nullptr) ||
        used != info.nFileSizeLow || !known_marker(bytes, used))
      return RecoveryResult::retained;
  }
  bool has_managed = false;
  if (!known_contents(directory.value, has_marker, has_managed))
    return RecoveryResult::retained;
  if (has_managed) {
    auto borrowed = files::SafeRoot::duplicate_private(reinterpret_cast<std::uintptr_t>(directory.value));
    if (borrowed.first != files::Status::ok) return RecoveryResult::retained;
    const auto cleaned = clean_managed_files(std::move(borrowed.second), identity);
    if (cleaned != RecoveryResult::removed) return cleaned;
  }
  const auto final_status = owner_status(identity);
  if (final_status != OwnerStatus::absent)
    return final_status == OwnerStatus::live ? RecoveryResult::busy : RecoveryResult::retained;
  FILE_DISPOSITION_INFO disposition{TRUE};
  if (has_marker) {
    if (!SetFileInformationByHandle(marker.value, FileDispositionInfo, &disposition,
                                    sizeof(disposition)))
      return RecoveryResult::retained;
    marker.close();
  }
  if (!SetFileInformationByHandle(directory.value, FileDispositionInfo, &disposition,
                                  sizeof(disposition)))
    return RecoveryResult::retained;
  directory.close();
  return RecoveryResult::removed;
}
#elif defined(__linux__)
struct Descriptor {
  int value = -1;
  ~Descriptor() {
    if (value >= 0 && ::close(value) != 0 && errno != EINTR)
      std::terminate();
  }
  Descriptor() = default;
  Descriptor(const Descriptor &) = delete;
  Descriptor &operator=(const Descriptor &) = delete;
};
OwnerStatus socket_result(int error) noexcept {
  if (!error)
    return OwnerStatus::live;
  return error == ECONNREFUSED || error == ENOENT ? OwnerStatus::absent : OwnerStatus::unknown;
}
OwnerStatus owner_status(const RuntimeIdentity &identity) {
  Descriptor peer;
  peer.value = ::socket(AF_UNIX, SOCK_STREAM | SOCK_NONBLOCK | SOCK_CLOEXEC, 0);
  if (peer.value < 0)
    return OwnerStatus::unknown;
  sockaddr_un address{};
  address.sun_family = AF_UNIX;
  constexpr std::string_view prefix = "freerdp-bridge-owner-";
  std::memcpy(address.sun_path + 1, prefix.data(), prefix.size());
  std::memcpy(address.sun_path + 1 + prefix.size(), identity.owner.data(), identity.owner.size());
  const auto size = static_cast<socklen_t>(offsetof(sockaddr_un, sun_path) + 1 + prefix.size() +
                                           identity.owner.size());
  if (::connect(peer.value, reinterpret_cast<const sockaddr *>(&address), size) == 0)
    return OwnerStatus::live;
  if (errno != EINPROGRESS)
    return socket_result(errno);
  const auto due = std::chrono::steady_clock::now() + std::chrono::milliseconds(250);
  for (;;) {
    const auto now = std::chrono::steady_clock::now();
    if (now >= due)
      return OwnerStatus::unknown;
    const auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(due - now).count();
    pollfd descriptor{peer.value, POLLOUT, 0};
    const auto polled = ::poll(&descriptor, 1, static_cast<int>(remaining) + 1);
    if (polled < 0 && errno == EINTR)
      continue;
    if (polled <= 0)
      return OwnerStatus::unknown;
    int error = 0;
    socklen_t length = sizeof(error);
    if (::getsockopt(peer.value, SOL_SOCKET, SO_ERROR, &error, &length) != 0 ||
        length != sizeof(error))
      return OwnerStatus::unknown;
    return socket_result(error);
  }
}
bool known_contents(int directory, bool has_marker, bool &has_managed) {
  const auto duplicate = ::fcntl(directory, F_DUPFD_CLOEXEC, 0);
  if (duplicate < 0)
    return false;
  auto *stream = ::fdopendir(duplicate);
  if (!stream) {
    if (::close(duplicate) != 0 && errno != EINTR)
      std::terminate();
    return false;
  }
  bool result = false;
  bool marker_found = false, container_found = false, claim_found = false;
  for (int count = 0; count < 8; ++count) {
    errno = 0;
    const auto *entry = ::readdir(stream);
    if (!entry) {
      result = !errno && marker_found == has_marker;
      break;
    }
    const std::string_view name(entry->d_name);
    if (name == "." || name == "..")
      continue;
    if (name == ".rdp-worker-owned" && !marker_found && has_marker) marker_found = true;
    else if (name == "managed-files" && !container_found) container_found = has_managed = true;
    else if (name == ".managed-files-owned" && !claim_found) claim_found = has_managed = true;
    else break;
  }
  if (::closedir(stream) != 0)
    return false;
  return result;
}
bool same_entry(int parent, const char *name, const struct stat &identity) {
  struct stat current{};
  return ::fstatat(parent, name, &current, AT_SYMLINK_NOFOLLOW) == 0 &&
         current.st_dev == identity.st_dev && current.st_ino == identity.st_ino &&
         current.st_nlink == identity.st_nlink;
}
RecoveryResult recover(const std::filesystem::path &root, const std::filesystem::path &component,
                       const RuntimeIdentity &identity) {
  const auto &name = root.native();
  if (!root.is_absolute() || name.size() > 4096 || name.find('\0') != name.npos)
    return RecoveryResult::retained;
  const auto status = owner_status(identity);
  if (status != OwnerStatus::absent)
    return status == OwnerStatus::live ? RecoveryResult::busy : RecoveryResult::retained;
  Descriptor root_handle;
  root_handle.value = ::open(root.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
  struct stat root_info{};
  if (root_handle.value < 0 || ::fstat(root_handle.value, &root_info) != 0 ||
      !S_ISDIR(root_info.st_mode) || root_info.st_uid != ::getuid() || (root_info.st_mode & 0022))
    return RecoveryResult::retained;
  Descriptor directory;
  directory.value = ::openat(root_handle.value, component.c_str(),
                             O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
  struct stat directory_info{};
  if (directory.value < 0 || ::fstat(directory.value, &directory_info) != 0 ||
      !S_ISDIR(directory_info.st_mode) || directory_info.st_uid != ::getuid() ||
      (directory_info.st_mode & 0777) != 0700)
    return RecoveryResult::retained;
  if (::flock(directory.value, LOCK_EX | LOCK_NB) != 0)
    return errno == EWOULDBLOCK ? RecoveryResult::busy : RecoveryResult::retained;
  Descriptor marker;
  marker.value = ::openat(directory.value, ".rdp-worker-owned",
                          O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
  const bool has_marker = marker.value >= 0;
  struct stat marker_info{};
  if (!has_marker) {
    if (errno != ENOENT)
      return RecoveryResult::retained;
  } else {
    if (::fstat(marker.value, &marker_info) != 0 || !S_ISREG(marker_info.st_mode) ||
        marker_info.st_uid != ::getuid() || marker_info.st_nlink != 1 || marker_info.st_size < 0 ||
        marker_info.st_size > 10 || (marker_info.st_mode & 0022))
      return RecoveryResult::retained;
    if (::flock(marker.value, LOCK_EX | LOCK_NB) != 0)
      return errno == EWOULDBLOCK ? RecoveryResult::busy : RecoveryResult::retained;
    std::array<char, 11> bytes{};
    const auto used = ::read(marker.value, bytes.data(), bytes.size());
    if (used != marker_info.st_size || used < 0 ||
        !known_marker(bytes, static_cast<std::size_t>(used)))
      return RecoveryResult::retained;
  }
  bool has_managed = false;
  if (!known_contents(directory.value, has_marker, has_managed))
    return RecoveryResult::retained;
  if (has_managed) {
    auto borrowed = files::SafeRoot::duplicate_private(static_cast<std::uintptr_t>(directory.value));
    if (borrowed.first != files::Status::ok) return RecoveryResult::retained;
    const auto cleaned = clean_managed_files(std::move(borrowed.second), identity);
    if (cleaned != RecoveryResult::removed) return cleaned;
    // Removing our managed child changes the parent's link count on Unix.
    // Refresh that one mutable field from the locked handle, preserving the
    // original dev/inode binding used by the final name-to-handle check.
    struct stat after{};
    if (::fstat(directory.value, &after) != 0 || !S_ISDIR(after.st_mode) ||
        after.st_uid != directory_info.st_uid || (after.st_mode & 0777) != 0700 ||
        after.st_dev != directory_info.st_dev || after.st_ino != directory_info.st_ino)
      return RecoveryResult::retained;
    directory_info.st_nlink = after.st_nlink;
  }
  const auto final_status = owner_status(identity);
  if (final_status != OwnerStatus::absent)
    return final_status == OwnerStatus::live ? RecoveryResult::busy : RecoveryResult::retained;
  if (!same_entry(root_handle.value, component.c_str(), directory_info) ||
      (has_marker && !same_entry(directory.value, ".rdp-worker-owned", marker_info)))
    return RecoveryResult::retained;
  if (has_marker && ::unlinkat(directory.value, ".rdp-worker-owned", 0) != 0)
    return RecoveryResult::retained;
  return ::unlinkat(root_handle.value, component.c_str(), AT_REMOVEDIR) == 0
             ? RecoveryResult::removed
             : RecoveryResult::retained;
}
#endif
#if defined(_WIN32) || defined(__linux__)
RecoveryResult clean_managed_files(files::SafeRoot root, const RuntimeIdentity &identity) {
  auto plan = files::ManagedFilesRecovery::prepare(std::move(root));
  if (plan.first != files::Status::ok)
    return plan.first == files::Status::busy ? RecoveryResult::busy : RecoveryResult::retained;
  const auto status = owner_status(identity);
  if (status != OwnerStatus::absent)
    return status == OwnerStatus::live ? RecoveryResult::busy : RecoveryResult::retained;
  const auto applied = plan.second.apply();
  return applied == files::Status::ok ? RecoveryResult::removed :
      applied == files::Status::busy ? RecoveryResult::busy : RecoveryResult::retained;
}
#endif
} // namespace
RecoveryResult recover_runtime_directory(const std::filesystem::path &root,
                                         const std::filesystem::path &component) noexcept {
  try {
    const auto identity = runtime_identity(component.native());
    // Reject ambiguous final components such as link/, dot and dot-dot. The
    // host supplies trusted ancestors; the checked root must be the final object.
    if (!identity || root != root.lexically_normal() || root.filename().empty() ||
        root.filename() == "." || root.filename() == "..")
      return RecoveryResult::retained;
#if defined(_WIN32) || defined(__linux__)
    return recover(root, component, *identity);
#else
    return RecoveryResult::retained;
#endif
  } catch (...) {
    return RecoveryResult::retained;
  }
}
} // namespace bridge::runtime
