#include "ownership.hpp"
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <fstream>
#include <string>
#ifdef _WIN32
#include "private_directory.hpp"
#include <aclapi.h>
#else
#include <sys/stat.h>
#include <unistd.h>
#endif

using namespace bridge::runtime;
namespace {
const std::string managed_name = "worker-" + std::string(32, 'a') + "-1-" + std::string(32, 'b');
struct Directory {
  std::filesystem::path base;
  std::filesystem::path path;
  Directory() {
    const auto nonce = std::chrono::steady_clock::now().time_since_epoch().count();
    base = std::filesystem::temp_directory_path() / ("bridge-lease-" + std::to_string(nonce));
    if (!std::filesystem::create_directory(base))
      throw RuntimeOwnershipError();
    path = base / managed_name;
#ifdef _WIN32
    if (create_private_directory(path.native()) != ERROR_SUCCESS)
      throw RuntimeOwnershipError();
#else
    if (::mkdir(path.c_str(), 0700) != 0)
      throw RuntimeOwnershipError();
#endif
    marker("runtime-v1");
  }
  void marker(std::string_view bytes) const {
    std::ofstream stream(path / ".rdp-worker-owned", std::ios::binary | std::ios::trunc);
    stream.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
    stream.close();
    if (!stream)
      throw RuntimeOwnershipError();
  }
  ~Directory() {
    // Only this fixture's freshly created, known objects; never recursive deletion.
    std::error_code ignored;
    std::filesystem::remove(path / ".rdp-worker-owned", ignored);
    std::filesystem::remove(base / "other-link", ignored);
    std::filesystem::remove(path, ignored);
    std::filesystem::remove(base, ignored);
  }
};
} // namespace
TEST_CASE("Runtime identity accepts only exact schema one lowercase ASCII components") {
  const auto identity = runtime_identity(std::string_view(managed_name));
  REQUIRE(identity);
  CHECK(std::string(identity->owner.data(), identity->owner.size()) == std::string(32, 'a'));
  CHECK(std::string(identity->session.data(), identity->session.size()) == std::string(32, 'b'));
  CHECK(
      runtime_identity(std::wstring_view(std::wstring(managed_name.begin(), managed_name.end()))));
  for (const auto &name : {std::string(), std::string("worker-legacy"), managed_name + "x",
                           managed_name.substr(1), "../" + managed_name})
    CHECK_FALSE(runtime_identity(std::string_view(name)));
  for (const auto offset :
       {std::size_t{7}, std::size_t{38}, std::size_t{40}, std::size_t{42}, std::size_t{73}}) {
    auto name = managed_name;
    name[offset] = offset == 40 ? '2' : 'A';
    CHECK_FALSE(runtime_identity(std::string_view(name)));
  }
}
TEST_CASE("Runtime marker lock excludes a second owner and releases at scope exit") {
  Directory directory;
  for (int i = 0; i < 16; ++i) {
    RuntimeLease owner(directory.path);
    CHECK_THROWS_AS(RuntimeLease{directory.path}, RuntimeOwnershipError);
    CHECK(std::filesystem::exists(directory.path / ".rdp-worker-owned"));
  }
  RuntimeLease reacquired(directory.path);
}
TEST_CASE("Runtime marker refuses missing partial altered oversized and directory objects") {
  Directory directory;
  for (const auto value : {"", "runtime-v", "Runtime-v1", "runtime-v1x"}) {
    directory.marker(value);
    CHECK_THROWS_AS(RuntimeLease{directory.path}, RuntimeOwnershipError);
  }
  REQUIRE(std::filesystem::remove(directory.path / ".rdp-worker-owned"));
  CHECK_THROWS_AS(RuntimeLease{directory.path}, RuntimeOwnershipError);
  REQUIRE(std::filesystem::create_directory(directory.path / ".rdp-worker-owned"));
  CHECK_THROWS_AS(RuntimeLease{directory.path}, RuntimeOwnershipError);
  REQUIRE(std::filesystem::remove(directory.path / ".rdp-worker-owned"));
  directory.marker("runtime-v1");
  CHECK_NOTHROW(RuntimeLease{directory.path});
}
TEST_CASE("Runtime marker refuses hard links without changing either link") {
  Directory directory;
  const auto marker = directory.path / ".rdp-worker-owned";
  std::filesystem::create_hard_link(marker, directory.base / "other-link");
  CHECK_THROWS_AS(RuntimeLease{directory.path}, RuntimeOwnershipError);
  CHECK(std::filesystem::hard_link_count(marker) == 2);
  REQUIRE(std::filesystem::remove(directory.base / "other-link"));
  CHECK_NOTHROW(RuntimeLease{directory.path});
}
#ifdef _WIN32
TEST_CASE("Elevated default marker ownership does not authorize a group-owned session directory") {
  HANDLE token = nullptr;
  REQUIRE(OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token));
  alignas(TOKEN_OWNER) std::array<BYTE, sizeof(TOKEN_OWNER) + SECURITY_MAX_SID_SIZE + 16> storage{};
  DWORD used = 0;
  const bool read = GetTokenInformation(token, TokenOwner, storage.data(),
                                        static_cast<DWORD>(storage.size()), &used) != FALSE;
  REQUIRE(CloseHandle(token));
  REQUIRE(read);
  const auto owner = reinterpret_cast<const TOKEN_OWNER *>(storage.data())->Owner;
  REQUIRE(IsValidSid(owner));
  alignas(DWORD) std::array<BYTE, SECURITY_MAX_SID_SIZE> administrators{};
  DWORD size = static_cast<DWORD>(administrators.size());
  REQUIRE(CreateWellKnownSid(WinBuiltinAdministratorsSid, nullptr, administrators.data(), &size));
  if (!EqualSid(owner, administrators.data()))
    SKIP("Requires an actual elevated token whose default file owner is Administrators");
  Directory directory;
  CHECK_NOTHROW(RuntimeLease{directory.path});
  auto path = directory.path.native();
  REQUIRE(SetNamedSecurityInfoW(path.data(), SE_FILE_OBJECT,
                                 OWNER_SECURITY_INFORMATION, owner, nullptr, nullptr,
                                 nullptr) == ERROR_SUCCESS);
  CHECK_THROWS_AS(RuntimeLease{directory.path}, RuntimeOwnershipError);
  CHECK(std::filesystem::file_size(directory.path / ".rdp-worker-owned") == 10);
}
TEST_CASE("Runtime lease refuses an inherited unprotected Windows directory ACL") {
  Directory directory;
  REQUIRE(std::filesystem::remove(directory.path / ".rdp-worker-owned"));
  REQUIRE(std::filesystem::remove(directory.path));
  REQUIRE(std::filesystem::create_directory(directory.path));
  directory.marker("runtime-v1");
  CHECK_THROWS_AS(RuntimeLease{directory.path}, RuntimeOwnershipError);
  CHECK(std::filesystem::file_size(directory.path / ".rdp-worker-owned") == 10);
}
#endif
#ifdef __linux__
TEST_CASE("Runtime lease refuses writable directories and marker symlinks without following") {
  Directory directory;
  REQUIRE(::chmod(directory.path.c_str(), 0770) == 0);
  CHECK_THROWS_AS(RuntimeLease{directory.path}, RuntimeOwnershipError);
  REQUIRE(::chmod(directory.path.c_str(), 0700) == 0);
  const auto marker = directory.path / ".rdp-worker-owned";
  std::filesystem::rename(marker, directory.base / "other-link");
  std::filesystem::create_symlink(directory.base / "other-link", marker);
  CHECK_THROWS_AS(RuntimeLease{directory.path}, RuntimeOwnershipError);
  CHECK(std::filesystem::is_symlink(marker));
  CHECK(std::filesystem::file_size(directory.base / "other-link") == 10);
}
TEST_CASE("Runtime lease refuses FIFO markers without waiting for a writer") {
  Directory directory;
  const auto marker = directory.path / ".rdp-worker-owned";
  REQUIRE(std::filesystem::remove(marker));
  REQUIRE(::mkfifo(marker.c_str(), 0600) == 0);
  CHECK_THROWS_AS(RuntimeLease{directory.path}, RuntimeOwnershipError);
}
#endif
