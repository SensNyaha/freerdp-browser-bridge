#include "ownership.hpp"
#include <algorithm>
#include <exception>
#ifdef _WIN32
#include "windows_ownership.hpp"

#include <aclapi.h>
#elif defined(__linux__)
#include <fcntl.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace bridge::runtime {
namespace {
template <class Char>
std::optional<RuntimeIdentity> parse(std::basic_string_view<Char> name) noexcept {
  if (name.size() != 74)
    return std::nullopt;
  constexpr std::string_view prefix = "worker-";
  for (std::size_t i = 0; i < prefix.size(); ++i)
    if (name[i] != static_cast<Char>(prefix[i]))
      return std::nullopt;
  if (name[39] != '-' || name[40] != '1' || name[41] != '-')
    return std::nullopt;
  RuntimeIdentity result;
  for (std::size_t i = 0; i < 32; ++i) {
    const auto owner = name[7 + i];
    const auto session = name[42 + i];
    const auto hex = [](Char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); };
    if (!hex(owner) || !hex(session))
      return std::nullopt;
    result.owner[i] = static_cast<char>(owner);
    result.session[i] = static_cast<char>(session);
  }
  return result;
}
#ifdef _WIN32
struct SecurityStorage {
  PSECURITY_DESCRIPTOR value = nullptr;
  ~SecurityStorage() {
    if (value)
      LocalFree(value);
  }
};
} // namespace
bool private_runtime_owner(HANDLE handle, bool protected_directory, bool root) {
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token))
    return false;
  alignas(TOKEN_USER) std::array<BYTE, sizeof(TOKEN_USER) + SECURITY_MAX_SID_SIZE + 16> storage{};
  DWORD used = 0;
  const bool read = GetTokenInformation(token, TokenUser, storage.data(),
                                        static_cast<DWORD>(storage.size()), &used) != FALSE;
  alignas(TOKEN_OWNER) std::array<BYTE, sizeof(TOKEN_OWNER) + SECURITY_MAX_SID_SIZE + 16>
      owner_storage{};
  // An elevated Windows token can use Builtin Administrators as the default
  // owner of newly created files. Admit that exact token-selected marker owner
  // only; protected session directories still require the individual user SID.
  const bool read_owner =
      !protected_directory && !root &&
      GetTokenInformation(token, TokenOwner, owner_storage.data(),
                           static_cast<DWORD>(owner_storage.size()), &used) != FALSE;
  if (!CloseHandle(token))
    std::terminate();
  if (!read)
    return false;
  const auto user = reinterpret_cast<const TOKEN_USER *>(storage.data())->User.Sid;
  PSID owner = nullptr;
  PACL acl = nullptr;
  SecurityStorage descriptor;
  if (GetSecurityInfo(handle, SE_FILE_OBJECT,
                      OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION, &owner, nullptr, &acl,
                      nullptr, &descriptor.value) != ERROR_SUCCESS ||
      !owner || !IsValidSid(owner) || !acl || !IsValidAcl(acl))
    return false;
  SECURITY_DESCRIPTOR_CONTROL control{};
  DWORD revision = 0;
  if (!GetSecurityDescriptorControl(descriptor.value, &control, &revision) ||
      (protected_directory && !(control & SE_DACL_PROTECTED)))
    return false;
  alignas(DWORD) std::array<BYTE, SECURITY_MAX_SID_SIZE> system{};
  DWORD system_size = static_cast<DWORD>(system.size());
  if (!CreateWellKnownSid(WinLocalSystemSid, nullptr, system.data(), &system_size))
    return false;
  alignas(DWORD) std::array<BYTE, SECURITY_MAX_SID_SIZE> administrators{};
  DWORD administrators_size = static_cast<DWORD>(administrators.size());
  if ((root || !protected_directory) &&
      !CreateWellKnownSid(WinBuiltinAdministratorsSid, nullptr, administrators.data(),
                          &administrators_size))
    return false;
  const auto default_owner =
      read_owner ? reinterpret_cast<const TOKEN_OWNER *>(owner_storage.data())->Owner : nullptr;
  const bool default_administrator_marker =
      !protected_directory && !root && default_owner && IsValidSid(default_owner) &&
      EqualSid(default_owner, administrators.data()) && EqualSid(owner, administrators.data());
  if (!EqualSid(owner, user) &&
      !default_administrator_marker &&
      (!root || (!EqualSid(owner, system.data()) && !EqualSid(owner, administrators.data()))))
    return false;
  constexpr DWORD write_access = FILE_WRITE_DATA | FILE_APPEND_DATA | FILE_WRITE_EA |
                                 FILE_WRITE_ATTRIBUTES | FILE_DELETE_CHILD | DELETE | WRITE_DAC |
                                 WRITE_OWNER | GENERIC_WRITE | GENERIC_ALL;
  for (DWORD i = 0; i < acl->AceCount; ++i) {
    void *entry = nullptr;
    if (!GetAce(acl, i, &entry))
      return false;
    const auto *header = static_cast<const ACE_HEADER *>(entry);
    if (root && (header->AceFlags & INHERIT_ONLY_ACE))
      continue;
    if (header->AceType != ACCESS_ALLOWED_ACE_TYPE)
      return false;
    const auto *ace = static_cast<const ACCESS_ALLOWED_ACE *>(entry);
    const auto sid = const_cast<DWORD *>(&ace->SidStart);
    if (!IsValidSid(sid))
      return false;
    if (EqualSid(sid, user) || EqualSid(sid, system.data()) ||
        (root && EqualSid(sid, administrators.data())))
      continue;
    if (!root || (ace->Mask & write_access))
      return false;
  }
  return true;
}
namespace {
#endif
} // namespace
std::optional<RuntimeIdentity> runtime_identity(std::string_view name) noexcept {
  return parse(name);
}
std::optional<RuntimeIdentity> runtime_identity(std::wstring_view name) noexcept {
  return parse(name);
}

