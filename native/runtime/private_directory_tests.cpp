#include "private_directory.hpp"
#include <aclapi.h>
#include <array>
#include <atomic>
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <filesystem>
#include <stdexcept>
#include <vector>
using bridge::runtime::create_private_directory;
namespace {
struct Handle {
  HANDLE value = nullptr;
  ~Handle() {
    if (value && value != INVALID_HANDLE_VALUE && !CloseHandle(value))
      std::terminate();
  }
};
struct Descriptor {
  PSECURITY_DESCRIPTOR value = nullptr;
  PSID owner = nullptr;
  PACL acl = nullptr;
  explicit Descriptor(const std::filesystem::path &path) {
    const auto status =
        GetNamedSecurityInfoW(const_cast<wchar_t *>(path.c_str()), SE_FILE_OBJECT,
                              OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION, &owner,
                              nullptr, &acl, nullptr, &value);
    if (status != ERROR_SUCCESS)
      throw std::runtime_error("Fixture security query failed");
  }
  ~Descriptor() {
    if (value && LocalFree(value))
      std::terminate();
  }
  std::vector<BYTE> bytes() const {
    const auto *begin = static_cast<const BYTE *>(value);
    return {begin, begin + GetSecurityDescriptorLength(value)};
  }
};
struct Fixture {
  const std::filesystem::path base = std::filesystem::current_path();
  std::filesystem::path root;
  Fixture() {
    static std::atomic<unsigned> sequence{0};
    root = base / (L"private-acl-тест-" + std::to_wstring(GetCurrentProcessId()) + L"-" +
                   std::to_wstring(std::chrono::steady_clock::now().time_since_epoch().count()) +
                   L"-" + std::to_wstring(sequence.fetch_add(1)));
    REQUIRE(root.parent_path() == base); // Own direct test child, never a computed ancestor.
    REQUIRE(create_private_directory(root.native()) == ERROR_SUCCESS);
  }
  ~Fixture() {
    // Known direct children only; no recursive removal or traversal through links.
    for (const auto *name : {L"file", L"child", L"existing"}) {
      std::error_code error;
      (void)std::filesystem::remove(root / name, error);
      if (error)
        std::terminate();
    }
    std::error_code error;
    (void)std::filesystem::remove(root, error);
    if (error)
      std::terminate();
  }
};
void check_acl(const Descriptor &descriptor, bool inherited) {
  REQUIRE(descriptor.owner);
  REQUIRE(descriptor.acl);
  REQUIRE(IsValidAcl(descriptor.acl));
  Handle token;
  REQUIRE(OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token.value));
  alignas(TOKEN_USER) std::array<BYTE, sizeof(TOKEN_USER) + SECURITY_MAX_SID_SIZE + 16> user{};
  DWORD length = 0;
  REQUIRE(GetTokenInformation(token.value, TokenUser, user.data(), static_cast<DWORD>(user.size()),
                              &length));
  const auto *current = reinterpret_cast<const TOKEN_USER *>(user.data());
  REQUIRE(IsValidSid(current->User.Sid));
  const bool is_system = IsWellKnownSid(current->User.Sid, WinLocalSystemSid) != FALSE;
  REQUIRE(descriptor.acl->AceCount == (is_system ? 1 : 2));
  unsigned user_aces = 0, system_aces = 0;
  for (DWORD index = 0; index < descriptor.acl->AceCount; ++index) {
    void *entry = nullptr;
    REQUIRE(GetAce(descriptor.acl, index, &entry));
    const auto *ace = static_cast<const ACCESS_ALLOWED_ACE *>(entry);
    REQUIRE(ace->Header.AceType == ACCESS_ALLOWED_ACE_TYPE);
    REQUIRE(ace->Mask == FILE_ALL_ACCESS);
    REQUIRE(((ace->Header.AceFlags & INHERITED_ACE) != 0) == inherited);
    auto *sid = const_cast<DWORD *>(&ace->SidStart);
    REQUIRE(IsValidSid(sid));
    const bool mine = EqualSid(sid, current->User.Sid) != FALSE;
    const bool system = IsWellKnownSid(sid, WinLocalSystemSid) != FALSE;
    REQUIRE((mine || system));
    user_aces += mine ? 1U : 0U;
    system_aces += system ? 1U : 0U;
    if (!inherited)
      REQUIRE((ace->Header.AceFlags & (OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE)) ==
              (OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE));
  }
  REQUIRE(user_aces == 1);
  REQUIRE(system_aces == 1);
  if (!inherited)
    REQUIRE(EqualSid(descriptor.owner, current->User.Sid));
}
} // namespace
TEST_CASE(
    "Windows private directory creation installs explicit owner and protected inheritable ACL") {
  Fixture f;
  Descriptor descriptor(f.root);
  SECURITY_DESCRIPTOR_CONTROL control = 0;
  DWORD revision = 0;
  REQUIRE(GetSecurityDescriptorControl(descriptor.value, &control, &revision));
  REQUIRE((control & SE_DACL_PROTECTED) != 0);
  check_acl(descriptor, false);
}
TEST_CASE(
    "Windows private directory child files and directories inherit only approved principals") {
  Fixture f;
  REQUIRE(std::filesystem::create_directory(f.root / L"child"));
  {
    Handle file;
    file.value = CreateFileW((f.root / L"file").c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
                             FILE_ATTRIBUTE_NORMAL, nullptr);
    REQUIRE(file.value != INVALID_HANDLE_VALUE);
  }
  check_acl(Descriptor(f.root / L"child"), true);
  check_acl(Descriptor(f.root / L"file"), true);
}
TEST_CASE("Windows private directory creation refuses existing objects without changing security") {
  Fixture f;
  const auto path = f.root / L"existing";
  REQUIRE(std::filesystem::create_directory(path));
  const auto original = Descriptor(path).bytes();
  REQUIRE(create_private_directory(path.native()) == ERROR_ALREADY_EXISTS);
  REQUIRE(Descriptor(path).bytes() == original);
  const auto root = Descriptor(f.root).bytes();
  REQUIRE(create_private_directory(f.root.native()) == ERROR_ALREADY_EXISTS);
  REQUIRE(Descriptor(f.root).bytes() == root);
}
TEST_CASE("Windows private directory creation refuses invalid names before filesystem changes") {
  REQUIRE(create_private_directory(L"") == ERROR_INVALID_NAME);
  REQUIRE(create_private_directory(L"relative") == ERROR_INVALID_NAME);
  REQUIRE(create_private_directory(L"C:\\") == ERROR_INVALID_NAME);
  REQUIRE(create_private_directory(std::wstring_view(L"C:\\abc\0bad", 10)) == ERROR_INVALID_NAME);
  REQUIRE(create_private_directory(L"C:\\" + std::wstring(32765, L'x')) == ERROR_INVALID_NAME);
}
TEST_CASE("Windows private directory creation refuses a file parent without changing its ACL") {
  Fixture f;
  const auto path = f.root / L"file";
  {
    Handle file;
    file.value = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
                             FILE_ATTRIBUTE_NORMAL, nullptr);
    REQUIRE(file.value != INVALID_HANDLE_VALUE);
  }
  const auto original = Descriptor(path).bytes();
  REQUIRE(create_private_directory((path / L"child").native()) == ERROR_INVALID_NAME);
  REQUIRE(Descriptor(path).bytes() == original);
}
