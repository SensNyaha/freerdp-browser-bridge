#include "private_directory.hpp"
#include <array>
#include <exception>
#include <string>

namespace bridge::runtime {
namespace {
struct Handle {
  HANDLE value = nullptr;
  ~Handle() {
    if (value && value != INVALID_HANDLE_VALUE && !CloseHandle(value))
      std::terminate();
  }
};
constexpr std::size_t token_capacity = sizeof(TOKEN_USER) + SECURITY_MAX_SID_SIZE + 16;
constexpr std::size_t acl_capacity =
    sizeof(ACL) + 2 * (sizeof(ACCESS_ALLOWED_ACE) - sizeof(DWORD) + SECURITY_MAX_SID_SIZE);
bool absolute(std::wstring_view path) noexcept {
  return path.size() >= 4 &&
         ((path[0] >= L'A' && path[0] <= L'Z') || (path[0] >= L'a' && path[0] <= L'z')) &&
         path[1] == L':' && path[2] == L'\\';
}
} // namespace
DWORD create_private_directory(std::wstring_view path) noexcept {
  if (!absolute(path) || path.size() > 32767 || path.find(L'\0') != path.npos ||
      path.back() == L'\\')
    return ERROR_INVALID_NAME;
  try {
    const std::wstring name(path);
    const auto separator = name.find_last_of(L'\\');
    const auto parent_name = name.substr(0, separator == 2 ? 3 : separator);
    Handle parent;
    parent.value =
        CreateFileW(parent_name.c_str(), FILE_READ_ATTRIBUTES,
                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING,
                    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (parent.value == INVALID_HANDLE_VALUE)
      return GetLastError();
    BY_HANDLE_FILE_INFORMATION information{};
    if (!GetFileInformationByHandle(parent.value, &information))
      return GetLastError();
    if (!(information.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) ||
        (information.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT))
      return ERROR_INVALID_NAME;
    DWORD flags = 0;
    if (!GetVolumeInformationByHandleW(parent.value, nullptr, 0, nullptr, nullptr, &flags, nullptr,
                                       0))
      return GetLastError();
    if (!(flags & FILE_PERSISTENT_ACLS))
      return ERROR_NOT_SUPPORTED;
    Handle token;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token.value))
      return GetLastError();
    alignas(TOKEN_USER) std::array<BYTE, token_capacity> user_storage{};
    DWORD required = 0;
    if (GetTokenInformation(token.value, TokenUser, nullptr, 0, &required) ||
        GetLastError() != ERROR_INSUFFICIENT_BUFFER || required > user_storage.size())
      return ERROR_INVALID_DATA;
    if (!GetTokenInformation(token.value, TokenUser, user_storage.data(),
                             static_cast<DWORD>(user_storage.size()), &required))
      return GetLastError();
    const auto *user = reinterpret_cast<const TOKEN_USER *>(user_storage.data());
    if (!IsValidSid(user->User.Sid))
      return ERROR_INVALID_SID;
    alignas(DWORD) std::array<BYTE, SECURITY_MAX_SID_SIZE> system{};
    DWORD system_size = static_cast<DWORD>(system.size());
    if (!CreateWellKnownSid(WinLocalSystemSid, nullptr, system.data(), &system_size))
      return GetLastError();
    alignas(ACL) std::array<BYTE, acl_capacity> acl_storage{};
    auto *acl = reinterpret_cast<ACL *>(acl_storage.data());
    constexpr DWORD inherit = OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE;
    if (!InitializeAcl(acl, static_cast<DWORD>(acl_storage.size()), ACL_REVISION) ||
        !AddAccessAllowedAceEx(acl, ACL_REVISION, inherit, FILE_ALL_ACCESS, user->User.Sid) ||
        (!EqualSid(user->User.Sid, system.data()) &&
         !AddAccessAllowedAceEx(acl, ACL_REVISION, inherit, FILE_ALL_ACCESS, system.data())))
      return GetLastError();
    SECURITY_DESCRIPTOR descriptor{};
    if (!InitializeSecurityDescriptor(&descriptor, SECURITY_DESCRIPTOR_REVISION) ||
        !SetSecurityDescriptorOwner(&descriptor, user->User.Sid, FALSE) ||
        !SetSecurityDescriptorDacl(&descriptor, TRUE, acl, FALSE) ||
        !SetSecurityDescriptorControl(&descriptor, SE_DACL_PROTECTED, SE_DACL_PROTECTED))
      return GetLastError();
    SECURITY_ATTRIBUTES attributes{sizeof(attributes), &descriptor, FALSE};
    return CreateDirectoryW(name.c_str(), &attributes) ? ERROR_SUCCESS : GetLastError();
  } catch (...) {
    return ERROR_NOT_ENOUGH_MEMORY;
  }
}
} // namespace bridge::runtime