RuntimeLease::RuntimeLease(const std::filesystem::path &directory) {
  try {
    if (!runtime_identity(directory.filename().native()))
      throw RuntimeOwnershipError();
    std::array<char, 11> bytes{};
#ifdef _WIN32
    directory_ = CreateFileW(directory.c_str(), FILE_READ_ATTRIBUTES | READ_CONTROL,
                             FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING,
                             FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (directory_ == INVALID_HANDLE_VALUE) {
      directory_ = nullptr;
      throw RuntimeOwnershipError();
    }
    BY_HANDLE_FILE_INFORMATION info{};
    if (!GetFileInformationByHandle(directory_, &info) ||
        !(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) ||
        (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ||
        !private_runtime_owner(directory_, true))
      throw RuntimeOwnershipError();
    marker_ = CreateFileW((directory / ".rdp-worker-owned").c_str(), GENERIC_READ | READ_CONTROL, 0,
                          nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (marker_ == INVALID_HANDLE_VALUE) {
      marker_ = nullptr;
      throw RuntimeOwnershipError();
    }
    DWORD count = 0;
    if (!GetFileInformationByHandle(marker_, &info) ||
        (info.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)) ||
        info.nNumberOfLinks != 1 || info.nFileSizeHigh || info.nFileSizeLow != 10 ||
        !private_runtime_owner(marker_, false) ||
        !ReadFile(marker_, bytes.data(), static_cast<DWORD>(bytes.size()), &count, nullptr) ||
        count != 10)
      throw RuntimeOwnershipError();
#elif defined(__linux__)
    directory_ = ::open(directory.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    struct stat info{};
    if (directory_ < 0 || ::fstat(directory_, &info) != 0 || !S_ISDIR(info.st_mode) ||
        info.st_uid != ::getuid() || (info.st_mode & 0777) != 0700)
      throw RuntimeOwnershipError();
    marker_ =
        ::openat(directory_, ".rdp-worker-owned", O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
    if (marker_ < 0 || ::fstat(marker_, &info) != 0 || !S_ISREG(info.st_mode) ||
        info.st_uid != ::getuid() || info.st_nlink != 1 || info.st_size != 10 ||
        (info.st_mode & 0022) || ::flock(marker_, LOCK_EX | LOCK_NB) != 0 ||
        ::read(marker_, bytes.data(), bytes.size()) != 10)
      throw RuntimeOwnershipError();
#else
    throw RuntimeOwnershipError();
#endif
    if (std::string_view(bytes.data(), 10) != "runtime-v1")
      throw RuntimeOwnershipError();
  } catch (...) {
    close();
    throw RuntimeOwnershipError();
  }
}
void RuntimeLease::close() noexcept {
#ifdef _WIN32
  for (auto *handle : {&marker_, &directory_}) {
    if (*handle && !CloseHandle(*handle))
      std::terminate();
    *handle = nullptr;
  }
#elif defined(__linux__)
  for (auto *fd : {&marker_, &directory_}) {
    if (*fd >= 0 && ::close(*fd) != 0)
      std::terminate();
    *fd = -1;
  }
#endif
}
RuntimeLease::~RuntimeLease() { close(); }
} // namespace bridge::runtime
