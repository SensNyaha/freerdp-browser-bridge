#include "ownership.hpp"
#include "recovery.hpp"
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <fstream>
#include <string>
#ifdef _WIN32
#include "private_directory.hpp"

#include <aclapi.h>
#else
#include <sys/stat.h>
#endif
using namespace bridge::runtime;
namespace {
struct Fixture {
  std::filesystem::path root;
  const std::filesystem::path name =
      "worker-" + std::string(32, 'c') + "-1-" + std::string(32, 'd');
  std::filesystem::path directory;
  Fixture() {
    root = std::filesystem::temp_directory_path() /
           ("bridge-recovery-" +
            std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
#ifdef _WIN32
    if (create_private_directory(root.native()) != ERROR_SUCCESS)
      throw RuntimeOwnershipError();
#else
    if (!std::filesystem::create_directory(root))
      throw RuntimeOwnershipError();
    if (::chmod(root.c_str(), 0700) != 0)
      throw RuntimeOwnershipError();
#endif
    directory = root / name;
#ifdef _WIN32
    if (create_private_directory(directory.native()) != ERROR_SUCCESS)
      throw RuntimeOwnershipError();
#else
    if (::mkdir(directory.c_str(), 0700) != 0)
      throw RuntimeOwnershipError();
#endif
  }
  void marker(std::string_view bytes = "runtime-v1") const {
    std::ofstream output(directory / ".rdp-worker-owned", std::ios::binary | std::ios::trunc);
    output.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
    output.close();
    if (!output)
      throw RuntimeOwnershipError();
  }
  RecoveryResult recover() const { return recover_runtime_directory(root, name); }
  ~Fixture() {
    std::error_code ignored;
    for (const auto &path :
         {directory / ".rdp-worker-owned", directory / "unknown", root / "other", directory, root})
      std::filesystem::remove(path, ignored);
  }
};
} // namespace
TEST_CASE("Recovery removes only known full or startup-prefix metadata and the empty directory") {
  for (const auto value : {"runtime-v1", "runtime-v", "r", ""}) {
    Fixture fixture;
    fixture.marker(value);
    REQUIRE(fixture.recover() == RecoveryResult::removed);
    CHECK(std::filesystem::is_empty(fixture.root));
    CHECK(fixture.recover() == RecoveryResult::retained);
  }
  Fixture empty;
  CHECK(empty.recover() == RecoveryResult::removed);
  CHECK(std::filesystem::is_empty(empty.root));
}
TEST_CASE("Recovery retains live native marker ownership and works only after release") {
  Fixture fixture;
  fixture.marker();
  {
    RuntimeLease owner(fixture.directory);
    CHECK(fixture.recover() == RecoveryResult::busy);
    CHECK(std::filesystem::exists(fixture.directory));
  }
  CHECK(fixture.recover() == RecoveryResult::removed);
}
TEST_CASE("Recovery refuses malformed metadata and leaves every byte untouched") {
  for (const auto value : {"Runtime-v1", "runtime-v2", "runtime-v1x", "unknown"}) {
    Fixture fixture;
    fixture.marker(value);
    CHECK(fixture.recover() == RecoveryResult::retained);
    CHECK(std::filesystem::file_size(fixture.directory / ".rdp-worker-owned") ==
          std::string_view(value).size());
  }
}
TEST_CASE("Recovery preserves unknown files and nested directories with the owned marker") {
  for (const bool nested : {true, false}) {
    Fixture fixture;
    fixture.marker();
    if (nested)
      std::filesystem::create_directory(fixture.directory / "unknown");
    else
      std::ofstream(fixture.directory / "unknown") << "preserve";
    CHECK(fixture.recover() == RecoveryResult::retained);
    CHECK(std::filesystem::exists(fixture.directory / "unknown"));
    CHECK(std::filesystem::file_size(fixture.directory / ".rdp-worker-owned") == 10);
  }
}
TEST_CASE("Recovery rejects legacy traversal and hard-linked marker objects") {
  Fixture fixture;
  fixture.marker();
  CHECK(recover_runtime_directory(fixture.root / "", fixture.name) == RecoveryResult::retained);
  CHECK(recover_runtime_directory(fixture.root / ".", fixture.name) == RecoveryResult::retained);
  for (const auto &name : {std::filesystem::path("worker-legacy"),
                           std::filesystem::path("../") / fixture.name, fixture.directory})
    CHECK(recover_runtime_directory(fixture.root, name) == RecoveryResult::retained);
  std::filesystem::create_hard_link(fixture.directory / ".rdp-worker-owned",
                                    fixture.root / "other");
  CHECK(fixture.recover() == RecoveryResult::retained);
  CHECK(std::filesystem::hard_link_count(fixture.root / "other") == 2);
}
#ifdef __linux__
TEST_CASE("Recovery refuses shared roots writable markers and a linked directory") {
  Fixture fixture;
  fixture.marker();
  REQUIRE(::chmod(fixture.root.c_str(), 0770) == 0);
  CHECK(fixture.recover() == RecoveryResult::retained);
  REQUIRE(::chmod(fixture.root.c_str(), 0700) == 0);
  REQUIRE(::chmod((fixture.directory / ".rdp-worker-owned").c_str(), 0666) == 0);
  CHECK(fixture.recover() == RecoveryResult::retained);
  REQUIRE(::chmod((fixture.directory / ".rdp-worker-owned").c_str(), 0600) == 0);
  std::filesystem::rename(fixture.directory, fixture.root / "other");
  std::filesystem::create_directory_symlink(fixture.root / "other", fixture.directory);
  CHECK(fixture.recover() == RecoveryResult::retained);
  CHECK(std::filesystem::exists(fixture.root / "other" / ".rdp-worker-owned"));
  REQUIRE(std::filesystem::remove(fixture.directory));
  std::filesystem::rename(fixture.root / "other", fixture.directory);
}
TEST_CASE("Recovery refuses symbolic link and FIFO marker objects without following or waiting") {
  for (const bool fifo : {true, false}) {
    Fixture fixture;
    if (fifo)
      REQUIRE(::mkfifo((fixture.directory / ".rdp-worker-owned").c_str(), 0600) == 0);
    else {
      std::ofstream(fixture.root / "other") << "runtime-v1";
      std::filesystem::create_symlink(fixture.root / "other",
                                      fixture.directory / ".rdp-worker-owned");
    }
    CHECK(fixture.recover() == RecoveryResult::retained);
    CHECK(std::filesystem::exists(fixture.directory / ".rdp-worker-owned"));
  }
}
#else
TEST_CASE("Recovery refuses another user's write grant on the Windows runtime root") {
  Fixture fixture;
  fixture.marker();
  auto name = fixture.root.native();
  struct Storage {
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    PACL modified = nullptr;
    ~Storage() {
      if (modified)
        LocalFree(modified);
      if (descriptor)
        LocalFree(descriptor);
    }
  } storage;
  PACL original = nullptr;
  REQUIRE(GetNamedSecurityInfoW(name.data(), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION, nullptr,
                                nullptr, &original, nullptr, &storage.descriptor) == ERROR_SUCCESS);
  alignas(DWORD) std::array<BYTE, SECURITY_MAX_SID_SIZE> everyone{};
  DWORD size = static_cast<DWORD>(everyone.size());
  REQUIRE(CreateWellKnownSid(WinWorldSid, nullptr, everyone.data(), &size));
  EXPLICIT_ACCESSW grant{};
  grant.grfAccessPermissions = FILE_ADD_FILE;
  grant.grfAccessMode = GRANT_ACCESS;
  grant.Trustee.TrusteeForm = TRUSTEE_IS_SID;
  grant.Trustee.TrusteeType = TRUSTEE_IS_WELL_KNOWN_GROUP;
  grant.Trustee.ptstrName = reinterpret_cast<wchar_t *>(everyone.data());
  REQUIRE(SetEntriesInAclW(1, &grant, original, &storage.modified) == ERROR_SUCCESS);
  REQUIRE(SetNamedSecurityInfoW(name.data(), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION, nullptr,
                                nullptr, storage.modified, nullptr) == ERROR_SUCCESS);
  CHECK(fixture.recover() == RecoveryResult::retained);
  CHECK(std::filesystem::file_size(fixture.directory / ".rdp-worker-owned") == 10);
}
TEST_CASE("Recovery refuses inherited Windows session ACLs without repairing them") {
  Fixture fixture;
  REQUIRE(std::filesystem::remove(fixture.directory));
  REQUIRE(std::filesystem::create_directory(fixture.directory));
  fixture.marker();
  CHECK(fixture.recover() == RecoveryResult::retained);
  CHECK(std::filesystem::file_size(fixture.directory / ".rdp-worker-owned") == 10);
}
#endif
