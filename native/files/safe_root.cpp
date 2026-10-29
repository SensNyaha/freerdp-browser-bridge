#include "safe_root.hpp"
#include "delete_window.hpp"
#include <chrono>
#include <algorithm>
#include <cstring>
#include <functional>
#include <limits>
#include <mutex>
#include <new>
#include <string>
#include <utility>
#include <vector>
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <aclapi.h>
#include <array>
#include <windows.h>
#include <winternl.h>
#include "windows_rename.hpp"
#else
#include "linux_openat2.hpp"
#include "linux_rename.hpp"
#include <cerrno>
#include <fcntl.h>
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace bridge::files {
namespace {
constexpr auto maximum_offset =
    static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max());
bool valid_io(std::uint64_t offset, std::size_t bytes) noexcept {
  return bytes <= maximum_io_bytes && offset <= maximum_offset && bytes <= maximum_offset - offset;
}
#ifdef _WIN32
struct Handle {
  HANDLE value = INVALID_HANDLE_VALUE;
  Handle() = default;
  explicit Handle(HANDLE handle) : value(handle) {}
  Handle(const Handle &) = delete;
  Handle(Handle &&other) noexcept : value(std::exchange(other.value, INVALID_HANDLE_VALUE)) {}
  Handle &operator=(Handle &&other) noexcept {
    if (this != &other) {
      close();
      value = std::exchange(other.value, INVALID_HANDLE_VALUE);
    }
    return *this;
  }
  void close() noexcept {
    if (value != INVALID_HANDLE_VALUE && value && !CloseHandle(value))
      std::terminate();
    value = INVALID_HANDLE_VALUE;
  }
  ~Handle() { close(); }
};
struct OwnedSecurity {
  PSECURITY_DESCRIPTOR value = nullptr;
  ~OwnedSecurity() { if (value && LocalFree(value)) std::terminate(); }
};
Status os_error(DWORD error) noexcept {
  switch (error) {
  case ERROR_FILE_NOT_FOUND:
  case ERROR_PATH_NOT_FOUND:
    return Status::missing;
  case ERROR_FILE_EXISTS:
  case ERROR_ALREADY_EXISTS:
    return Status::exists;
  case ERROR_ACCESS_DENIED:
  case ERROR_CANT_ACCESS_FILE:
  case ERROR_REPARSE_TAG_INVALID:
  case ERROR_REPARSE_POINT_ENCOUNTERED:
  case ERROR_CANT_RESOLVE_FILENAME:
  case ERROR_STOPPED_ON_SYMLINK:
  case ERROR_NOT_SAME_DEVICE:
    return Status::denied;
  case ERROR_SHARING_VIOLATION:
  case ERROR_LOCK_VIOLATION:
    return Status::busy;
  case ERROR_DIR_NOT_EMPTY:
    return Status::not_empty;
  case ERROR_INVALID_NAME:
  case ERROR_INVALID_PARAMETER:
    return Status::invalid;
  case ERROR_DISK_FULL:
  case ERROR_HANDLE_DISK_FULL:
  case ERROR_DISK_QUOTA_EXCEEDED:
    return Status::disk_full;
  case ERROR_NOT_SUPPORTED:
    return Status::unavailable;
  default:
    return Status::io;
  }
}
std::wstring wide(std::string_view name) {
  const auto count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, name.data(),
                                         static_cast<int>(name.size()), nullptr, 0);
  if (count <= 0)
    return {};
  std::wstring output(static_cast<std::size_t>(count), L'\0');
  if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, name.data(), static_cast<int>(name.size()),
                          output.data(), count) != count)
    return {};
  return output;
}
std::pair<Status, Handle> open_handle(HANDLE parent, std::wstring_view name, bool directory,
                                      OpenMode mode, bool root = false, bool mutation = false,
                                      PSECURITY_DESCRIPTOR security = nullptr) {
  if (name.empty() || name.size() > 32760)
    return {Status::invalid, Handle{}};
  UNICODE_STRING text{};
  text.Buffer = const_cast<wchar_t *>(name.data());
  text.Length = static_cast<USHORT>(name.size() * sizeof(wchar_t));
  text.MaximumLength = text.Length;
  OBJECT_ATTRIBUTES attributes{};
  attributes.Length = sizeof(attributes);
  attributes.RootDirectory = parent;
  attributes.ObjectName = &text;
  attributes.Attributes = OBJ_CASE_INSENSITIVE | OBJ_DONT_REPARSE;
  attributes.SecurityDescriptor = security;
  IO_STATUS_BLOCK io{};
  HANDLE result = INVALID_HANDLE_VALUE;
  const ACCESS_MASK access =
      SYNCHRONIZE | FILE_READ_ATTRIBUTES | (mutation ? DELETE : 0) | (root ? READ_CONTROL : 0) |
      (directory ? FILE_LIST_DIRECTORY | FILE_TRAVERSE
                 : FILE_READ_DATA | (mode == OpenMode::read ? 0 : FILE_WRITE_DATA));
  const auto status = NtCreateFile(&result, access, &attributes, &io, nullptr,
                                   directory ? FILE_ATTRIBUTE_DIRECTORY : FILE_ATTRIBUTE_NORMAL,
                                   FILE_SHARE_READ | FILE_SHARE_WRITE,
                                   mode == OpenMode::create_new ? FILE_CREATE : FILE_OPEN,
                                   FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT |
                                       (directory ? FILE_DIRECTORY_FILE : FILE_NON_DIRECTORY_FILE),
                                   nullptr, 0);
  if (status < 0)
    return {os_error(RtlNtStatusToDosError(status)), Handle{}};
  Handle handle(result);
  BY_HANDLE_FILE_INFORMATION info{};
  if (GetFileType(result) != FILE_TYPE_DISK || !GetFileInformationByHandle(result, &info))
    return {Status::denied, Handle{}};
  if ((info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ||
      static_cast<bool>(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != directory ||
      (!directory && info.nNumberOfLinks != 1))
    return {Status::denied, Handle{}};
  return {Status::ok, std::move(handle)};
}
EmptyResult directory_empty(HANDLE handle) {
  alignas(FILE_ID_BOTH_DIR_INFO) std::array<BYTE, 4096> storage{};
  for (unsigned page = 0; page < 4; ++page) {
    storage.fill(0);
    if (!GetFileInformationByHandleEx(handle,
          page == 0 ? FileIdBothDirectoryRestartInfo : FileIdBothDirectoryInfo,
          storage.data(), static_cast<DWORD>(storage.size())))
      return GetLastError() == ERROR_NO_MORE_FILES ? EmptyResult{Status::ok, true}
                                                   : EmptyResult{os_error(GetLastError()), false};
    std::size_t offset = 0;
    for (unsigned entry = 0; entry < 4; ++entry) {
      constexpr auto header = offsetof(FILE_ID_BOTH_DIR_INFO, FileName);
      if (offset > storage.size() - header)
        return {Status::io, false};
      const auto *value = reinterpret_cast<const FILE_ID_BOTH_DIR_INFO *>(storage.data() + offset);
      if (!value->FileNameLength || value->FileNameLength % sizeof(wchar_t) ||
          value->FileNameLength > storage.size() - offset - header)
        return {Status::io, false};
      const std::wstring_view name(value->FileName, value->FileNameLength / sizeof(wchar_t));
      if (name != L"." && name != L"..")
        return {Status::ok, false};
      if (!value->NextEntryOffset)
        break;
      if (value->NextEntryOffset < header || value->NextEntryOffset % alignof(FILE_ID_BOTH_DIR_INFO) ||
          value->NextEntryOffset > storage.size() - offset - header)
        return {Status::io, false};
      offset += value->NextEntryOffset;
    }
  }
  return {Status::io, false};
}
bool private_root(HANDLE handle) {
  Handle token;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token.value))
    return false;
  alignas(TOKEN_USER) std::array<BYTE, sizeof(TOKEN_USER) + SECURITY_MAX_SID_SIZE + 16> user{};
  DWORD required = 0;
  if (!GetTokenInformation(token.value, TokenUser, user.data(), static_cast<DWORD>(user.size()),
                           &required))
    return false;
  const auto *identity = reinterpret_cast<const TOKEN_USER *>(user.data());
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  PSID owner = nullptr;
  PACL acl = nullptr;
  if (GetSecurityInfo(handle, SE_FILE_OBJECT,
                      OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION, &owner, nullptr, &acl,
                      nullptr, &descriptor) != ERROR_SUCCESS)
    return false;
  struct Security {
    PSECURITY_DESCRIPTOR value;
    ~Security() {
      if (value && LocalFree(value))
        std::terminate();
    }
  } security{descriptor};
  SECURITY_DESCRIPTOR_CONTROL control = 0;
  DWORD revision = 0;
  if (!owner || !IsValidSid(owner) || !EqualSid(owner, identity->User.Sid) || !acl ||
      !IsValidAcl(acl) || !GetSecurityDescriptorControl(descriptor, &control, &revision) ||
      !(control & SE_DACL_PROTECTED))
    return false;
  const bool system = IsWellKnownSid(identity->User.Sid, WinLocalSystemSid) != FALSE;
  if (acl->AceCount != (system ? 1 : 2))
    return false;
  unsigned owners = 0, systems = 0;
  for (DWORD i = 0; i < acl->AceCount; ++i) {
    void *entry = nullptr;
    if (!GetAce(acl, i, &entry))
      return false;
    const auto *ace = static_cast<const ACCESS_ALLOWED_ACE *>(entry);
    if (ace->Header.AceType != ACCESS_ALLOWED_ACE_TYPE || ace->Mask != FILE_ALL_ACCESS ||
        (ace->Header.AceFlags & INHERIT_ONLY_ACE))
      return false;
    const auto sid = const_cast<DWORD *>(&ace->SidStart);
    if (!IsValidSid(sid))
      return false;
    if (EqualSid(sid, identity->User.Sid))
      ++owners;
    else if (IsWellKnownSid(sid, WinLocalSystemSid))
      ++systems;
    else
      return false;
  }
  return owners == 1 && systems == (system ? 0U : 1U);
}
#else
struct Handle {
  int value = -1;
  Handle() = default;
  explicit Handle(int handle) : value(handle) {}
  Handle(const Handle &) = delete;
  Handle(Handle &&other) noexcept : value(std::exchange(other.value, -1)) {}
  Handle &operator=(Handle &&other) noexcept {
    if (this != &other) {
      close();
      value = std::exchange(other.value, -1);
    }
    return *this;
  }
  void close() noexcept {
    // Do not retry close after EINTR: the descriptor may already have been reused.
    if (value >= 0)
      (void)::close(value);
    value = -1;
  }
  ~Handle() { close(); }
};
Status os_error(int error) noexcept {
  switch (error) {
  case ENOENT:
  case ENOTDIR:
    return Status::missing;
  case EEXIST:
    return Status::exists;
  case EACCES:
  case EPERM:
  case ELOOP:
  case EXDEV:
    return Status::denied;
  case ENOSPC:
  case EDQUOT:
    return Status::disk_full;
  case ENOSYS:
  case EOPNOTSUPP:
    return Status::unavailable;
  case ENOTEMPTY:
    return Status::not_empty;
  case EBUSY:
  case EAGAIN:
    return Status::busy;
  case EINVAL:
    return Status::invalid;
  default:
    return Status::io;
  }
}
std::pair<Status, Handle> open_handle(int parent, const std::string &name, bool root,
                                      OpenMode mode) {
  linux_abi::OpenHow how{};
  how.flags = O_CLOEXEC | O_NOFOLLOW;
  if (root)
    how.flags |= O_RDONLY | O_DIRECTORY;
  else if (mode == OpenMode::create_new) {
    how.flags |= O_RDWR | O_CREAT | O_EXCL;
    how.mode = 0600;
  } else
    how.flags |= O_PATH;
  how.resolve = linux_abi::no_symlinks | linux_abi::no_magiclinks;
  if (!root)
    how.resolve |= linux_abi::beneath | linux_abi::no_xdev;
  const auto result = linux_abi::open_beneath(parent, name.c_str(), how);
  if (result < 0)
    return {os_error(errno), Handle{}};
  Handle handle(static_cast<int>(result));
  struct stat info{};
  if (fstat(handle.value, &info) != 0)
    return {os_error(errno), Handle{}};
  if (root ? !S_ISDIR(info.st_mode) || info.st_uid != geteuid() || (info.st_mode & 0077) != 0
           : !S_ISREG(info.st_mode) || info.st_nlink != 1)
    return {Status::denied, Handle{}};
  if (!root && mode != OpenMode::create_new) {
    // O_PATH inspects without opening a device/FIFO for IO. Reopen only the
    // verified regular inode via our own held descriptor, never by its raced
    // pathname. This procfs reference is generated internally, not caller input.
    const auto descriptor = "/proc/self/fd/" + std::to_string(handle.value);
    const auto reopened =
        ::open(descriptor.c_str(), O_CLOEXEC | (mode == OpenMode::read ? O_RDONLY : O_RDWR));
    if (reopened < 0)
      return {os_error(errno), Handle{}};
    handle = Handle(reopened);
  }
  return {Status::ok, std::move(handle)};
}
#endif
bool valid_kind(EntryKind kind) noexcept {
  return kind == EntryKind::file || kind == EntryKind::directory;
}
using RawHandle = decltype(std::declval<Handle>().value);
struct Parent {
  Status status = Status::ok;
  RawHandle value;
  // Keep all Windows ancestors open without delete sharing while operating on
  // the final entry; do not reconstruct a checked absolute pathname afterwards.
  std::vector<Handle> anchors;
  std::string leaf;
  explicit Parent(RawHandle root) : value(root) {}
};
Parent parent_for(RawHandle root, std::string_view path) {
  Parent result(root);
  const auto split = path.rfind('/');
  result.leaf = std::string(split == path.npos ? path : path.substr(split + 1));
#ifdef _WIN32
  if (split == path.npos)
    return result;
  auto prefix = path.substr(0, split);
  while (true) {
    const auto end = prefix.find('/');
    auto [status, handle] = open_handle(result.value, wide(prefix.substr(0, end)), true,
                                         OpenMode::read);
    if (status != Status::ok) {
      result.status = status;
      return result;
    }
    result.anchors.push_back(std::move(handle));
    result.value = result.anchors.back().value;
    if (end == prefix.npos)
      return result;
    prefix.remove_prefix(end + 1);
  }
#else
  const auto prefix = split == path.npos ? std::string(".") : std::string(path.substr(0, split));
  linux_abi::OpenHow how{};
  how.flags = O_PATH | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW;
  how.resolve = linux_abi::beneath | linux_abi::no_xdev | linux_abi::no_symlinks |
                linux_abi::no_magiclinks;
  const auto opened = linux_abi::open_beneath(root, prefix.c_str(), how);
  if (opened < 0) {
    result.status = os_error(errno);
    return result;
  }
  result.anchors.emplace_back(static_cast<int>(opened));
  result.value = result.anchors.back().value;
  return result;
#endif
}
std::pair<Status, Handle> namespace_entry(const Parent &parent, EntryKind kind, bool mutation = true,
                                           bool private_owner = false) {
#ifdef _WIN32
  return open_handle(parent.value, wide(parent.leaf), kind == EntryKind::directory,
                     OpenMode::read, private_owner, mutation);
#else
  (void)mutation;
  (void)private_owner;
  linux_abi::OpenHow how{};
  how.flags = O_PATH | O_CLOEXEC | O_NOFOLLOW;
  how.resolve = linux_abi::beneath | linux_abi::no_xdev | linux_abi::no_symlinks |
                linux_abi::no_magiclinks;
  const auto opened = linux_abi::open_beneath(parent.value, parent.leaf.c_str(), how);
  if (opened < 0)
    return {os_error(errno), Handle{}};
  Handle handle(static_cast<int>(opened));
  struct stat info{};
  if (fstat(handle.value, &info) != 0)
    return {os_error(errno), Handle{}};
  if (kind == EntryKind::directory ? !S_ISDIR(info.st_mode)
                                    : !S_ISREG(info.st_mode) || info.st_nlink != 1)
    return {Status::denied, Handle{}};
  return {Status::ok, std::move(handle)};
#endif
}
MetadataResult metadata(RawHandle handle, bool directory) {
#ifdef _WIN32
  BY_HANDLE_FILE_INFORMATION attributes{};
  if (!GetFileInformationByHandle(handle, &attributes) ||
      (attributes.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ||
      static_cast<bool>(attributes.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != directory ||
      (!directory && attributes.nNumberOfLinks != 1))
    return {Status::denied};
  FILE_ID_INFO identity{};
  if (!GetFileInformationByHandleEx(handle, FileIdInfo, &identity, sizeof(identity)))
    return {os_error(GetLastError())};
  LARGE_INTEGER size{};
  if (!directory && (!GetFileSizeEx(handle, &size) || size.QuadPart < 0))
    return {Status::io};
  FileIdentity id;
  id.volume = identity.VolumeSerialNumber;
  static_assert(sizeof(identity.FileId.Identifier) == id.file.size());
  std::copy(std::begin(identity.FileId.Identifier), std::end(identity.FileId.Identifier), id.file.begin());
  return {Status::ok, static_cast<std::uint64_t>(size.QuadPart), id};
#else
  struct stat info{};
  if (fstat(handle, &info) != 0)
    return {os_error(errno)};
  if (directory ? !S_ISDIR(info.st_mode) : !S_ISREG(info.st_mode) || info.st_nlink != 1)
    return {Status::denied};
  if (info.st_size < 0)
    return {Status::io};
  FileIdentity id;
  id.volume = static_cast<std::uint64_t>(info.st_dev);
  auto inode = static_cast<std::uint64_t>(info.st_ino);
  for (std::size_t at = 0; at < 8; ++at) {
    id.file[at] = static_cast<std::uint8_t>(inode & 255U);
    inode >>= 8;
  }
  return {Status::ok, directory ? 0 : static_cast<std::uint64_t>(info.st_size), id};
#endif
}
} // namespace
struct File::Impl {
  Handle handle;
  bool writable;
  std::mutex mutex;
  Impl(Handle value, bool writes) : handle(std::move(value)), writable(writes) {}
};
struct SafeRoot::Impl {
  Handle handle;
  const bool writable;
  mutable std::mutex namespace_mutex;
  Impl(Handle value, bool writes) : handle(std::move(value)), writable(writes) {}
};
File::File() = default;
File::File(std::unique_ptr<Impl> impl) : impl_(std::move(impl)) {}
File::~File() = default;
File::File(File &&) noexcept = default;
File &File::operator=(File &&) noexcept = default;
File::operator bool() const noexcept { return impl_ != nullptr; }
SafeRoot::SafeRoot() = default;
SafeRoot::SafeRoot(std::unique_ptr<Impl> impl) : impl_(std::move(impl)) {}
SafeRoot::~SafeRoot() = default;
SafeRoot::SafeRoot(SafeRoot &&) noexcept = default;
SafeRoot &SafeRoot::operator=(SafeRoot &&) noexcept = default;
SafeRoot::operator bool() const noexcept { return impl_ != nullptr; }
std::pair<Status, SafeRoot> SafeRoot::open(const std::filesystem::path &path, RootAccess access) {
  if ((access != RootAccess::read_only && access != RootAccess::read_write) ||
      !path.is_absolute() || path.native().empty() || path.native().size() > maximum_path_bytes ||
      path.native().find(std::filesystem::path::value_type{}) != path.native().npos)
    return {Status::invalid, SafeRoot{}};
  for (const auto &part : path)
    if (part == "." || part == "..")
      return {Status::invalid, SafeRoot{}};
#ifdef _WIN32
  const auto &name = path.native();
  if (name.size() < 3 || name[1] != L':' || name[2] != L'\\' ||
      !((name[0] >= L'A' && name[0] <= L'Z') || (name[0] >= L'a' && name[0] <= L'z')))
    return {Status::invalid, SafeRoot{}};
  auto [status, handle] = open_handle(nullptr, L"\\??\\" + name, true, OpenMode::read, true);
  if (status != Status::ok)
    return {status, SafeRoot{}};
  if (!private_root(handle.value))
    return {Status::denied, SafeRoot{}};
#else
  auto [status, handle] = open_handle(AT_FDCWD, path.native(), true, OpenMode::read);
  if (status != Status::ok)
    return {status, SafeRoot{}};
#endif
  return {Status::ok, SafeRoot(std::make_unique<Impl>(std::move(handle),
                                                    access == RootAccess::read_write))};
}
std::pair<Status, SafeRoot> SafeRoot::duplicate_private(std::uintptr_t borrowed) {
#ifdef _WIN32
  const auto source = reinterpret_cast<HANDLE>(borrowed);
  if (!source || source == INVALID_HANDLE_VALUE) return {Status::invalid, SafeRoot{}};
  Handle handle;
  if (!DuplicateHandle(GetCurrentProcess(), source, GetCurrentProcess(), &handle.value,
                       0, FALSE, DUPLICATE_SAME_ACCESS)) return {os_error(GetLastError()), SafeRoot{}};
  if (!private_root(handle.value)) return {Status::denied, SafeRoot{}};
#else
  if (borrowed > static_cast<std::uintptr_t>(std::numeric_limits<int>::max())) return {Status::invalid, SafeRoot{}};
  const auto descriptor = fcntl(static_cast<int>(borrowed), F_DUPFD_CLOEXEC, 0);
  if (descriptor < 0) return {os_error(errno), SafeRoot{}};
  Handle handle(descriptor);
  struct stat owner{};
  if (fstat(handle.value, &owner) != 0) return {os_error(errno), SafeRoot{}};
  if (!S_ISDIR(owner.st_mode) || owner.st_uid != geteuid() || (owner.st_mode & 0077))
    return {Status::denied, SafeRoot{}};
#endif
  const auto info = metadata(handle.value, true);
  if (info.status != Status::ok) return {info.status, SafeRoot{}};
  return {Status::ok, SafeRoot(std::make_unique<Impl>(std::move(handle), true))};
}
OpenResult SafeRoot::open_file(std::string_view path, OpenMode mode) const {
  if (!impl_ || !valid_relative_path(path) ||
      (mode != OpenMode::read && mode != OpenMode::read_write && mode != OpenMode::create_new))
    return {Status::invalid, File{}};
  if (!impl_->writable && mode != OpenMode::read)
    return {Status::denied, File{}};
  std::lock_guard lock(impl_->namespace_mutex);
#ifdef _WIN32
  HANDLE parent = impl_->handle.value;
  OwnedSecurity security;
  if (mode == OpenMode::create_new) {
    if (!private_root(parent)) return {Status::denied, File{}};
    const auto copied = GetSecurityInfo(parent, SE_FILE_OBJECT,
        OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
        nullptr, nullptr, nullptr, nullptr, &security.value);
    if (copied != ERROR_SUCCESS) return {os_error(copied), File{}};
  }
  // Deny directory deletion/rename while resolving each child relative to its
  // parent handle. No check-then-open by a reconstructed absolute string.
  std::vector<Handle> anchors;
  while (true) {
    const auto end = path.find('/');
    const bool directory = end != path.npos;
    auto [status, handle] = open_handle(parent, wide(path.substr(0, end)), directory,
                                        directory ? OpenMode::read : mode, false, false,
                                        directory ? nullptr : security.value);
    if (status != Status::ok)
      return {status, File{}};
    if (!directory)
      return {Status::ok,
              File(std::make_unique<File::Impl>(std::move(handle), mode != OpenMode::read))};
    anchors.push_back(std::move(handle));
    parent = anchors.back().value;
    path.remove_prefix(end + 1);
  }
#else
  auto [status, handle] = open_handle(impl_->handle.value, std::string(path), false, mode);
  if (status != Status::ok)
    return {status, File{}};
  return {Status::ok,
          File(std::make_unique<File::Impl>(std::move(handle), mode != OpenMode::read))};
#endif
}
MetadataResult SafeRoot::identity() const {
  if (!impl_) return {};
  std::lock_guard lock(impl_->namespace_mutex);
  return metadata(impl_->handle.value, true);
}
std::pair<Status, SafeRoot> SafeRoot::open_directory(std::string_view path) const {
  if (!impl_ || !valid_relative_path(path)) return {Status::invalid, SafeRoot{}};
  std::lock_guard lock(impl_->namespace_mutex);
#ifdef _WIN32
  auto parent = parent_for(impl_->handle.value, path);
  if (parent.status != Status::ok) return {parent.status, SafeRoot{}};
  auto [status, handle] = open_handle(parent.value, wide(parent.leaf), true, OpenMode::read, true);
  if (status != Status::ok) return {status, SafeRoot{}};
  if (!private_root(handle.value)) return {Status::denied, SafeRoot{}};
#else
  linux_abi::OpenHow how{};
  how.flags = O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW;
  how.resolve = linux_abi::beneath | linux_abi::no_xdev | linux_abi::no_symlinks | linux_abi::no_magiclinks;
  const auto descriptor = linux_abi::open_beneath(impl_->handle.value, std::string(path).c_str(), how);
  if (descriptor < 0) return {os_error(errno), SafeRoot{}};
  Handle handle(static_cast<int>(descriptor));
  struct stat info{};
  if (fstat(handle.value, &info) != 0) return {os_error(errno), SafeRoot{}};
  if (!S_ISDIR(info.st_mode) || info.st_uid != geteuid() || (info.st_mode & 0077))
    return {Status::denied, SafeRoot{}};
#endif
  const auto parent_id = metadata(impl_->handle.value, true), child_id = metadata(handle.value, true);
  if (parent_id.status != Status::ok || child_id.status != Status::ok ||
      parent_id.identity.volume != child_id.identity.volume) return {Status::denied, SafeRoot{}};
  return {Status::ok, SafeRoot(std::make_unique<Impl>(std::move(handle), impl_->writable))};
}
MetadataResult SafeRoot::inspect(std::string_view path, EntryKind kind, bool require_private) const {
  if (!impl_ || !valid_relative_path(path) || !valid_kind(kind))
    return {};
  std::lock_guard lock(impl_->namespace_mutex);
  auto parent = parent_for(impl_->handle.value, path);
  if (parent.status != Status::ok)
    return {parent.status};
  auto [status, handle] = namespace_entry(parent, kind, false, require_private);
  if (status == Status::ok && require_private) {
#ifdef _WIN32
    if (!private_root(handle.value)) return {Status::denied};
#else
    struct stat owner{};
    if (fstat(handle.value, &owner) != 0) return {os_error(errno)};
    if (owner.st_uid != geteuid() || (owner.st_mode & 0077)) return {Status::denied};
#endif
  }
  return status == Status::ok ? metadata(handle.value, kind == EntryKind::directory)
                              : MetadataResult{status};
}
EmptyResult SafeRoot::empty() const {
  if (!impl_)
    return {};
  std::lock_guard lock(impl_->namespace_mutex);
#ifdef _WIN32
  return directory_empty(impl_->handle.value);
#else
  linux_abi::OpenHow how{};
  how.flags = O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW;
  how.resolve = linux_abi::beneath | linux_abi::no_xdev | linux_abi::no_symlinks | linux_abi::no_magiclinks;
  const auto opened = linux_abi::open_beneath(impl_->handle.value, ".", how);
  if (opened < 0)
    return {os_error(errno), false};
  Handle handle(static_cast<int>(opened));
  auto *stream = fdopendir(handle.value);
  if (!stream)
    return {os_error(errno), false};
  handle.value = -1; // fdopendir owns it now.
  EmptyResult result{Status::io, false};
  for (unsigned count = 0; count < 4; ++count) {
    errno = 0;
    const auto *entry = readdir(stream);
    if (!entry) {
      result = errno == 0 ? EmptyResult{Status::ok, true} : EmptyResult{os_error(errno), false};
      break;
    }
    const auto *name = entry->d_name;
    if (!(name[0] == '.' && (name[1] == '\0' || (name[1] == '.' && name[2] == '\0')))) {
      result = {Status::ok, false};
      break;
    }
  }
  return closedir(stream) == 0 ? result : EmptyResult{Status::io, false};
#endif
}
InventoryResult SafeRoot::inventory(std::size_t entry_limit, std::size_t path_limit) const {
  if (!impl_ || entry_limit > maximum_inventory_entries || path_limit > maximum_inventory_paths)
    return {};
  std::lock_guard lock(impl_->namespace_mutex);
  try {
    const auto root_info = metadata(impl_->handle.value, true);
    if (root_info.status != Status::ok) return {root_info.status, {}};
    InventoryResult result{Status::ok, {}};
    std::size_t path_bytes = 0;
    std::function<Status(RawHandle, std::string_view, unsigned)> scan;
    scan = [&](RawHandle directory, std::string_view prefix, unsigned depth) -> Status {
      const auto visit = [&](std::string_view name, EntryKind kind) -> Status {
        if (name.empty() || name.size() > maximum_component_bytes || name.find('/') != name.npos ||
            !valid_relative_path(name)) return Status::denied;
        if (depth >= maximum_path_depth || result.entries.size() == entry_limit) return Status::unavailable;
        const auto length = prefix.empty() ? name.size() : prefix.size() + 1 + name.size();
        if (length > maximum_path_bytes || length > path_limit - path_bytes) return Status::unavailable;
        // Admit count and every stored pathname byte before allocating either.
        if (result.entries.size() == result.entries.capacity())
          result.entries.reserve(std::min(entry_limit, std::max(std::size_t{16}, result.entries.capacity() * 2)));
#ifdef _WIN32
        auto [opened, handle] = open_handle(directory, wide(name), kind == EntryKind::directory,
                                             OpenMode::read, true);
        if (opened != Status::ok) return opened;
        if (!private_root(handle.value)) return Status::denied;
#else
        Parent parent(directory);parent.leaf = std::string(name);
        auto [opened, handle] = namespace_entry(parent, kind, false);
        if (opened != Status::ok) return opened;
        struct stat owner{};
        if (fstat(handle.value, &owner) != 0) return os_error(errno);
        if (owner.st_uid != geteuid() || (owner.st_mode & 0077)) return Status::denied;
#endif
        const auto actual = metadata(handle.value, kind == EntryKind::directory);
        if (actual.status != Status::ok) return actual.status;
        if (actual.identity.volume != root_info.identity.volume) return Status::denied;
        auto path = prefix.empty() ? std::string(name) : std::string(prefix) + "/" + std::string(name);
        path_bytes += path.size();
        result.entries.push_back({std::move(path), kind, actual});
        if (kind != EntryKind::directory) return Status::ok;
        // A recursive push can reallocate the vector; retain this path locally.
        const auto held_path = result.entries.back().path;
        return scan(handle.value, held_path, depth + 1);
      };
#ifdef _WIN32
      if (!private_root(directory)) return Status::denied;
      alignas(FILE_ID_BOTH_DIR_INFO) std::array<BYTE, 4096> storage{};
      for (std::size_t page = 0; page < entry_limit + 2; ++page) {
        storage.fill(0);
        if (!GetFileInformationByHandleEx(directory,
              page == 0 ? FileIdBothDirectoryRestartInfo : FileIdBothDirectoryInfo,
              storage.data(), static_cast<DWORD>(storage.size())))
          return GetLastError() == ERROR_NO_MORE_FILES ? Status::ok : os_error(GetLastError());
        std::size_t offset = 0;
        constexpr auto header = offsetof(FILE_ID_BOTH_DIR_INFO, FileName);
        for (std::size_t record = 0; record < storage.size() / header + 1; ++record) {
          if (offset > storage.size() - header) return Status::io;
          const auto *entry = reinterpret_cast<const FILE_ID_BOTH_DIR_INFO *>(storage.data() + offset);
          if (!entry->FileNameLength || entry->FileNameLength % sizeof(wchar_t) ||
              entry->FileNameLength > storage.size() - offset - header) return Status::io;
          const std::wstring_view name(entry->FileName, entry->FileNameLength / sizeof(wchar_t));
          if (name != L"." && name != L"..") {
            if ((entry->FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) || name.size() > maximum_component_bytes)
              return Status::denied;
            std::array<char, maximum_component_bytes> utf8{};
            const auto length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, name.data(),
                static_cast<int>(name.size()), utf8.data(), static_cast<int>(utf8.size()), nullptr, nullptr);
            if (length <= 0) return Status::denied;
            const auto status = visit({utf8.data(), static_cast<std::size_t>(length)},
                entry->FileAttributes & FILE_ATTRIBUTE_DIRECTORY ? EntryKind::directory : EntryKind::file);
            if (status != Status::ok) return status;
          }
          if (!entry->NextEntryOffset) break;
          if (entry->NextEntryOffset < header || entry->NextEntryOffset % alignof(FILE_ID_BOTH_DIR_INFO) ||
              entry->NextEntryOffset > storage.size() - offset - header) return Status::io;
          offset += entry->NextEntryOffset;
        }
      }
      return Status::unavailable;
#else
      linux_abi::OpenHow how{};
      how.flags = O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW;
      how.resolve = linux_abi::beneath | linux_abi::no_xdev | linux_abi::no_symlinks | linux_abi::no_magiclinks;
      const auto descriptor = linux_abi::open_beneath(directory, ".", how);
      if (descriptor < 0) return os_error(errno);
      Handle handle(static_cast<int>(descriptor));
      struct stat owner{};
      if (fstat(handle.value, &owner) != 0) return os_error(errno);
      if (owner.st_uid != geteuid() || (owner.st_mode & 0077)) return Status::denied;
      auto *stream = fdopendir(handle.value);
      if (!stream) return os_error(errno);
      handle.value = -1;
      struct Stream {
        DIR *value;
        ~Stream() { if (value && closedir(value) != 0) std::terminate(); }
      } owned{stream};
      for (std::size_t count = 0; count < entry_limit + 3; ++count) {
        errno = 0;
        const auto *entry = readdir(stream);
        if (!entry) return errno ? os_error(errno) : Status::ok;
        const auto size = strnlen(entry->d_name, sizeof(entry->d_name));
        if (size == sizeof(entry->d_name)) return Status::denied;
        const std::string_view name(entry->d_name, size);
        if (name == "." || name == "..") continue;
        struct stat info{};
        if (fstatat(dirfd(stream), entry->d_name, &info, AT_SYMLINK_NOFOLLOW) != 0) return os_error(errno);
        if (!S_ISREG(info.st_mode) && !S_ISDIR(info.st_mode)) return Status::denied;
        const auto status = visit(name, S_ISDIR(info.st_mode) ? EntryKind::directory : EntryKind::file);
        if (status != Status::ok) return status;
      }
      return Status::unavailable;
#endif
    };
    const auto status = scan(impl_->handle.value, {}, 0);
    if (status != Status::ok) return {status, {}};
    // Reject repeated objects as well as repeated paths before any lifecycle
    // consumer can act on the snapshot. In particular, case-sensitive Windows
    // directories cannot alias two enumerated names through insensitive opens.
    std::sort(result.entries.begin(), result.entries.end(), [](const auto &a, const auto &b) {
      return a.metadata.identity.file < b.metadata.identity.file;
    });
    for (std::size_t i = 1; i < result.entries.size(); ++i)
      if (result.entries[i - 1].metadata.identity == result.entries[i].metadata.identity) return {Status::denied, {}};
    std::sort(result.entries.begin(), result.entries.end(), [](const auto &a, const auto &b) { return a.path < b.path; });
    for (std::size_t i = 1; i < result.entries.size(); ++i)
      if (result.entries[i - 1].path == result.entries[i].path) return {Status::denied, {}};
    return result;
  } catch (const std::bad_alloc &) { return {Status::unavailable, {}}; }
}
Status SafeRoot::create_directory(std::string_view path) const {
  if (!impl_ || !valid_relative_path(path))
    return Status::invalid;
  if (!impl_->writable)
    return Status::denied;
  std::lock_guard lock(impl_->namespace_mutex);
  auto parent = parent_for(impl_->handle.value, path);
  if (parent.status != Status::ok)
    return parent.status;
#ifdef _WIN32
  // A nested managed root must retain the same explicit private ACL as its
  // root. Ordinary inheritance alone drops SE_DACL_PROTECTED on Windows.
  // Copy the verified root descriptor only for a new entry; never repair an
  // existing directory or reopen it by a reconstructed absolute pathname.
  if (!private_root(impl_->handle.value))
    return Status::denied;
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  const auto security = GetSecurityInfo(impl_->handle.value, SE_FILE_OBJECT,
      OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION, nullptr, nullptr, nullptr, nullptr, &descriptor);
  if (security != ERROR_SUCCESS)
    return os_error(security);
  struct Descriptor {
    PSECURITY_DESCRIPTOR value;
    ~Descriptor() { if (value && LocalFree(value)) std::terminate(); }
  } owned{descriptor};
  auto [status, handle] = open_handle(parent.value, wide(parent.leaf), true, OpenMode::create_new,
                                      false, false, descriptor);
  return status;
#else
  return mkdirat(parent.value, parent.leaf.c_str(), 0700) == 0 ? Status::ok : os_error(errno);
#endif
}
Status SafeRoot::remove(std::string_view path, EntryKind kind, std::optional<FileIdentity> expected) const {
  if (!impl_ || !valid_relative_path(path) || !valid_kind(kind))
    return Status::invalid;
  if (!impl_->writable)
    return Status::denied;
  std::lock_guard lock(impl_->namespace_mutex);
  auto parent = parent_for(impl_->handle.value, path);
  if (parent.status != Status::ok)
    return parent.status;
  auto [status, handle] = namespace_entry(parent, kind);
  if (status != Status::ok)
    return status;
  if (expected) {
    const auto actual = metadata(handle.value, kind == EntryKind::directory);
    if (actual.status != Status::ok || actual.identity != *expected) return Status::denied;
  }
#ifdef _WIN32
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(2);
  const auto dispose = [&]() -> Status {
#if defined(FILE_DISPOSITION_FLAG_POSIX_SEMANTICS)
    // Remove the name when this verified DELETE handle closes, even if an
    // independent shared-delete reader (for example an OS scanner) remains.
    // SafeRoot's own IO/anchor sharing and the owner's view pins are unchanged.
    // Retain the legacy mapped-image refusal and never ignore readonly flags.
    FILE_DISPOSITION_INFO_EX disposition{FILE_DISPOSITION_FLAG_DELETE |
                                        FILE_DISPOSITION_FLAG_POSIX_SEMANTICS |
                                        FILE_DISPOSITION_FLAG_FORCE_IMAGE_SECTION_CHECK};
    if (SetFileInformationByHandle(handle.value, FileDispositionInfoEx, &disposition,
                                    sizeof(disposition)))
      return Status::ok;
    const auto error = GetLastError();
    if (error != ERROR_INVALID_PARAMETER && error != ERROR_NOT_SUPPORTED &&
        error != ERROR_INVALID_FUNCTION)
      return os_error(error);
    // Older kernels/filesystems may not implement the extended class. Only
    // unsupported selectors fall back; denied/busy/IO failures stay authoritative.
#endif
    FILE_DISPOSITION_INFO info{TRUE};
    return SetFileInformationByHandle(handle.value, FileDispositionInfo, &info, sizeof(info))
               ? Status::ok : os_error(GetLastError());
  };
  return detail::finish_directory_removal(kind, dispose,
      [&] { return directory_empty(handle.value); },
      [] { (void)SwitchToThread(); },
      [&] { return std::chrono::steady_clock::now() < deadline; });
#else
  return unlinkat(parent.value, parent.leaf.c_str(), kind == EntryKind::directory ? AT_REMOVEDIR : 0)
                 == 0
             ? Status::ok : os_error(errno);
#endif
}
Status SafeRoot::rename(std::string_view source, std::string_view target, EntryKind kind,
                        RenameMode mode) const {
  if (!impl_ || !valid_relative_path(source) || !valid_relative_path(target) || !valid_kind(kind) ||
      (mode != RenameMode::no_replace && mode != RenameMode::replace_file) || source == target ||
      (mode == RenameMode::replace_file && kind != EntryKind::file))
    return Status::invalid;
  if (!impl_->writable)
    return Status::denied;
  std::lock_guard lock(impl_->namespace_mutex);
  auto from = parent_for(impl_->handle.value, source);
  if (from.status != Status::ok)
    return from.status;
  auto to = parent_for(impl_->handle.value, target);
  if (to.status != Status::ok)
    return to.status;
  auto [status, handle] = namespace_entry(from, kind);
  if (status != Status::ok)
    return status;
  if (mode == RenameMode::replace_file) {
    // Only regular, single-link files may be replaced. This probe closes
    // before the namespace operation (Windows forbids replacing its open
    // delete handle); final-entry rename never follows a link on either OS.
    auto [existing, checked] = namespace_entry(to, EntryKind::file);
    if (existing != Status::ok && existing != Status::missing)
      return existing;
  }
#ifdef _WIN32
  const auto name = wide(to.leaf);
  alignas(FILE_RENAME_INFO) std::array<std::uint8_t,
      sizeof(FILE_RENAME_INFO) + maximum_component_bytes * sizeof(wchar_t)> storage{};
  auto *info = ::new (storage.data()) FILE_RENAME_INFO{};
  info->ReplaceIfExists = mode == RenameMode::replace_file;
  info->RootDirectory = to.value;
  info->FileNameLength = static_cast<DWORD>(name.size() * sizeof(wchar_t));
  std::memcpy(storage.data() + offsetof(FILE_RENAME_INFO, FileName), name.data(), info->FileNameLength);
  const auto length = sizeof(FILE_RENAME_INFO) + static_cast<std::size_t>(info->FileNameLength);
  const auto renamed = windows_abi::rename_entry(handle.value, info, static_cast<ULONG>(length));
  return renamed == 0 ? Status::ok
                      : (renamed < 0 ? os_error(RtlNtStatusToDosError(renamed)) : Status::io);
#else
  const auto result = linux_abi::rename_entry(from.value, from.leaf.c_str(), to.value,
                                             to.leaf.c_str(), mode == RenameMode::replace_file);
  // All API flags are admitted above. EINVAL here also covers filesystems
  // without the requested rename primitive; do not use a racy substitute.
  return result == 0 ? Status::ok : (errno == EINVAL ? Status::unavailable : os_error(errno));
#endif
}
IoResult File::read(std::uint64_t offset, ::bridge::compat::span<std::uint8_t> output) {
  if (!impl_ || !valid_io(offset, output.size()))
    return {Status::invalid};
  if (output.empty())
    return {Status::ok};
  std::lock_guard lock(impl_->mutex);
#ifdef _WIN32
  LARGE_INTEGER position{};
  position.QuadPart = static_cast<LONGLONG>(offset);
  if (!SetFilePointerEx(impl_->handle.value, position, nullptr, FILE_BEGIN))
    return {os_error(GetLastError())};
  DWORD count = 0;
  if (!ReadFile(impl_->handle.value, output.data(), static_cast<DWORD>(output.size()), &count,
                nullptr))
    return {GetLastError() == ERROR_HANDLE_EOF ? Status::ok : os_error(GetLastError())};
  return {Status::ok, count};
#else
  ssize_t count = 0;
  do {
    count = pread(impl_->handle.value, output.data(), output.size(), static_cast<off_t>(offset));
  } while (count < 0 && errno == EINTR);
  return count < 0 ? IoResult{os_error(errno)}
                   : IoResult{Status::ok, static_cast<std::size_t>(count)};
#endif
}
IoResult File::write(std::uint64_t offset, ::bridge::compat::span<const std::uint8_t> input) {
  if (!impl_ || !valid_io(offset, input.size()))
    return {Status::invalid};
  if (!impl_->writable)
    return {Status::denied};
  if (input.empty())
    return {Status::ok};
  std::lock_guard lock(impl_->mutex);
#ifdef _WIN32
  LARGE_INTEGER position{};
  position.QuadPart = static_cast<LONGLONG>(offset);
  if (!SetFilePointerEx(impl_->handle.value, position, nullptr, FILE_BEGIN))
    return {os_error(GetLastError())};
#endif
  std::size_t completed = 0;
  while (completed < input.size()) {
#ifdef _WIN32
    DWORD count = 0;
    if (!WriteFile(impl_->handle.value, input.data() + completed,
                   static_cast<DWORD>(input.size() - completed), &count, nullptr))
      return {os_error(GetLastError()), completed};
#else
    const auto count = pwrite(impl_->handle.value, input.data() + completed,
                              input.size() - completed, static_cast<off_t>(offset + completed));
    if (count < 0) {
      if (errno == EINTR)
        continue;
      return {os_error(errno), completed};
    }
#endif
    if (count == 0)
      return {Status::io, completed};
    completed += static_cast<std::size_t>(count);
  }
  return {Status::ok, completed};
}
SizeResult File::size() {
  if (!impl_)
    return {Status::invalid};
  std::lock_guard lock(impl_->mutex);
#ifdef _WIN32
  LARGE_INTEGER value{};
  if (!GetFileSizeEx(impl_->handle.value, &value))
    return {os_error(GetLastError())};
  return value.QuadPart < 0 ? SizeResult{Status::io}
                            : SizeResult{Status::ok, static_cast<std::uint64_t>(value.QuadPart)};
#else
  struct stat value{};
  if (fstat(impl_->handle.value, &value) != 0)
    return {os_error(errno)};
  return value.st_size < 0 ? SizeResult{Status::io}
                           : SizeResult{Status::ok, static_cast<std::uint64_t>(value.st_size)};
#endif
}
MetadataResult File::metadata() {
  if (!impl_)
    return {};
  std::lock_guard lock(impl_->mutex);
  return ::bridge::files::metadata(impl_->handle.value, false);
}
Status File::resize(std::uint64_t bytes) {
  if (!impl_ || bytes > maximum_offset)
    return Status::invalid;
  if (!impl_->writable)
    return Status::denied;
  std::lock_guard lock(impl_->mutex);
#ifdef _WIN32
  LARGE_INTEGER position{};
  position.QuadPart = static_cast<LONGLONG>(bytes);
  if (!SetFilePointerEx(impl_->handle.value, position, nullptr, FILE_BEGIN) ||
      !SetEndOfFile(impl_->handle.value))
    return os_error(GetLastError());
#else
  if (ftruncate(impl_->handle.value, static_cast<off_t>(bytes)) != 0)
    return os_error(errno);
#endif
  return Status::ok;
}
} // namespace bridge::files
