#include "safe_root.hpp"
#include "quota.hpp"
#include "sandbox.hpp"
#include "service.hpp"
#include "recovery.hpp"
#include "drive.hpp"
#include "rdpdr_wire.hpp"
#include <algorithm>
#include <array>
#include <atomic>
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <future>
#include <limits>
#include <string>
#include <thread>
#include <vector>
#ifdef _WIN32
#include "../runtime/private_directory.hpp"
#include <crtdbg.h>
#include <cstdlib>
#include <winioctl.h>
#else
#include "linux_openat2.hpp"
#include "linux_rename.hpp"
#include <cerrno>
#include <fcntl.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#if __has_include(<linux/openat2.h>)
#include <linux/openat2.h>
static_assert(sizeof(bridge::files::linux_abi::OpenHow) == sizeof(open_how));
static_assert(bridge::files::linux_abi::no_xdev == RESOLVE_NO_XDEV);
static_assert(bridge::files::linux_abi::no_magiclinks == RESOLVE_NO_MAGICLINKS);
static_assert(bridge::files::linux_abi::no_symlinks == RESOLVE_NO_SYMLINKS);
static_assert(bridge::files::linux_abi::beneath == RESOLVE_BENEATH);
#endif
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <sys/vfs.h>
#include <unistd.h>
#endif
using namespace bridge::files;
namespace {
#ifdef _WIN32
struct NoninteractiveFailures {
  static int __cdecl report(int kind, char *message, int *) {
    if (kind == _CRT_ASSERT || kind == _CRT_ERROR) {
      std::fprintf(stderr, "Owned filesystem fixture CRT failure: kind=%d %.1024s\n", kind,
                     message ? message : "no message");
      std::fflush(stderr);
      std::_Exit(120); // A report is a failure, never an ignored assertion.
    }
    return FALSE;
  }
  NoninteractiveFailures() {
#ifdef _DEBUG
    if (_CrtSetReportHook2(_CRT_RPTHOOK_INSTALL, report) < 0)
      std::_Exit(121);
#endif
    (void)_set_error_mode(_OUT_TO_STDERR);
    (void)_set_abort_behavior(_WRITE_ABORT_MSG, _WRITE_ABORT_MSG | _CALL_REPORTFAULT);
#ifdef _DEBUG
    (void)_CrtSetReportMode(_CRT_ASSERT, _CRTDBG_MODE_FILE);
    (void)_CrtSetReportFile(_CRT_ASSERT, _CRTDBG_FILE_STDERR);
    (void)_CrtSetReportMode(_CRT_ERROR, _CRTDBG_MODE_FILE);
    (void)_CrtSetReportFile(_CRT_ERROR, _CRTDBG_FILE_STDERR);
#endif
    (void)SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
  }
} noninteractive_failures;
#endif
void create_private(const std::filesystem::path &path) {
#ifdef _WIN32
  REQUIRE(bridge::runtime::create_private_directory(path.native()) == ERROR_SUCCESS);
#else
  REQUIRE(mkdir(path.c_str(), 0700) == 0);
#endif
}
std::filesystem::path physical_base() {
  const auto current = std::filesystem::current_path();
#ifdef _WIN32
  // The build uses a subst drive for MSVC response-file compatibility. Resolve
  // this trusted test parent before creating fixtures; production SafeRoot must
  // keep rejecting reparses, including that DOS alias, in supplied root paths.
  const auto handle = CreateFileW(
      current.c_str(), FILE_READ_ATTRIBUTES, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
  REQUIRE(handle != INVALID_HANDLE_VALUE);
  std::vector<wchar_t> buffer(32768);
  const auto count =
      GetFinalPathNameByHandleW(handle, buffer.data(), static_cast<DWORD>(buffer.size()),
                                FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
  REQUIRE(CloseHandle(handle));
  REQUIRE(count > 4);
  REQUIRE(count < buffer.size());
  const std::wstring name(buffer.data(), count);
  REQUIRE(name.substr(0, 4) == L"\\\\?\\");
  return std::filesystem::path(name.substr(4));
#else
  return current;
#endif
}
struct Fixture {
  const std::filesystem::path base = physical_base();
  std::filesystem::path parent, root, outside;
  Fixture() {
    static std::atomic<unsigned> sequence{0};
    const auto stamp = std::chrono::steady_clock::now().time_since_epoch().count();
    parent = base / ("safe-files-" + std::to_string(stamp) + "-" + std::to_string(sequence++));
    REQUIRE(parent.parent_path() == base);
    create_private(parent);
    root = parent / "root";
    outside = parent / "outside";
    create_private(root);
    create_private(outside);
  }
  ~Fixture() {
    // Fixed owned entries; remove links themselves before any ordinary directory.
    // Never recurse or traverse a path that the link/race tests replace.
    std::size_t entry = 0;
    for (const auto &path :
         {root / "a" / "upload", root / "a" / "child" / "file", root / "a" / "child",
          root / "b" / "branch" / "child" / "file", root / "b" / "branch" / "child",
          root / "b" / "branch", root / "b" / "final", root / "a", root / "b",
          root / "first", root / "second", root / "final", root / u8"Каталог" / u8"Привет.txt",
          root / u8"Каталог", root / u8"日本語.txt",
          root / "link", parent / "alias", root / "hard", root / "special", root / "file",
          root / "new", root / u8"Привет 日本語 😀.txt", root / "nested" / "file", root / "nested",
          outside / "file", outside / "new", root, outside, parent}) {
      std::error_code error;
      (void)std::filesystem::remove(path, error);
#ifdef _WIN32
      // Windows can retain a delete-pending directory entry after its file
      // removal returned success. Retry only these exact owned directories;
      // never enumerate/delete unknown children or relax a production check.
      if (error.value() == ERROR_DIR_NOT_EMPTY) {
        std::printf("Owned fixture empty-directory cleanup retry\n");
        for (unsigned attempt = 0; attempt < 50 && error.value() == ERROR_DIR_NOT_EMPTY; ++attempt) {
          const auto attributes = GetFileAttributesW(path.c_str());
          if (attributes == INVALID_FILE_ATTRIBUTES || !(attributes & FILE_ATTRIBUTE_DIRECTORY) ||
              (attributes & FILE_ATTRIBUTE_REPARSE_POINT))
            break;
          std::this_thread::sleep_for(std::chrono::milliseconds(10));
          (void)std::filesystem::remove(path, error);
        }
      }
#endif
      if (error) {
        std::fprintf(stderr, "Owned filesystem fixture cleanup refused: entry=%zu code=%d\n",
                     entry, error.value());
        std::terminate();
      }
      ++entry;
    }
  }
};
void host_file(const std::filesystem::path &path, std::string_view text) {
  std::ofstream file(path, std::ios::binary);
  REQUIRE(file.good());
  file << text;
  file.close();
  REQUIRE(file.good());
}
std::string host_read(const std::filesystem::path &path) {
  std::ifstream file(path, std::ios::binary);
  REQUIRE(file.good());
  return {std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>()};
}
void directory_link(const std::filesystem::path &name, const std::filesystem::path &target) {
#ifdef _WIN32
  // NTFS directory junction, usable without Developer Mode/symlink privilege.
  // Fixed owned target and name; this is a negative-control fixture only.
  REQUIRE(CreateDirectoryW(name.c_str(), nullptr));
  HANDLE handle = CreateFileW(name.c_str(), GENERIC_WRITE, 0, nullptr, OPEN_EXISTING,
                              FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS, nullptr);
  REQUIRE(handle != INVALID_HANDLE_VALUE);
  const auto substitute = L"\\??\\" + target.native();
  const auto print = target.native();
  struct Reparse {
    DWORD tag;
    WORD length, reserved, substitute_offset, substitute_length, print_offset, print_length;
    std::array<wchar_t, 8192> names;
  };
  auto storage = std::make_unique<Reparse>();
  auto &data = *storage;
  REQUIRE(substitute.size() + print.size() + 2 <= data.names.size());
  const auto substitute_bytes = substitute.size() * sizeof(wchar_t);
  const auto print_bytes = print.size() * sizeof(wchar_t);
  data.tag = IO_REPARSE_TAG_MOUNT_POINT;
  data.length = static_cast<WORD>(8 + substitute_bytes + print_bytes + 2 * sizeof(wchar_t));
  data.substitute_length = static_cast<WORD>(substitute_bytes);
  data.print_offset = static_cast<WORD>(substitute_bytes + sizeof(wchar_t));
  data.print_length = static_cast<WORD>(print_bytes);
  std::copy(substitute.begin(), substitute.end(), data.names.begin());
  std::copy(print.begin(), print.end(),
            data.names.begin() + static_cast<std::ptrdiff_t>(substitute.size() + 1));
  DWORD returned = 0;
  const auto success =
      DeviceIoControl(handle, FSCTL_SET_REPARSE_POINT, &data, static_cast<DWORD>(data.length + 8U),
                      nullptr, 0, &returned, nullptr);
  const auto closed = CloseHandle(handle);
  REQUIRE(closed);
  REQUIRE(success);
#else
  REQUIRE(symlink(target.c_str(), name.c_str()) == 0);
#endif
}
StoreStatus clean_store(Sandbox &store) {
  auto status = store.cleanup();
  for (unsigned count = 0; count < 50 && status == StoreStatus::not_empty; ++count) {
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    status = store.cleanup();
  }
  return status;
}
struct OwnedStore {
  Sandbox value;
  static Sandbox make(Fixture &fixture, SandboxLimits limits) {
    auto [opened, root] = SafeRoot::open(fixture.root);
    REQUIRE(opened == Status::ok);
    auto [created, store] = Sandbox::create(std::move(root), limits);
    REQUIRE(created == StoreStatus::ok);
    return std::move(store);
  }
  explicit OwnedStore(Fixture &fixture, SandboxLimits limits = {}) : value(make(fixture, limits)) {}
  ~OwnedStore() {
    const auto result = clean_store(value);
    if (result != StoreStatus::ok)
      std::fprintf(stderr, "Owned sandbox fixture retained: code=%d\n", static_cast<int>(result));
  }
};
} // namespace

#if defined(_WIN32) && defined(_DEBUG)
TEST_CASE("Owned CRT assertion reporting exits without an interactive dialog", "[.crt-report-control]") {
  (void)_CrtDbgReport(_CRT_ASSERT, nullptr, 0, nullptr, "Owned negative-control assertion");
  FAIL("A CRT assertion must terminate this child with failure");
}
#endif

TEST_CASE("Managed file paths reject traversal, platform namespaces and malformed Unicode before "
          "OS access") {
  for (const std::string_view path : {"",
                                      "/file",
                                      "file/",
                                      "a//b",
                                      ".",
                                      "..",
                                      "a/../b",
                                      "a/./b",
                                      "C:/file",
                                      "C:file",
                                      "a\\b",
                                      "//server/share",
                                      "\\\\?\\C:\\file",
                                      "file:stream",
                                      "a*",
                                      "a?",
                                      "a|b",
                                      "file.",
                                      "file ",
                                      "CON",
                                      "con.txt",
                                      "NUL",
                                      "AUX.txt",
                                      "PRN",
                                      "COM1",
                                      "LPT9.txt",
                                      "COM0",
                                      "com\xc2\xb9.txt",
                                      "lpt\xc2\xb2",
                                      "CONIN$",
                                      "CONOUT$.txt",
                                      "CON .txt"})
    REQUIRE_FALSE(valid_relative_path(path));
  for (const auto &path :
       {std::string("x\0y", 3), std::string("x\x01y", 3), std::string("x\x7f", 2),
        std::string("\xc0\xaf", 2), std::string("\xed\xa0\x80", 3),
        std::string("\xf4\x90\x80\x80", 4), std::string("\xe2\x82", 2), std::string("\x80", 1)})
    REQUIRE_FALSE(valid_relative_path(path));
  for (const std::string_view path :
       {"file", "nested/file.txt", "a b/file.txt", "a..b", "CONSOLE.txt", "COM10.txt",
        "Привет/日本語 😀.txt", "%2e%2e.txt"})
    REQUIRE(valid_relative_path(path));
  REQUIRE(valid_relative_path(std::string(maximum_component_bytes, 'a')));
  REQUIRE_FALSE(valid_relative_path(std::string(maximum_component_bytes + 1, 'a')));
  std::string deep = "a";
  for (std::size_t i = 1; i < maximum_path_depth; ++i)
    deep += "/a";
  REQUIRE(valid_relative_path(deep));
  REQUIRE_FALSE(valid_relative_path(deep + "/a"));
  REQUIRE_FALSE(valid_relative_path(std::string(maximum_path_bytes + 1, 'a')));
}

TEST_CASE(
    "Managed file handles preserve exact offset IO, exclusive creation and read-only authority") {
  Fixture fixture;
  create_private(fixture.root / "nested");
  auto [status, root] = SafeRoot::open(fixture.root);
  REQUIRE(status == Status::ok);
  REQUIRE(root);
  auto created = root.open_file("nested/file", OpenMode::create_new);
  REQUIRE(created.status == Status::ok);
  const std::array<std::uint8_t, 7> data{0, 1, 2, 0xff, 0, 3, 4};
  REQUIRE(created.file.write(0, data).status == Status::ok);
  REQUIRE(created.file.size().bytes == data.size());
  std::array<std::uint8_t, 16> output{};
  const auto read = created.file.read(2, output);
  REQUIRE(read.status == Status::ok);
  REQUIRE(read.bytes == data.size() - 2);
  REQUIRE(std::equal(data.begin() + 2, data.end(), output.begin()));
  REQUIRE(created.file.read(100, output).bytes == 0);
  REQUIRE(created.file.resize(3) == Status::ok);
  REQUIRE(created.file.size().bytes == 3);
  REQUIRE(created.file.resize(7) == Status::ok);
  REQUIRE(created.file.read(0, output).bytes == 7);
  REQUIRE(output[2] == 2);
  REQUIRE(output[3] == 0);
  auto duplicate = root.open_file("nested/file", OpenMode::create_new);
  REQUIRE(duplicate.status == Status::exists);
  REQUIRE_FALSE(duplicate.file);
  auto reader = root.open_file("nested/file", OpenMode::read);
  REQUIRE(reader.status == Status::ok);
  REQUIRE(reader.file.write(0, data).status == Status::denied);
  REQUIRE(reader.file.resize(0) == Status::denied);
  REQUIRE(reader.file.size().bytes == 7);
  REQUIRE(root.open_file("missing", OpenMode::read).status == Status::missing);
  REQUIRE(root.open_file("nested", OpenMode::read).status != Status::ok);
  REQUIRE(root.open_file("../outside/file", OpenMode::create_new).status == Status::invalid);
  REQUIRE_FALSE(std::filesystem::exists(fixture.outside / "file"));
  auto unicode = root.open_file("Привет 日本語 😀.txt", OpenMode::create_new);
  REQUIRE(unicode.status == Status::ok);
  REQUIRE(unicode.file.write(0, data).bytes == data.size());
  REQUIRE(root.open_file("Привет 日本語 😀.txt", OpenMode::read).status == Status::ok);
}

TEST_CASE("Managed removal unlinks the namespace while an independent reader remains open") {
  Fixture fixture;
  auto [status, root] = SafeRoot::open(fixture.root);
  REQUIRE(status == Status::ok);
  REQUIRE(root.create_directory("nested") == Status::ok);
  const auto directory = root.inspect("nested", EntryKind::directory);
  REQUIRE(directory.status == Status::ok);
  const std::array<std::uint8_t, 4> data{0, 1, 0xff, 3};
  {
    auto created = root.open_file("nested/file", OpenMode::create_new);
    REQUIRE(created.status == Status::ok);
    REQUIRE(created.file.write(0, data).bytes == data.size());
  }
  // A trusted independent reader models an OS scanner, not an authorized
  // sandbox download: the owner must still refuse removal of its pinned views.
  const auto before = root.inspect("nested/file", EntryKind::file);
  REQUIRE(before.status == Status::ok);
#ifdef _WIN32
  // SafeRoot IO handles deliberately deny shared DELETE. Model only an
  // independent scanner which permits it; do not weaken those trusted pins.
  struct IndependentReader {
    HANDLE value;
    ~IndependentReader() {
      if (value != INVALID_HANDLE_VALUE && !CloseHandle(value)) std::terminate();
    }
  } reader{CreateFileW((fixture.root / "nested" / "file").c_str(), GENERIC_READ,
                         FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
                         OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr)};
  REQUIRE(reader.value != INVALID_HANDLE_VALUE);
#else
  auto reader = root.open_file("nested/file", OpenMode::read);
  REQUIRE(reader.status == Status::ok);
#endif
  REQUIRE(root.remove("nested/file", EntryKind::file, before.identity) == Status::ok);
  CHECK(root.inspect("nested/file", EntryKind::file).status == Status::missing);
  CHECK(root.remove("nested", EntryKind::directory, directory.identity) == Status::ok);
  std::array<std::uint8_t, 4> output{};
#ifdef _WIN32
  DWORD received = 0;
  REQUIRE(ReadFile(reader.value, output.data(), static_cast<DWORD>(output.size()), &received,
                     nullptr));
  REQUIRE(received == data.size());
#else
  const auto read = reader.file.read(0, output);
  REQUIRE(read.status == Status::ok);
  REQUIRE(read.bytes == data.size());
#endif
  REQUIRE(output == data);
}

TEST_CASE(
    "Managed file operations enforce finite IO and offset bounds before allocation or mutation") {
  Fixture fixture;
  auto [status, root] = SafeRoot::open(fixture.root);
  REQUIRE(status == Status::ok);
  auto created = root.open_file("file", OpenMode::create_new);
  REQUIRE(created.status == Status::ok);
  std::vector<std::uint8_t> bytes(maximum_io_bytes + 1, 0x35);
  REQUIRE(created.file.write(0, bytes).status == Status::invalid);
  REQUIRE(created.file.read(0, bytes).status == Status::invalid);
  REQUIRE(created.file.write(std::numeric_limits<std::uint64_t>::max(), {}).status ==
          Status::invalid);
  REQUIRE(created.file.read(std::numeric_limits<std::uint64_t>::max(), {}).status ==
          Status::invalid);
  REQUIRE(created.file.resize(std::numeric_limits<std::uint64_t>::max()) == Status::invalid);
  REQUIRE(created.file.size().bytes == 0);
  bytes.resize(maximum_io_bytes);
  const auto written = created.file.write(0, bytes);
  REQUIRE(written.status == Status::ok);
  REQUIRE(written.bytes == maximum_io_bytes);
  REQUIRE(created.file.read(0, bytes).bytes == maximum_io_bytes);
  REQUIRE(created.file.read(0, {}).status == Status::ok);
  REQUIRE(created.file.write(0, {}).status == Status::ok);
  auto moved = std::move(created.file);
  REQUIRE(moved);
  REQUIRE_FALSE(created.file);
  REQUIRE(created.file.size().status == Status::invalid);
  REQUIRE(created.file.resize(0) == Status::invalid);
  REQUIRE(created.file.read(0, bytes).status == Status::invalid);
}

TEST_CASE("Managed roots and descendants refuse links, hardlinks and special objects without "
          "following them") {
  Fixture fixture;
  host_file(fixture.outside / "file", "outside sentinel");
  directory_link(fixture.root / "link", fixture.outside);
  directory_link(fixture.parent / "alias", fixture.root);
  // The fixture is an effective escape for an ordinary host path open.
  REQUIRE(host_read(fixture.root / "link" / "file") == "outside sentinel");
  REQUIRE(SafeRoot::open(fixture.parent / "alias").first != Status::ok);
  auto [status, root] = SafeRoot::open(fixture.root);
  REQUIRE(status == Status::ok);
  for (const auto mode : {OpenMode::read, OpenMode::read_write, OpenMode::create_new}) {
    REQUIRE(root.open_file("link/file", mode).status != Status::ok);
    REQUIRE(root.open_file("link/new", mode).status != Status::ok);
  }
  REQUIRE_FALSE(std::filesystem::exists(fixture.outside / "new"));
  REQUIRE(host_read(fixture.outside / "file") == "outside sentinel");
  std::filesystem::create_hard_link(fixture.outside / "file", fixture.root / "hard");
  REQUIRE(root.open_file("hard", OpenMode::read).status == Status::denied);
  REQUIRE(root.open_file("hard", OpenMode::read_write).status == Status::denied);
#ifndef _WIN32
  REQUIRE(mkfifo((fixture.root / "special").c_str(), 0600) == 0);
  REQUIRE(root.open_file("special", OpenMode::read).status == Status::denied);
  REQUIRE(root.open_file("special", OpenMode::read_write).status == Status::denied);
  REQUIRE(chmod(fixture.root.c_str(), 0755) == 0);
  REQUIRE(SafeRoot::open(fixture.root).first == Status::denied);
  REQUIRE(chmod(fixture.root.c_str(), 0700) == 0);
#else
  REQUIRE(SafeRoot::open(fixture.base).first == Status::denied);
#endif
  REQUIRE(SafeRoot::open("relative").first == Status::invalid);
  REQUIRE(SafeRoot::open(fixture.root / ".." / "outside").first == Status::invalid);
}

TEST_CASE("Managed namespaces create and move directories and only remove empty directories") {
  Fixture fixture;
  auto [status, root] = SafeRoot::open(fixture.root);
  REQUIRE(status == Status::ok);
  REQUIRE(root.create_directory("a") == Status::ok);
  REQUIRE(root.create_directory("a") == Status::exists);
  REQUIRE(root.create_directory("b") == Status::ok);
  REQUIRE(root.create_directory("a/child") == Status::ok);
  REQUIRE(root.create_directory("missing/child") == Status::missing);
  {
    auto file = root.open_file("a/child/file", OpenMode::create_new);
    REQUIRE(file.status == Status::ok);
  }
  REQUIRE(root.remove("a", EntryKind::directory) == Status::not_empty);
  REQUIRE(root.remove("a/child", EntryKind::file) != Status::ok);
  REQUIRE(root.rename("a", "b/branch", EntryKind::directory) == Status::ok);
  REQUIRE(root.open_file("b/branch/child/file", OpenMode::read).status == Status::ok);
  REQUIRE(root.remove("b/branch", EntryKind::directory) == Status::not_empty);
  REQUIRE(root.remove("b/branch/child/file", EntryKind::file) == Status::ok);
  REQUIRE(root.remove("b/branch/child", EntryKind::directory) == Status::ok);
  REQUIRE(root.remove("b/branch", EntryKind::directory) == Status::ok);
  REQUIRE(root.remove("b", EntryKind::directory) == Status::ok);
  REQUIRE(root.remove("a", EntryKind::directory) == Status::missing);
}

TEST_CASE("Managed upload commit is atomic and replacement requires explicit file policy") {
  Fixture fixture;
  auto [status, root] = SafeRoot::open(fixture.root);
  REQUIRE(status == Status::ok);
  REQUIRE(root.create_directory("a") == Status::ok);
  REQUIRE(root.create_directory("b") == Status::ok);
  const std::array<std::uint8_t, 6> bytes{0, 1, 0xff, 2, 0, 3};
  {
    auto upload = root.open_file("a/upload", OpenMode::create_new);
    REQUIRE(upload.status == Status::ok);
    REQUIRE(upload.file.write(0, bytes).bytes == bytes.size());
  }
  REQUIRE(root.rename("a/upload", "b/final", EntryKind::file) == Status::ok);
  REQUIRE(root.open_file("a/upload", OpenMode::read).status == Status::missing);
  const auto contents = host_read(fixture.root / "b" / "final");
  REQUIRE(contents.size() == bytes.size());
  REQUIRE(std::equal(bytes.begin(), bytes.end(),
                     reinterpret_cast<const std::uint8_t *>(contents.data())));
  host_file(fixture.root / "a" / "upload", "replacement");
  REQUIRE(root.rename("a/upload", "b/final", EntryKind::file) == Status::exists);
  REQUIRE(host_read(fixture.root / "b" / "final") == contents);
  REQUIRE(host_read(fixture.root / "a" / "upload") == "replacement");
  REQUIRE(root.rename("a/upload", "b/final", EntryKind::file, RenameMode::replace_file) == Status::ok);
  REQUIRE(host_read(fixture.root / "b" / "final") == "replacement");
  REQUIRE(root.rename("b", "a", EntryKind::directory, RenameMode::replace_file) == Status::invalid);
  REQUIRE(root.remove("b/final", EntryKind::directory) != Status::ok);
  REQUIRE(root.remove("b/final", EntryKind::file) == Status::ok);
  REQUIRE(root.remove("b/final", EntryKind::file) == Status::missing);
  REQUIRE(root.create_directory("Каталог") == Status::ok);
  {
    auto file = root.open_file("Каталог/Привет.txt", OpenMode::create_new);
    REQUIRE(file.status == Status::ok);
  }
  REQUIRE(root.rename("Каталог/Привет.txt", "日本語.txt", EntryKind::file) == Status::ok);
  REQUIRE(root.remove("日本語.txt", EntryKind::file) == Status::ok);
  REQUIRE(root.remove("Каталог", EntryKind::directory) == Status::ok);
}

TEST_CASE("Independent managed roots cannot overwrite each other's exclusive rename commit") {
  for (unsigned round = 0; round < 64; ++round) {
    Fixture fixture;
    host_file(fixture.root / "first", "first content");
    host_file(fixture.root / "second", "second content");
    auto [status, root] = SafeRoot::open(fixture.root);
    auto [other_status, other] = SafeRoot::open(fixture.root);
    REQUIRE(status == Status::ok);
    REQUIRE(other_status == Status::ok);
    std::promise<void> ready;
    auto start = ready.get_future().share();
    auto first = std::async(std::launch::async, [&] {
      start.wait();
      return root.rename("first", "final", EntryKind::file);
    });
    auto second = std::async(std::launch::async, [&] {
      start.wait();
      return other.rename("second", "final", EntryKind::file);
    });
    ready.set_value();
    const auto a = first.get(), b = second.get();
    const auto first_status = static_cast<int>(a), second_status = static_cast<int>(b);
    CAPTURE(round, first_status, second_status);
    if (!((a == Status::ok && b == Status::exists) || (a == Status::exists && b == Status::ok)))
      std::fprintf(stderr, "Owned exclusive rename race: first=%d second=%d\n", first_status,
                     second_status);
    REQUIRE(((a == Status::ok && b == Status::exists) || (a == Status::exists && b == Status::ok)));
    REQUIRE(host_read(fixture.root / "final") == (a == Status::ok ? "first content" : "second content"));
    REQUIRE(host_read(fixture.root / (a == Status::ok ? "second" : "first")) ==
            (a == Status::ok ? "second content" : "first content"));
  }
}

TEST_CASE("Managed namespace validation refuses traversal links hardlinks and special entries") {
  Fixture fixture;
  host_file(fixture.outside / "file", "outside sentinel");
  host_file(fixture.root / "file", "owned sentinel");
  directory_link(fixture.root / "link", fixture.outside);
  std::filesystem::create_hard_link(fixture.outside / "file", fixture.root / "hard");
  auto [status, root] = SafeRoot::open(fixture.root);
  REQUIRE(status == Status::ok);
  for (const std::string_view path : {"../outside/new", "/new", "a/../new", "new:stream", "a//b"}) {
    REQUIRE(root.create_directory(path) == Status::invalid);
    REQUIRE(root.remove(path, EntryKind::file) == Status::invalid);
    REQUIRE(root.rename("file", path, EntryKind::file) == Status::invalid);
    REQUIRE(root.rename(path, "new", EntryKind::file) == Status::invalid);
  }
  REQUIRE(root.create_directory("link/new") != Status::ok);
  REQUIRE(root.remove("link/file", EntryKind::file) != Status::ok);
  REQUIRE(root.remove("link", EntryKind::directory) != Status::ok);
  REQUIRE(root.remove("hard", EntryKind::file) == Status::denied);
  REQUIRE(root.rename("link/file", "new", EntryKind::file) != Status::ok);
  REQUIRE(root.rename("file", "link/new", EntryKind::file) != Status::ok);
  REQUIRE(root.rename("hard", "new", EntryKind::file) == Status::denied);
  REQUIRE(root.rename("file", "hard", EntryKind::file, RenameMode::replace_file) == Status::denied);
  REQUIRE(root.rename("file", "link", EntryKind::file, RenameMode::replace_file) != Status::ok);
  REQUIRE(root.rename("file", "file", EntryKind::file) == Status::invalid);
  REQUIRE(root.remove("file", static_cast<EntryKind>(99)) == Status::invalid);
  REQUIRE(root.rename("file", "new", EntryKind::file, static_cast<RenameMode>(99)) == Status::invalid);
#ifndef _WIN32
  REQUIRE(mkfifo((fixture.root / "special").c_str(), 0600) == 0);
  REQUIRE(root.remove("special", EntryKind::file) == Status::denied);
  REQUIRE(root.rename("special", "new", EntryKind::file) == Status::denied);
  REQUIRE(root.rename("file", "special", EntryKind::file, RenameMode::replace_file) == Status::denied);
#endif
  REQUIRE(host_read(fixture.outside / "file") == "outside sentinel");
  REQUIRE(host_read(fixture.root / "file") == "owned sentinel");
  REQUIRE_FALSE(std::filesystem::exists(fixture.outside / "new"));
  SafeRoot empty;
  REQUIRE(empty.create_directory("new") == Status::invalid);
  REQUIRE(empty.remove("file", EntryKind::file) == Status::invalid);
  REQUIRE(empty.rename("file", "new", EntryKind::file) == Status::invalid);
}

TEST_CASE("Managed read-only roots deny every mutating entrypoint before filesystem lookup") {
  Fixture fixture;
  create_private(fixture.root / "a");
  host_file(fixture.root / "file", "owned sentinel");
  host_file(fixture.root / "final", "target sentinel");
  auto [status, root] = SafeRoot::open(fixture.root, RootAccess::read_only);
  REQUIRE(status == Status::ok);
  {
    auto file = root.open_file("file", OpenMode::read);
    REQUIRE(file.status == Status::ok);
    std::array<std::uint8_t, 64> bytes{};
    REQUIRE(file.file.read(0, bytes).bytes == std::string_view("owned sentinel").size());
    REQUIRE(file.file.write(0, bytes).status == Status::denied);
    REQUIRE(file.file.resize(0) == Status::denied);
  }
  for (const auto mode : {OpenMode::read_write, OpenMode::create_new})
    for (const std::string_view name : {"file", "missing"}) {
      auto file = root.open_file(name, mode);
      REQUIRE(file.status == Status::denied);
      REQUIRE_FALSE(file.file);
    }
  REQUIRE(root.create_directory("new") == Status::denied);
  for (const auto kind : {EntryKind::file, EntryKind::directory}) {
    REQUIRE(root.remove(kind == EntryKind::file ? "file" : "a", kind) == Status::denied);
    REQUIRE(root.remove("missing", kind) == Status::denied);
    REQUIRE(root.rename(kind == EntryKind::file ? "file" : "a", "new", kind) == Status::denied);
  }
  REQUIRE(root.rename("file", "final", EntryKind::file, RenameMode::replace_file) == Status::denied);
  REQUIRE(root.open_file("missing", OpenMode::read).status == Status::missing);
  auto moved = std::move(root);
  REQUIRE_FALSE(root);
  REQUIRE(moved.create_directory("new") == Status::denied);
  REQUIRE(moved.open_file("file", OpenMode::read_write).status == Status::denied);
  REQUIRE(host_read(fixture.root / "file") == "owned sentinel");
  REQUIRE(host_read(fixture.root / "final") == "target sentinel");
  REQUIRE(std::filesystem::is_directory(fixture.root / "a"));
  REQUIRE_FALSE(std::filesystem::exists(fixture.root / "new"));
  REQUIRE_FALSE(std::filesystem::exists(fixture.root / "missing"));
  REQUIRE(SafeRoot::open(fixture.root, static_cast<RootAccess>(99)).first == Status::invalid);
}

TEST_CASE("Actual managed file IO admits shared quota before sparse growth and refunds verified shrink") {
  Fixture fixture;
  auto [root_status, root] = SafeRoot::open(fixture.root);
  auto [quota_status, quota] = FileQuota::create({6, 6, 1});
  REQUIRE(root_status == Status::ok);
  REQUIRE(quota_status == QuotaStatus::ok);
  auto entry = quota.acquire();
  REQUIRE(entry.status == QuotaStatus::ok);
  auto opened = root.open_file("file", OpenMode::create_new);
  REQUIRE(opened.status == Status::ok);
  const std::array<std::uint8_t, 4> bytes{1, 2, 0, 0xff};
  auto initial = entry.allocation.reserve_size(bytes.size());
  REQUIRE(initial.status == QuotaStatus::ok);
  REQUIRE(opened.file.write(0, bytes).bytes == bytes.size());
  REQUIRE(initial.reservation.finish(opened.file.size().bytes) == QuotaStatus::ok);
  REQUIRE(quota.snapshot().bytes == 4);
  REQUIRE(entry.allocation.reserve_size(7).status == QuotaStatus::limit);
  REQUIRE(quota.acquire().status == QuotaStatus::limit);
  REQUIRE(opened.file.size().bytes == 4);
  REQUIRE_FALSE(std::filesystem::exists(fixture.root / "new"));
  auto shrink = entry.allocation.reserve_size(2);
  REQUIRE(shrink.status == QuotaStatus::ok);
  REQUIRE(quota.snapshot().bytes == 4);
  REQUIRE(opened.file.resize(2) == Status::ok);
  REQUIRE(shrink.reservation.finish(opened.file.size().bytes) == QuotaStatus::ok);
  REQUIRE(quota.snapshot().bytes == 2);
  auto sparse = entry.allocation.reserve_size(6);
  REQUIRE(sparse.status == QuotaStatus::ok);
  REQUIRE(opened.file.write(5, ::bridge::compat::span(bytes).first(1)).bytes == 1);
  REQUIRE(sparse.reservation.finish(opened.file.size().bytes) == QuotaStatus::ok);
  REQUIRE(quota.snapshot().bytes == 6);
  std::array<std::uint8_t, 6> actual{};
  REQUIRE(opened.file.read(0, actual).bytes == actual.size());
  REQUIRE((actual == std::array<std::uint8_t, 6>{1, 2, 0, 0, 0, 1}));
  opened.file = File{};
  REQUIRE(root.remove("file", EntryKind::file) == Status::ok);
  REQUIRE(entry.allocation.release() == QuotaStatus::ok);
  REQUIRE(quota.snapshot().bytes == 0);
  REQUIRE(quota.snapshot().entries == 0);
}

TEST_CASE("Managed metadata identifies held inodes and root emptiness without following children") {
  Fixture fixture;
  auto [status, root] = SafeRoot::open(fixture.root);
  REQUIRE(status == Status::ok);
  REQUIRE(root.empty().status == Status::ok);
  REQUIRE(root.empty().empty);
  auto created = root.open_file("file", OpenMode::create_new);
  REQUIRE(created.status == Status::ok);
  const auto identity = created.file.metadata();
  REQUIRE(identity.status == Status::ok);
  REQUIRE(identity.bytes == 0);
  REQUIRE(root.inspect("file", EntryKind::file).identity == identity.identity);
  REQUIRE_FALSE(root.empty().empty);
  REQUIRE(root.inspect("file", EntryKind::directory).status != Status::ok);
  REQUIRE(root.inspect("missing", EntryKind::file).status == Status::missing);
  REQUIRE(root.inspect("../outside", EntryKind::directory).status == Status::invalid);
  std::filesystem::create_hard_link(fixture.root / "file", fixture.root / "hard");
  REQUIRE(created.file.metadata().status == Status::denied);
  REQUIRE(root.inspect("file", EntryKind::file).status == Status::denied);
  REQUIRE(std::filesystem::remove(fixture.root / "hard"));
  created.file = File{};
  REQUIRE(root.rename("file", "new", EntryKind::file) == Status::ok);
  REQUIRE(root.inspect("new", EntryKind::file).identity == identity.identity);
  REQUIRE(root.remove("new", EntryKind::file) == Status::ok);
  REQUIRE(root.empty().empty);
  directory_link(fixture.root / "link", fixture.outside);
  REQUIRE_FALSE(root.empty().empty);
  REQUIRE(root.inspect("link", EntryKind::directory).status != Status::ok);
  REQUIRE(root.inspect("link/file", EntryKind::file).status != Status::ok);
  SafeRoot absent;
  REQUIRE(absent.empty().status == Status::invalid);
  REQUIRE(absent.inspect("file", EntryKind::file).status == Status::invalid);
}

TEST_CASE("Owned lifecycle inventory is complete sorted bounded and preserves private child policy") {
  Fixture fixture;auto opened = SafeRoot::open(fixture.root);REQUIRE(opened.first == Status::ok);auto &root = opened.second;
  REQUIRE(root.inventory(0, 0).status == Status::ok);REQUIRE(root.identity().status == Status::ok);
  REQUIRE(root.create_directory("a") == Status::ok);REQUIRE(root.create_directory("a/child") == Status::ok);
  for (const auto name : {"a/child/file", "first"}) {
    auto file = root.open_file(name, OpenMode::create_new);REQUIRE(file.status == Status::ok);
    REQUIRE(file.file.write(0, std::array<std::uint8_t, 3>{1, 2, 3}).status == Status::ok);
  }
  const auto before = root.inventory();REQUIRE(before.status == Status::ok);REQUIRE(before.entries.size() == 4);
  const std::array<std::string_view, 4> names{"a", "a/child", "a/child/file", "first"};std::size_t bytes = 0;
  for (std::size_t i = 0; i < names.size(); ++i) {
    const auto &entry = before.entries[i];REQUIRE(entry.path == names[i]);bytes += entry.path.size();
    REQUIRE(entry.metadata.status == Status::ok);REQUIRE(entry.metadata.identity == root.inspect(entry.path, entry.kind).identity);
    REQUIRE(entry.metadata.bytes == (entry.kind == EntryKind::file ? 3 : 0));
    REQUIRE(entry.metadata.identity.volume == root.identity().identity.volume);
  }
  REQUIRE(root.inventory(4, bytes).status == Status::ok);
  for (const auto &limits : {std::pair{3U, bytes}, std::pair{4U, bytes - 1}, std::pair{0U, bytes}}) {
    const auto refused = root.inventory(limits.first, limits.second);
    REQUIRE(refused.status == Status::unavailable);REQUIRE(refused.entries.empty());
  }
  REQUIRE(root.inventory(maximum_inventory_entries + 1).status == Status::invalid);
  REQUIRE(root.inventory(4, maximum_inventory_paths + 1).status == Status::invalid);
  auto readonly = SafeRoot::open(fixture.root, RootAccess::read_only);REQUIRE(readonly.first == Status::ok);
  auto child = readonly.second.open_directory("a");REQUIRE(child.first == Status::ok);
  REQUIRE(child.second.identity().identity == before.entries.front().metadata.identity);
  REQUIRE(child.second.inventory().entries.size() == 2);
  REQUIRE(child.second.open_file("new", OpenMode::create_new).status == Status::denied);
  REQUIRE(child.second.remove("child/file", EntryKind::file) == Status::denied);
  REQUIRE(child.second.create_directory("new") == Status::denied);
  REQUIRE(root.open_directory("../outside").first == Status::invalid);
  REQUIRE(root.open_directory("first").first != Status::ok);
  REQUIRE(root.inventory().entries.size() == before.entries.size());
}
TEST_CASE("Owned lifecycle inventory refuses links and shared files without returning a partial plan") {
  Fixture fixture;auto root = SafeRoot::open(fixture.root);REQUIRE(root.first == Status::ok);
  auto outside = SafeRoot::open(fixture.outside);REQUIRE(outside.first == Status::ok);
  { auto file = outside.second.open_file("file", OpenMode::create_new);REQUIRE(file.status == Status::ok); }
  directory_link(fixture.root / "link", fixture.outside);
  REQUIRE(root.second.inventory().status == Status::denied);REQUIRE(root.second.inventory().entries.empty());
  REQUIRE(root.second.open_directory("link").first != Status::ok);REQUIRE(std::filesystem::exists(fixture.outside / "file"));
  REQUIRE(std::filesystem::remove(fixture.root / "link"));
  std::filesystem::create_hard_link(fixture.outside / "file", fixture.root / "hard");
  REQUIRE(root.second.inventory().status == Status::denied);REQUIRE(root.second.inventory().entries.empty());
  REQUIRE(std::filesystem::hard_link_count(fixture.outside / "file") == 2);
#ifndef _WIN32
  REQUIRE(std::filesystem::remove(fixture.root / "hard"));REQUIRE(mkfifo((fixture.root / "special").c_str(), 0600) == 0);
  REQUIRE(root.second.inventory().status == Status::denied);REQUIRE(root.second.inventory().entries.empty());
  REQUIRE(std::filesystem::remove(fixture.root / "special"));
  { auto file = root.second.open_file("file", OpenMode::create_new);REQUIRE(file.status == Status::ok); }
  REQUIRE(chmod((fixture.root / "file").c_str(), 0200) == 0);REQUIRE(root.second.inventory().status == Status::ok);
  REQUIRE(chmod((fixture.root / "file").c_str(), 0640) == 0);
  REQUIRE(root.second.inventory().status == Status::denied);REQUIRE(root.second.inventory().entries.empty());
#endif
}
TEST_CASE("Lifecycle handle duplication preserves the original protected directory lease") {
  Fixture fixture;
  REQUIRE(SafeRoot::duplicate_private(std::numeric_limits<std::uintptr_t>::max()).first == Status::invalid);
#ifdef _WIN32
  struct Native { HANDLE value;~Native() { if (!CloseHandle(value)) std::terminate(); } } native{
      CreateFileW(fixture.root.c_str(), FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | READ_CONTROL | DELETE,
                  FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING,
                  FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr)};
  REQUIRE(native.value != INVALID_HANDLE_VALUE);
  REQUIRE(SafeRoot::open(fixture.root).first == Status::busy);
  auto root = SafeRoot::duplicate_private(reinterpret_cast<std::uintptr_t>(native.value));
#else
  struct Native { int value;~Native() { if (::close(value) != 0) std::terminate(); } } native{
      ::open(fixture.root.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)};
  REQUIRE(native.value >= 0);
  auto root = SafeRoot::duplicate_private(static_cast<std::uintptr_t>(native.value));
#endif
  REQUIRE(root.first == Status::ok);REQUIRE(root.second.identity().status == Status::ok);
  REQUIRE(root.second.create_directory("a") == Status::ok);
  REQUIRE(root.second.inventory().entries.size() == 1);
}
TEST_CASE("Lifecycle inventory preserves Unicode and refuses an unprotected existing file") {
  Fixture fixture;auto root = SafeRoot::open(fixture.root);REQUIRE(root.first == Status::ok);
  constexpr std::string_view name = "\xe6\x97\xa5\xe6\x9c\xac\xe8\xaa\x9e.txt";
  { auto file = root.second.open_file(name, OpenMode::create_new);REQUIRE(file.status == Status::ok); }
  const auto snapshot = root.second.inventory();REQUIRE(snapshot.status == Status::ok);REQUIRE(snapshot.entries.size() == 1);
  REQUIRE(snapshot.entries[0].path == name);REQUIRE(root.second.inspect(name, EntryKind::file, true).status == Status::ok);
  { std::ofstream stream(fixture.root / "file");stream << "owned counterexample"; }
#ifndef _WIN32
  REQUIRE(::chmod((fixture.root / "file").c_str(), 0640) == 0);
#endif
  REQUIRE(root.second.inspect("file", EntryKind::file).status == Status::ok);
  REQUIRE(root.second.inspect("file", EntryKind::file, true).status == Status::denied);
  REQUIRE(root.second.inventory().status == Status::denied);REQUIRE(root.second.inventory().entries.empty());
}
TEST_CASE("Verified native removal refuses another identity and keeps read-only policy") {
  Fixture fixture;auto root = SafeRoot::open(fixture.root);REQUIRE(root.first == Status::ok);
  { auto file = root.second.open_file("file", OpenMode::create_new);REQUIRE(file.status == Status::ok); }
  const auto entry = root.second.inspect("file", EntryKind::file);REQUIRE(entry.status == Status::ok);
  auto foreign = entry.identity;foreign.file[0] ^= 1U;
  REQUIRE(root.second.remove("file", EntryKind::file, foreign) == Status::denied);
  REQUIRE(root.second.inspect("file", EntryKind::file).identity == entry.identity);
  auto readonly = SafeRoot::open(fixture.root, RootAccess::read_only);REQUIRE(readonly.first == Status::ok);
  REQUIRE(readonly.second.remove("file", EntryKind::file, entry.identity) == Status::denied);
  REQUIRE(root.second.remove("file", EntryKind::file, entry.identity) == Status::ok);REQUIRE(root.second.empty().empty);
}
namespace {
struct ManagedRecoveryFixture : Fixture {
  ~ManagedRecoveryFixture() {
    const auto managed = root / "managed-files";
    for (const auto &path : {managed / ".data/a/file", managed / ".data/new", managed / ".data/link",
        managed / ".data/a", managed / ".data", managed / ".uploads/0000000000000001",
        managed / ".uploads", managed / "unknown", managed, root / ".managed-files-owned"}) {
      std::error_code ignored;std::filesystem::remove(path, ignored);
    }
  }
};
void managed_payload(const SafeRoot &runtime, bool content = true) {
  REQUIRE(runtime.create_directory(managed_files_component) == Status::ok);
  const auto container = runtime.inspect(managed_files_component, EntryKind::directory);REQUIRE(container.status == Status::ok);
  REQUIRE(create_managed_files_claim(runtime, container.identity).status == Status::ok);
  if (!content) return;
  auto opened = runtime.open_directory(managed_files_component);REQUIRE(opened.first == Status::ok);
  auto &root = opened.second;
  for (const auto name : {".data", ".uploads", ".data/a"}) REQUIRE(root.create_directory(name) == Status::ok);
  for (const auto name : {".data/a/file", ".uploads/0000000000000001"}) {
    auto file = root.open_file(name, OpenMode::create_new);REQUIRE(file.status == Status::ok);
    REQUIRE(file.file.write(0, std::array<std::uint8_t, 3>{1, 2, 3}).bytes == 3);
  }
}
std::pair<Status, ManagedFilesRecovery> managed_plan(const std::filesystem::path &runtime) {
  auto root = SafeRoot::open(runtime);REQUIRE(root.first == Status::ok);
  return ManagedFilesRecovery::prepare(std::move(root.second));
}
void replace_claim(const SafeRoot &runtime, ::bridge::compat::span<const std::uint8_t> bytes) {
  auto claim = runtime.open_file(managed_files_claim, OpenMode::read_write);REQUIRE(claim.status == Status::ok);
  REQUIRE(claim.file.resize(0) == Status::ok);REQUIRE(claim.file.write(0, bytes).bytes == bytes.size());
}
std::vector<std::uint8_t> claim_bytes(const SafeRoot &runtime) {
  auto claim = runtime.open_file(managed_files_claim, OpenMode::read);REQUIRE(claim.status == Status::ok);
  std::vector<std::uint8_t> bytes(56);REQUIRE(claim.file.read(0, bytes).bytes == bytes.size());return bytes;
}
}
TEST_CASE("Managed orphan plan reclaims only claimed private data and staged uploads") {
  ManagedRecoveryFixture fixture;auto runtime = SafeRoot::open(fixture.root);REQUIRE(runtime.first == Status::ok);
  managed_payload(runtime.second);
  auto plan = managed_plan(fixture.root);REQUIRE(plan.first == Status::ok);
  REQUIRE(plan.second.apply() == Status::ok);REQUIRE(plan.second.apply() == Status::invalid);
  REQUIRE(runtime.second.empty().empty);
}
TEST_CASE("Managed orphan plan refuses missing foreign and malformed ownership before deleting data") {
  ManagedRecoveryFixture fixture, other;auto runtime = SafeRoot::open(fixture.root);REQUIRE(runtime.first == Status::ok);
  auto another = SafeRoot::open(other.root);REQUIRE(another.first == Status::ok);
  managed_payload(runtime.second);managed_payload(another.second);
  const auto original = claim_bytes(runtime.second);
#ifndef _WIN32
  REQUIRE(::chmod((fixture.root / ".managed-files-owned").c_str(), 0640) == 0);
  REQUIRE(managed_plan(fixture.root).first == Status::denied);
  REQUIRE(::chmod((fixture.root / ".managed-files-owned").c_str(), 0600) == 0);
#endif
  replace_claim(runtime.second, claim_bytes(another.second));
  REQUIRE(managed_plan(fixture.root).first == Status::denied);
  for (const auto length : {0U, 1U, 8U, 31U, 55U}) {
    replace_claim(runtime.second, ::bridge::compat::span<const std::uint8_t>(original).first(length));
    REQUIRE(managed_plan(fixture.root).first == Status::denied);
    REQUIRE(std::filesystem::file_size(fixture.root / "managed-files/.data/a/file") == 3);
  }
  replace_claim(runtime.second, original);
  REQUIRE(runtime.second.remove(managed_files_claim, EntryKind::file) == Status::ok);
  REQUIRE(managed_plan(fixture.root).first == Status::denied);
  const auto container = runtime.second.inspect(managed_files_component, EntryKind::directory);
  REQUIRE(create_managed_files_claim(runtime.second, container.identity).status == Status::ok);
  auto plan = managed_plan(fixture.root);REQUIRE(plan.first == Status::ok);REQUIRE(plan.second.apply() == Status::ok);
  auto second = managed_plan(other.root);REQUIRE(second.first == Status::ok);REQUIRE(second.second.apply() == Status::ok);
}
TEST_CASE("Managed orphan plan revalidates the complete tree and claim before its first deletion") {
  ManagedRecoveryFixture fixture;auto runtime = SafeRoot::open(fixture.root);REQUIRE(runtime.first == Status::ok);
  managed_payload(runtime.second);
  auto plan = managed_plan(fixture.root);REQUIRE(plan.first == Status::ok);
  {
    auto child = runtime.second.open_directory(managed_files_component);REQUIRE(child.first == Status::ok);
    { auto file = child.second.open_file(".data/new", OpenMode::create_new);REQUIRE(file.status == Status::ok); }
    REQUIRE(plan.second.apply() == Status::denied);
    REQUIRE(std::filesystem::file_size(fixture.root / "managed-files/.data/a/file") == 3);
    REQUIRE(child.second.remove(".data/new", EntryKind::file) == Status::ok);
  }
  const auto original = claim_bytes(runtime.second);auto malformed = original;malformed[0] ^= 1U;
  replace_claim(runtime.second, malformed);REQUIRE(plan.second.apply() == Status::denied);
  replace_claim(runtime.second, original);REQUIRE(plan.second.apply() == Status::ok);
  REQUIRE(runtime.second.empty().empty);
}
TEST_CASE("Managed orphan startup and interrupted-finalization metadata recover without claiming unknown contents") {
  for (const unsigned length : {0U, 1U, 8U, 31U, 55U, 56U, 57U}) {
    ManagedRecoveryFixture fixture;auto runtime = SafeRoot::open(fixture.root);REQUIRE(runtime.first == Status::ok);
    managed_payload(runtime.second, false);auto bytes = claim_bytes(runtime.second);
    if (length == 57) REQUIRE(runtime.second.remove(managed_files_claim, EntryKind::file) == Status::ok);
    else replace_claim(runtime.second, ::bridge::compat::span<const std::uint8_t>(bytes).first(length));
    auto plan = managed_plan(fixture.root);REQUIRE(plan.first == Status::ok);REQUIRE(plan.second.apply() == Status::ok);
    REQUIRE(runtime.second.empty().empty);
  }
  ManagedRecoveryFixture fixture;auto runtime = SafeRoot::open(fixture.root);REQUIRE(runtime.first == Status::ok);
  managed_payload(runtime.second, false);
  REQUIRE(runtime.second.remove(managed_files_component, EntryKind::directory) == Status::ok);
  auto plan = managed_plan(fixture.root);REQUIRE(plan.first == Status::ok);REQUIRE(plan.second.apply() == Status::ok);
  REQUIRE(runtime.second.empty().empty);
}
TEST_CASE("Managed orphan plan preserves unknown containers and linked entries") {
  for (const bool link : {false, true}) {
    ManagedRecoveryFixture fixture;auto runtime = SafeRoot::open(fixture.root);REQUIRE(runtime.first == Status::ok);
    managed_payload(runtime.second);
    if (link) directory_link(fixture.root / "managed-files/.data/link", fixture.outside);
    else {
      auto child = runtime.second.open_directory(managed_files_component);REQUIRE(child.first == Status::ok);
      auto unknown = child.second.open_file("unknown", OpenMode::create_new);REQUIRE(unknown.status == Status::ok);
    }
    REQUIRE(managed_plan(fixture.root).first == Status::denied);
    REQUIRE(std::filesystem::file_size(fixture.root / "managed-files/.data/a/file") == 3);
    REQUIRE(std::filesystem::remove(fixture.root / (link ? "managed-files/.data/link" : "managed-files/unknown")));
    auto plan = managed_plan(fixture.root);REQUIRE(plan.first == Status::ok);REQUIRE(plan.second.apply() == Status::ok);
  }
}
TEST_CASE("Owned sandbox joins Unicode CRUD views identities quota and directory moves") {
  Fixture fixture;
  OwnedStore owned(fixture, {{12, 8, 4}, 4096});
  auto &store = owned.value;
  auto dir = store.create_entry(0, "Каталог", EntryKind::directory);
  REQUIRE(dir.status == StoreStatus::ok);
  auto file = store.create_entry(dir.info.id, "日本語 😀.txt", EntryKind::file);
  REQUIRE(file.status == StoreStatus::ok);
  REQUIRE(file.info.id != dir.info.id);
  REQUIRE(file.info.parent == dir.info.id);
  REQUIRE(file.info.name == "日本語 😀.txt");
  auto writer = store.open(file.info.id, RootAccess::read_write);
  REQUIRE(writer.status == StoreStatus::ok);
  const std::array<std::uint8_t, 4> bytes{0, 1, 0xff, 2};
  REQUIRE(writer.view.write(0, bytes).bytes == bytes.size());
  REQUIRE(store.usage().bytes == bytes.size());
  REQUIRE(store.usage().entries == 2);
  REQUIRE(store.remove(file.info.id) == StoreStatus::busy);
  REQUIRE(store.rename(file.info.id, 0, "new") == StoreStatus::busy);
  REQUIRE(store.rename(dir.info.id, 0, "moved") == StoreStatus::busy);
  writer.view.close();
  REQUIRE(store.rename(dir.info.id, 0, "moved") == StoreStatus::ok);
  REQUIRE(store.info(file.info.id).info.parent == dir.info.id);
  REQUIRE(store.find_child(dir.info.id, "日本語 😀.txt").info.id == file.info.id);
  auto reader = store.open(file.info.id, RootAccess::read_only);
  REQUIRE(reader.status == StoreStatus::ok);
  std::array<std::uint8_t, 8> output{};
  REQUIRE(reader.view.read(0, output).bytes == bytes.size());
  REQUIRE(std::equal(bytes.begin(), bytes.end(), output.begin()));
  REQUIRE(reader.view.write(0, bytes).status == StoreStatus::denied);
  REQUIRE(reader.view.resize(0) == StoreStatus::denied);
  reader.view.close();
  REQUIRE(store.remove(file.info.id) == StoreStatus::ok);
  REQUIRE(store.remove(dir.info.id) == StoreStatus::ok);
  REQUIRE(store.usage().bytes == 0);
  REQUIRE(store.usage().entries == 0);
  REQUIRE(clean_store(store) == StoreStatus::ok);
  REQUIRE(store.usage().retired);
  REQUIRE(store.create_entry(0, "new", EntryKind::file).status == StoreStatus::retired);
}

TEST_CASE("Owned upload stays hidden until closed atomic publish and replacement is explicit") {
  Fixture fixture;
  OwnedStore owned(fixture, {{8, 8, 4}, 4096});
  auto &store = owned.value;
  const std::array<std::uint8_t, 4> original{1, 2, 3, 4}, next{5, 0, 6, 7};
  auto first = store.create_entry(0, "file", EntryKind::file);
  REQUIRE(first.status == StoreStatus::ok);
  auto writer = store.open(first.info.id, RootAccess::read_write);
  REQUIRE(writer.status == StoreStatus::ok);
  REQUIRE(writer.view.write(0, original).status == StoreStatus::ok);
  writer.view.close();
  auto upload = store.begin_upload(0, "file");
  REQUIRE(upload.status == StoreStatus::ok);
  REQUIRE(store.info(upload.info.id).status == StoreStatus::missing);
  REQUIRE(store.open(upload.info.id, RootAccess::read_only).status == StoreStatus::missing);
  REQUIRE(store.list(0).entries.size() == 1);
  auto pending = store.open_upload(upload.info.id);
  REQUIRE(pending.status == StoreStatus::ok);
  REQUIRE(pending.view.write(0, next).status == StoreStatus::ok);
  REQUIRE(pending.view.write(4, next).status == StoreStatus::limit);
  REQUIRE(store.usage().bytes == 8);
  REQUIRE(store.publish_upload(upload.info.id).status == StoreStatus::busy);
  pending.view.close();
  REQUIRE(store.publish_upload(upload.info.id).status == StoreStatus::exists);
  REQUIRE(store.usage().bytes == 8);
  auto held = store.open(first.info.id, RootAccess::read_only);
  REQUIRE(held.status == StoreStatus::ok);
  REQUIRE(store.publish_upload(upload.info.id, true).status == StoreStatus::busy);
  REQUIRE(store.usage().bytes == 8);
  held.view.close();
  REQUIRE(store.publish_upload(upload.info.id, true).status == StoreStatus::ok);
  REQUIRE(store.info(first.info.id).status == StoreStatus::missing);
  REQUIRE(store.info(upload.info.id).info.bytes == next.size());
  REQUIRE(store.open_upload(upload.info.id).status == StoreStatus::missing);
  REQUIRE(store.usage().bytes == 4);
  REQUIRE(store.usage().entries == 1);
  auto read = store.open(upload.info.id, RootAccess::read_only);
  REQUIRE(read.status == StoreStatus::ok);
  std::array<std::uint8_t, 4> result{};
  REQUIRE(read.view.read(0, result).bytes == result.size());
  REQUIRE(result == next);
  read.view.close();
  REQUIRE(store.remove(upload.info.id) == StoreStatus::ok);
  auto later = store.create_entry(0, "new", EntryKind::file);
  REQUIRE(later.status == StoreStatus::ok);
  REQUIRE(later.info.id > upload.info.id);
  REQUIRE(store.info(first.info.id).status == StoreStatus::missing);
}

TEST_CASE("Upload target parent identity survives a move while its staged writer is active") {
  Fixture fixture;
  OwnedStore owned(fixture);
  auto &store = owned.value;
  const auto dir = store.create_entry(0, "a", EntryKind::directory);
  REQUIRE(dir.status == StoreStatus::ok);
  const auto upload = store.begin_upload(dir.info.id, "file");
  REQUIRE(upload.status == StoreStatus::ok);
  auto writer = store.open_upload(upload.info.id);
  REQUIRE(writer.status == StoreStatus::ok);
  REQUIRE(store.remove(dir.info.id) == StoreStatus::not_empty);
  REQUIRE(store.rename(dir.info.id, 0, "b") == StoreStatus::ok);
  const std::array<std::uint8_t, 2> bytes{1, 2};
  REQUIRE(writer.view.write(0, bytes).status == StoreStatus::ok);
  writer.view.close();
  REQUIRE(store.publish_upload(upload.info.id).status == StoreStatus::ok);
  REQUIRE(store.find_child(dir.info.id, "file").info.id == upload.info.id);
  REQUIRE(store.find_child(0, "b").info.id == dir.info.id);
  REQUIRE(clean_store(store) == StoreStatus::ok);
}

TEST_CASE("Sandbox entry metadata page and transfer limits refuse before mutation") {
  Fixture fixture;
  OwnedStore owned(fixture, {{8, 8, 3}, 4096});
  auto &store = owned.value;
  for (const std::string_view name : {"../new", "a/b", "C:new", "CON", "new.", ""})
    REQUIRE(store.create_entry(0, name, EntryKind::file).status == StoreStatus::invalid);
  REQUIRE(store.create_entry(99, "new", EntryKind::file).status == StoreStatus::missing);
  auto a = store.create_entry(0, "a", EntryKind::file), b = store.create_entry(0, "b", EntryKind::file);
  REQUIRE(a.status == StoreStatus::ok);
  REQUIRE(b.status == StoreStatus::ok);
  const auto dir = store.create_entry(0, "dir", EntryKind::directory);
  REQUIRE(dir.status == StoreStatus::ok);
  REQUIRE(store.create_entry(0, "new", EntryKind::file).status == StoreStatus::limit);
  REQUIRE(store.begin_upload(0, "new").status == StoreStatus::limit);
  REQUIRE(store.list(0, 0, 0).status == StoreStatus::invalid);
  REQUIRE(store.list(0, 0, maximum_file_page + 1).status == StoreStatus::invalid);
  const auto page = store.list(0, 0, 2);
  REQUIRE(page.status == StoreStatus::ok);
  REQUIRE(page.entries.size() == 2);
  REQUIRE(page.next == b.info.id);
  const auto rest = store.list(0, page.next, 2);
  REQUIRE(rest.entries.size() == 1);
  REQUIRE(rest.entries[0].id == dir.info.id);
  REQUIRE(rest.next == 0);
  REQUIRE(store.rename(dir.info.id, dir.info.id, "bad") == StoreStatus::invalid);
  auto view = store.open(a.info.id, RootAccess::read_write);
  REQUIRE(view.status == StoreStatus::ok);
  std::vector<std::uint8_t> too_large(maximum_io_bytes + 1);
  REQUIRE(view.view.write(0, too_large).status == StoreStatus::invalid);
  REQUIRE(view.view.read(0, too_large).status == StoreStatus::invalid);
  REQUIRE(view.view.write(std::numeric_limits<std::uint64_t>::max(), {}).status == StoreStatus::invalid);
  REQUIRE(view.view.resize(9) == StoreStatus::limit);
  REQUIRE(store.info(a.info.id).info.bytes == 0);
  REQUIRE(store.usage().bytes == 0);
  view.view.close();
}

TEST_CASE("Sandbox retirement retains open-view charges and cleanup joins real handle closure") {
  Fixture fixture;
  OwnedStore owned(fixture);
  auto &store = owned.value;
  const auto file = store.create_entry(0, "file", EntryKind::file);
  REQUIRE(file.status == StoreStatus::ok);
  auto writer = store.open(file.info.id, RootAccess::read_write);
  REQUIRE(writer.status == StoreStatus::ok);
  const std::array<std::uint8_t, 3> bytes{1, 2, 3};
  REQUIRE(writer.view.write(0, bytes).status == StoreStatus::ok);
  REQUIRE(store.cleanup() == StoreStatus::busy);
  REQUIRE(store.usage().entries == 1);
  REQUIRE(store.usage().bytes == 3);
  REQUIRE(writer.view.write(0, bytes).status == StoreStatus::retired);
  REQUIRE(store.open(file.info.id, RootAccess::read_only).status == StoreStatus::retired);
  auto moved = std::move(writer.view);
  REQUIRE_FALSE(writer.view);
  REQUIRE(store.cleanup() == StoreStatus::busy);
  moved.close();
  moved.close();
  REQUIRE(clean_store(store) == StoreStatus::ok);
  REQUIRE(store.usage().entries == 0);
  REQUIRE(store.usage().bytes == 0);
  REQUIRE(clean_store(store) == StoreStatus::ok);
}

TEST_CASE("Sandbox refuses nonempty roots and finite metadata exhaustion leaves no user entry") {
  Fixture fixture;
  host_file(fixture.root / "file", "owned host sentinel");
  auto [opened, root] = SafeRoot::open(fixture.root);
  REQUIRE(opened == Status::ok);
  REQUIRE(Sandbox::create(std::move(root)).first == StoreStatus::denied);
  REQUIRE(host_read(fixture.root / "file") == "owned host sentinel");
  REQUIRE(std::filesystem::remove(fixture.root / "file"));
  OwnedStore owned(fixture, {{8, 8, 8}, 0});
  REQUIRE(owned.value.create_entry(0, "new", EntryKind::file).status == StoreStatus::limit);
  REQUIRE(owned.value.begin_upload(0, "new").status == StoreStatus::limit);
  REQUIRE(owned.value.usage().entries == 0);
  REQUIRE(owned.value.list(0).entries.empty());
}

TEST_CASE("Concurrent uploads never overwrite an exclusive publish or free the losing upload early") {
  Fixture fixture;
  OwnedStore owned(fixture, {{8, 8, 4}, 4096});
  auto &store = owned.value;
  const auto first = store.begin_upload(0, "file"), second = store.begin_upload(0, "file");
  REQUIRE(first.status == StoreStatus::ok);
  REQUIRE(second.status == StoreStatus::ok);
  auto a = store.open_upload(first.info.id), b = store.open_upload(second.info.id);
  REQUIRE(a.status == StoreStatus::ok);
  REQUIRE(b.status == StoreStatus::ok);
  const std::array<std::uint8_t, 4> one{1, 1, 1, 1}, two{2, 2, 2, 2};
  REQUIRE(a.view.write(0, one).status == StoreStatus::ok);
  REQUIRE(b.view.write(0, two).status == StoreStatus::ok);
  a.view.close();b.view.close();
  auto job = std::async(std::launch::async, [&] { return store.publish_upload(first.info.id); });
  const auto other = store.publish_upload(second.info.id);
  const auto result = job.get();
  REQUIRE(((result.status == StoreStatus::ok && other.status == StoreStatus::exists) ||
           (result.status == StoreStatus::exists && other.status == StoreStatus::ok)));
  const auto winner = result.status == StoreStatus::ok ? first.info.id : second.info.id;
  const auto loser = result.status == StoreStatus::ok ? second.info.id : first.info.id;
  REQUIRE(store.list(0).entries.size() == 1);
  REQUIRE(store.list(0).entries[0].id == winner);
  REQUIRE(store.info(loser).status == StoreStatus::missing);
  REQUIRE(store.usage().bytes == 8);
  REQUIRE(store.remove(loser) == StoreStatus::ok);
  REQUIRE(store.usage().bytes == 4);
  auto read = store.open(winner, RootAccess::read_only);
  REQUIRE(read.status == StoreStatus::ok);
  std::array<std::uint8_t, 4> actual{};
  REQUIRE(read.view.read(0, actual).bytes == actual.size());
  REQUIRE(actual == (winner == first.info.id ? one : two));
}

TEST_CASE("Sandbox detects replaced filesystem objects and never deletes the replacement") {
  Fixture fixture;
  OwnedStore owned(fixture);
  auto &store = owned.value;
  const auto file = store.create_entry(0, "file", EntryKind::file);
  REQUIRE(file.status == StoreStatus::ok);
  auto writer = store.open(file.info.id, RootAccess::read_write);
  REQUIRE(writer.status == StoreStatus::ok);
  const std::array<std::uint8_t, 3> data{1, 2, 3};
  REQUIRE(writer.view.write(0, data).status == StoreStatus::ok);
  writer.view.close();
  const auto managed = fixture.root / ".data" / "file", saved = fixture.outside / "file";
  std::filesystem::rename(managed, saved);
  struct Restore {
    std::filesystem::path source, destination;
    bool active = true;
    void run() {
      if (!active) return;
      std::filesystem::remove(destination);
      std::filesystem::rename(source, destination);
      active = false;
    }
    ~Restore() { run(); }
  } restore{saved, managed};
  host_file(managed, "replacement sentinel");
  REQUIRE(store.open(file.info.id, RootAccess::read_only).status == StoreStatus::retained);
  REQUIRE(store.usage().retired);
  REQUIRE(store.cleanup() == StoreStatus::retained);
  REQUIRE(host_read(managed) == "replacement sentinel");
  restore.run();
  REQUIRE(clean_store(store) == StoreStatus::ok);
  REQUIRE(store.usage().entries == 0);
}

TEST_CASE("Sandbox view capacity and metadata rename limits preserve physical files on refusal") {
  Fixture fixture;
  OwnedStore owned(fixture, {{8, 8, 8}, 35});
  auto &store = owned.value;
  const auto file = store.create_entry(0, "a", EntryKind::file);
  const auto dir = store.create_entry(0, "longparent", EntryKind::directory);
  REQUIRE(file.status == StoreStatus::ok);
  REQUIRE(dir.status == StoreStatus::ok);
  REQUIRE(store.rename(file.info.id, dir.info.id, "a") == StoreStatus::limit);
  REQUIRE(store.info(file.info.id).info.parent == 0);
  std::vector<ViewResult> views;
  for (unsigned i = 0; i < 256; ++i) {
    auto opened = store.open(file.info.id, RootAccess::read_only);
    REQUIRE(opened.status == StoreStatus::ok);
    views.push_back(std::move(opened));
  }
  REQUIRE(store.open(file.info.id, RootAccess::read_only).status == StoreStatus::limit);
  REQUIRE(store.remove(file.info.id) == StoreStatus::busy);
  views.clear();
  REQUIRE(store.remove(file.info.id) == StoreStatus::ok);
}

TEST_CASE("Stable download pins block existing and new writers until every moved pin closes") {
  Fixture fixture;
  OwnedStore owned(fixture);
  auto &store = owned.value;
  const auto entry = store.create_entry(0, "file", EntryKind::file);
  REQUIRE(entry.status == StoreStatus::ok);
  auto writer = store.open(entry.info.id, RootAccess::read_write);
  REQUIRE(writer.status == StoreStatus::ok);
  const std::array<std::uint8_t, 3> bytes{1, 2, 3};
  REQUIRE(writer.view.write(0, bytes).status == StoreStatus::ok);
  REQUIRE(writer.view.size().bytes == 3);
  auto first = store.open_download(entry.info.id), second = store.open_download(entry.info.id);
  REQUIRE(first.status == StoreStatus::ok);
  REQUIRE(second.status == StoreStatus::ok);
  REQUIRE(second.view.size().status == StoreStatus::ok);
  REQUIRE(second.view.size().bytes == 3);
  REQUIRE(writer.view.write(0, bytes).status == StoreStatus::busy);
  REQUIRE(writer.view.resize(0) == StoreStatus::busy);
  auto another = store.open(entry.info.id, RootAccess::read_write);
  REQUIRE(another.status == StoreStatus::ok);
  REQUIRE(another.view.resize(4) == StoreStatus::busy);
  std::array<std::uint8_t, 3> actual{};
  REQUIRE(second.view.read(0, actual).bytes == 3);
  REQUIRE(actual == bytes);
  auto moved = std::move(first.view);
  second.view.close();
  REQUIRE(writer.view.resize(0) == StoreStatus::busy);
  REQUIRE(store.usage().bytes == 3);
  moved.close();
  REQUIRE(writer.view.resize(0) == StoreStatus::ok);
  REQUIRE(another.view.size().bytes == 0);
  REQUIRE(store.usage().bytes == 0);
  REQUIRE(another.view.write(0, bytes).status == StoreStatus::ok);
}
TEST_CASE("Scoped sandbox anchors a share root and refuses native keys outside its subtree") {
  Fixture fixture;
  OwnedStore owned(fixture);
  auto &store = owned.value;
  const auto first = store.create_entry(0, "first", EntryKind::directory);
  const auto second = store.create_entry(0, "second", EntryKind::directory);
  REQUIRE(first.status == StoreStatus::ok);
  REQUIRE(second.status == StoreStatus::ok);
  auto admitted = store.scope(first.info.id, RootAccess::read_write);
  REQUIRE(admitted.first == StoreStatus::ok);
  auto &share = admitted.second;
  REQUIRE(share.root() == first.info.id);
  REQUIRE(share.resolve("").info.id == first.info.id);
  REQUIRE(share.resolve("..").status == StoreStatus::invalid);
  REQUIRE(share.resolve("../second").status == StoreStatus::invalid);
  REQUIRE(share.resolve("/first").status == StoreStatus::invalid);
  REQUIRE(share.resolve("first//child").status == StoreStatus::invalid);
  REQUIRE(share.resolve("C:stream").status == StoreStatus::invalid);
  REQUIRE(share.resolve("NUL.txt").status == StoreStatus::invalid);
  REQUIRE(share.info(second.info.id).status == StoreStatus::denied);
  REQUIRE(share.list(second.info.id).status == StoreStatus::denied);
  REQUIRE(share.create_entry(second.info.id, "file", EntryKind::file).status == StoreStatus::denied);
  REQUIRE(share.scope(second.info.id, RootAccess::read_only).first == StoreStatus::denied);
  REQUIRE(share.remove(share.root()) == StoreStatus::denied);
  REQUIRE(share.rename(share.root(), share.root(), "renamed") == StoreStatus::denied);
  REQUIRE(store.rename(first.info.id, 0, "renamed") == StoreStatus::busy);
  REQUIRE(store.remove(first.info.id) == StoreStatus::busy);
  const auto file = share.create_entry(share.root(), "file", EntryKind::file);
  REQUIRE(file.status == StoreStatus::ok);
  REQUIRE(share.resolve("file").info.id == file.info.id);
  REQUIRE(share.rename(file.info.id, second.info.id, "escape") == StoreStatus::denied);
  REQUIRE(share.remove(second.info.id) == StoreStatus::denied);
}
TEST_CASE("Scoped sandbox rechecks stale resolved IDs at every final operation") {
  Fixture fixture;
  OwnedStore owned(fixture);
  auto &store = owned.value;
  const auto a = store.create_entry(0, "a", EntryKind::directory);
  const auto b = store.create_entry(0, "b", EntryKind::directory);
  REQUIRE(a.status == StoreStatus::ok);
  REQUIRE(b.status == StoreStatus::ok);
  auto scope = store.scope(a.info.id, RootAccess::read_write);
  REQUIRE(scope.first == StoreStatus::ok);
  auto &share = scope.second;
  const auto directory = share.create_entry(a.info.id, "child", EntryKind::directory);
  REQUIRE(directory.status == StoreStatus::ok);
  const auto file = share.create_entry(directory.info.id, "file", EntryKind::file);
  REQUIRE(file.status == StoreStatus::ok);
  const auto resolved = share.resolve("child/file");
  REQUIRE(resolved.status == StoreStatus::ok);
  REQUIRE(store.rename(directory.info.id, b.info.id, "child") == StoreStatus::ok);
  REQUIRE(share.resolve("child/file").status == StoreStatus::missing);
  REQUIRE(share.info(resolved.info.id).status == StoreStatus::denied);
  REQUIRE(share.open(resolved.info.id, RootAccess::read_only).status == StoreStatus::denied);
  REQUIRE(share.create_entry(directory.info.id, "late", EntryKind::file).status == StoreStatus::denied);
  REQUIRE(share.find_child(directory.info.id, "file").status == StoreStatus::denied);
  REQUIRE(share.list(directory.info.id).status == StoreStatus::denied);
  REQUIRE(share.rename(resolved.info.id, a.info.id, "back") == StoreStatus::denied);
  REQUIRE(share.remove(resolved.info.id) == StoreStatus::denied);
  REQUIRE(store.info(resolved.info.id).status == StoreStatus::ok);
  REQUIRE(store.find_child(directory.info.id, "late").status == StoreStatus::missing);
}
TEST_CASE("Scoped read-only policy cannot be upgraded and shares the HTTP quota and download pin") {
  Fixture fixture;
  OwnedStore owned(fixture, {{8, 8, 8}, 4096});
  auto &store = owned.value;
  auto writable = store.scope(0, RootAccess::read_write);
  auto read_only = store.scope(0, RootAccess::read_only);
  REQUIRE(writable.first == StoreStatus::ok);
  REQUIRE(read_only.first == StoreStatus::ok);
  auto &rw = writable.second;
  auto &ro = read_only.second;
  const auto file = rw.create_entry(0, "file", EntryKind::file);
  REQUIRE(file.status == StoreStatus::ok);
  const auto directory = rw.create_entry(0, "child", EntryKind::directory);
  REQUIRE(directory.status == StoreStatus::ok);
  REQUIRE(ro.scope(directory.info.id, RootAccess::read_write).first == StoreStatus::denied);
  REQUIRE(ro.create_entry(0, "no", EntryKind::file).status == StoreStatus::denied);
  REQUIRE(ro.rename(file.info.id, 0, "no") == StoreStatus::denied);
  REQUIRE(ro.remove(file.info.id) == StoreStatus::denied);
  REQUIRE(ro.open(file.info.id, RootAccess::read_write).status == StoreStatus::denied);
  auto writer = rw.open(file.info.id, RootAccess::read_write);
  REQUIRE(writer.status == StoreStatus::ok);
  const std::array<std::uint8_t, 8> bytes{0, 255, 1, 128, 2, 127, 3, 126};
  REQUIRE(writer.view.write(0, bytes).status == StoreStatus::ok);
  REQUIRE(store.usage().bytes == 8);
  auto reader = ro.open(file.info.id, RootAccess::read_only);
  REQUIRE(reader.status == StoreStatus::ok);
  REQUIRE(reader.view.write(0, bytes).status == StoreStatus::denied);
  REQUIRE(reader.view.resize(0) == StoreStatus::denied);
  std::array<std::uint8_t, 8> copy{};
  REQUIRE(reader.view.read(0, copy).status == StoreStatus::ok);
  REQUIRE(copy == bytes);
  REQUIRE(ro.list(0).entries.size() == 2);
  auto pin = store.open_download(file.info.id);
  REQUIRE(pin.status == StoreStatus::ok);
  REQUIRE(writer.view.write(0, bytes).status == StoreStatus::busy);
  REQUIRE(writer.view.resize(0) == StoreStatus::busy);
  pin.view.close();
  const auto upload = store.begin_upload(0, "upload");
  REQUIRE(upload.status == StoreStatus::ok);
  auto staging = store.open_upload(upload.info.id);
  REQUIRE(staging.status == StoreStatus::ok);
  REQUIRE(staging.view.write(0, bytes).status == StoreStatus::limit);
  REQUIRE(ro.info(upload.info.id).status == StoreStatus::denied);
  REQUIRE(ro.open(upload.info.id, RootAccess::read_only).status == StoreStatus::denied);
  REQUIRE(ro.resolve("upload").status == StoreStatus::missing);
  REQUIRE(ro.list(0).entries.size() == 2);
}
TEST_CASE("Scoped roots and directory views bound lifecycle pins and join before owner cleanup") {
  Fixture fixture;
  OwnedStore owned(fixture);
  auto &store = owned.value;
  std::vector<ScopedSandbox> scopes;
  for (unsigned i = 0; i < 256; ++i) {
    auto scope = store.scope(0, RootAccess::read_only);
    REQUIRE(scope.first == StoreStatus::ok);
    scopes.push_back(std::move(scope.second));
  }
  REQUIRE(store.scope(0, RootAccess::read_only).first == StoreStatus::limit);
  scopes.pop_back();
  auto last = store.scope(0, RootAccess::read_only);
  REQUIRE(last.first == StoreStatus::ok);
  REQUIRE(store.cleanup() == StoreStatus::busy);
  REQUIRE(last.second.resolve("").status == StoreStatus::retired);
  REQUIRE(last.second.scope(0, RootAccess::read_only).first == StoreStatus::retired);
  last.second.close();
  scopes.clear();
  REQUIRE(store.cleanup() == StoreStatus::ok);
}
namespace {
std::vector<ScopedSandbox> drive_shares(Sandbox &owner, NativeFileId root = 0) {
  std::vector<ScopedSandbox> shares;
  for (const auto access : {RootAccess::read_write, RootAccess::read_only}) {
    auto scope = owner.scope(root, access);
    REQUIRE(scope.first == StoreStatus::ok);
    shares.push_back(std::move(scope.second));
  }
  return shares;
}
constexpr auto full_drive_access = DriveAccess::read | DriveAccess::write | DriveAccess::erase;
DriveOpen create_drive_file(std::string_view path) {
  DriveOpen request;
  request.path = path;request.access = full_drive_access;
  request.disposition = DriveDisposition::create;
  request.kind = EntryKind::file;
  return request;
}
} // namespace
TEST_CASE("Drive backend performs scoped binary CRUD and preserves read-only aliases and global sharing") {
  Fixture fixture;
  OwnedStore owned(fixture, {{16, 16, 8}, 4096});
  auto &owner = owned.value;
  const auto root = owner.create_entry(0, "share", EntryKind::directory);
  REQUIRE(root.status == StoreStatus::ok);
  DriveSession drive(drive_shares(owner, root.info.id));
  const auto file = drive.open(0, create_drive_file("file"));
  REQUIRE(file.status == DriveStatus::ok);
  REQUIRE(file.information == DriveCreated::created);
  const std::array<std::uint8_t, 8> bytes{0, 255, 1, 254, 2, 253, 3, 252};
  REQUIRE(drive.write(0, file.handle, 0, bytes).status == DriveStatus::ok);
  REQUIRE(owner.usage().bytes == 8);
  DriveOpen request;
  request.path = "file";
  const auto reader = drive.open(1, request);
  REQUIRE(reader.status == DriveStatus::ok);
  std::array<std::uint8_t, 8> copy{};
  REQUIRE(drive.read(1, reader.handle, 0, copy).status == DriveStatus::ok);
  REQUIRE(copy == bytes);
  REQUIRE(drive.write(1, reader.handle, 0, bytes).status == DriveStatus::denied);
  REQUIRE(drive.resize(1, reader.handle, 0) == DriveStatus::denied);
  REQUIRE(drive.info(0, reader.handle).status == DriveStatus::invalid_handle);
  REQUIRE(drive.close(0, reader.handle) == DriveStatus::invalid_handle);
  REQUIRE(drive.rename(0, file.handle, "renamed") == DriveStatus::busy);
  REQUIRE(drive.close(1, reader.handle) == DriveStatus::ok);
  REQUIRE(drive.rename(0, file.handle, "Привет 日本語 😀.bin") == DriveStatus::ok);
  REQUIRE(drive.info(0, file.handle).info.name == "Привет 日本語 😀.bin");
  REQUIRE(drive.info(0, file.handle).info.bytes == 8);
  REQUIRE(drive.resize(0, file.handle, 4) == DriveStatus::ok);
  REQUIRE(owner.usage().bytes == 4);
  request.path = "";request.kind = EntryKind::directory;
  const auto directory = drive.open(1, request);
  REQUIRE(directory.status == DriveStatus::ok);
  const auto page = drive.list(1, directory.handle);
  REQUIRE(page.status == DriveStatus::ok);
  REQUIRE(page.entries.size() == 1);
  REQUIRE(page.entries[0].id == file.info.id);
  REQUIRE(page.entries[0].bytes == 4);
  REQUIRE(drive.remove_on_close(0, file.handle, true) == DriveStatus::ok);
  request.path = "Привет 日本語 😀.bin";request.kind = EntryKind::file;
  REQUIRE(drive.open(1, request).status == DriveStatus::delete_pending);
  REQUIRE(drive.close(0, file.handle) == DriveStatus::ok);
  REQUIRE(owner.info(file.info.id).status == StoreStatus::missing);
  REQUIRE(drive.list(1, directory.handle).entries.empty());
  REQUIRE(drive.close(1, directory.handle) == DriveStatus::ok);
}
TEST_CASE("Drive backend honors cross-alias sharing and retains the share that authorized deferred deletion") {
  Fixture fixture;
  OwnedStore owned(fixture);
  auto &owner = owned.value;
  DriveSession drive(drive_shares(owner));
  const auto first = drive.open(0, create_drive_file("file"));
  REQUIRE(first.status == DriveStatus::ok);
  REQUIRE(drive.close(0, first.handle) == DriveStatus::ok);
  DriveOpen read;
  read.path = "file";read.share = DriveAccess::read;
  const auto exclusive = drive.open(1, read);
  REQUIRE(exclusive.status == DriveStatus::ok);
  auto write = create_drive_file("file");write.disposition = DriveDisposition::open;
  REQUIRE(drive.open(0, write).status == DriveStatus::sharing_violation);
  REQUIRE(drive.close(1, exclusive.handle) == DriveStatus::ok);
  read.share = full_drive_access;
  const auto reader = drive.open(1, read);
  REQUIRE(reader.status == DriveStatus::ok);
  const auto writer = drive.open(0, write);
  REQUIRE(writer.status == DriveStatus::ok);
  REQUIRE(drive.remove_on_close(0, writer.handle, true) == DriveStatus::ok);
  REQUIRE(drive.close(0, writer.handle) == DriveStatus::ok);
  REQUIRE(owner.info(first.info.id).status == StoreStatus::ok);
  // The last closer is a read-only alias. Deletion uses the earlier RW grant,
  // never an implicit promotion of this read-only handle's own rights.
  REQUIRE(drive.close(1, reader.handle) == DriveStatus::ok);
  REQUIRE(owner.info(first.info.id).status == StoreStatus::missing);
}
TEST_CASE("Drive backend reserves handles before mutations and settles failed allocations without quota loss") {
  Fixture fixture;
  OwnedStore owned(fixture, {{8, 8, 8}, 4096});
  auto &owner = owned.value;
  DriveSession drive(drive_shares(owner), 2);
  auto request = create_drive_file("too-big");request.allocation_bytes = 9;
  REQUIRE(drive.open(0, request).status == DriveStatus::limit);
  REQUIRE(owner.find_child(0, "too-big").status == StoreStatus::missing);
  REQUIRE(owner.usage().bytes == 0);
  const auto file = drive.open(0, create_drive_file("file"));
  REQUIRE(file.status == DriveStatus::ok);
  DriveOpen root;root.path = "";root.kind = EntryKind::directory;
  const auto directory = drive.open(1, root);
  REQUIRE(directory.status == DriveStatus::ok);
  REQUIRE(drive.open(0, create_drive_file("capacity")).status == DriveStatus::handle_limit);
  REQUIRE(owner.find_child(0, "capacity").status == StoreStatus::missing);
  REQUIRE(drive.close(1, directory.handle) == DriveStatus::ok);
  REQUIRE(drive.close(0, file.handle) == DriveStatus::ok);
  request.path = "file";request.allocation_bytes = 8;
  request.disposition = DriveDisposition::overwrite;
  const auto overwrite = drive.open(0, request);
  REQUIRE(overwrite.status == DriveStatus::ok);
  REQUIRE(overwrite.information == DriveCreated::overwritten);
  REQUIRE(overwrite.info.bytes == 8);
  REQUIRE(overwrite.handle > file.handle);
  const std::array<std::uint8_t, 1> extra{1};
  REQUIRE(drive.write(0, overwrite.handle, 8, extra).status == DriveStatus::limit);
  REQUIRE(owner.usage().bytes == 8);
  REQUIRE(drive.rename(0, overwrite.handle, "../escape") == DriveStatus::invalid);
  REQUIRE(drive.rename(0, overwrite.handle, "/escape") == DriveStatus::invalid);
  drive.retire();
  REQUIRE(drive.info(0, overwrite.handle).status == DriveStatus::retired);
  REQUIRE(owner.cleanup() == StoreStatus::ok);
}
TEST_CASE("Drive backend directory handles join rename and refuse recursive or root deletion") {
  Fixture fixture;
  OwnedStore owned(fixture);
  auto &owner = owned.value;
  DriveSession drive(drive_shares(owner));
  auto request = create_drive_file("directory");request.kind = EntryKind::directory;
  const auto directory = drive.open(0, request);
  REQUIRE(directory.status == DriveStatus::ok);
  REQUIRE(drive.open(0, create_drive_file("directory/child")).status == DriveStatus::ok);
  REQUIRE(drive.remove_on_close(0, directory.handle, true) == DriveStatus::not_empty);
  REQUIRE(drive.rename(0, directory.handle, "moved") == DriveStatus::busy); // Child file view is live.
  drive.retire();
  REQUIRE(owner.find_child(0, "directory").status == StoreStatus::ok);
  auto scopes = drive_shares(owner);
  DriveSession again(std::move(scopes));
  DriveOpen root;root.path = "";root.kind = EntryKind::directory;root.access = full_drive_access;
  const auto opened = again.open(0, root);
  REQUIRE(opened.status == DriveStatus::ok);
  REQUIRE(again.remove_on_close(0, opened.handle, true) == DriveStatus::denied);
  REQUIRE(again.rename(0, opened.handle, "escape") == DriveStatus::denied);
}
namespace {
using FileOperation = bridge::ipc::files::Operation;
struct FileReply {
  StoreStatus status;
  std::uint64_t id, argument, value;
  std::vector<std::uint8_t> data;
};
FileReply file_call(FileService &service, FileOperation operation, std::uint64_t id = 0,
                    std::uint64_t argument = 0, std::uint64_t value = 0,
                    ::bridge::compat::span<const std::uint8_t> data = {}, std::uint16_t flags = 0) {
  const auto bytes = bridge::ipc::files::encode({operation, StoreStatus::ok, flags, id, argument, value, data}, false);
  const auto result = service.command(bytes);
  const auto record = bridge::ipc::files::decode(result, true);
  return {record.status, record.id, record.argument, record.value, {record.data.begin(), record.data.end()}};
}
} // namespace
TEST_CASE("Native file service streams binary uploads and stable downloads through its bounded codec") {
  Fixture fixture;
  FileService service(fixture.root, true);
  REQUIRE(file_call(service, FileOperation::list, 0, 0, 64).status == StoreStatus::unavailable);
  REQUIRE(file_call(service, FileOperation::initialize, 131072, 131072, 4).status == StoreStatus::ok);
  REQUIRE(file_call(service, FileOperation::initialize, 131072, 131072, 4).status == StoreStatus::retired);
  const std::array<std::uint8_t, 4> name{'f', 'i', 'l', 'e'};
  const auto upload = file_call(service, FileOperation::begin_upload, 0, 0, 0, name);
  REQUIRE(upload.status == StoreStatus::ok);
  REQUIRE(file_call(service, FileOperation::begin_upload, 0, 0, 0, name).status == StoreStatus::busy);
  REQUIRE(file_call(service, FileOperation::list, 0, 0, 64).argument == 0);
  std::vector<std::uint8_t> first(65536), second(123);
  for (std::size_t i = 0; i < first.size(); ++i) first[i] = static_cast<std::uint8_t>(i * 17);
  for (std::size_t i = 0; i < second.size(); ++i) second[i] = static_cast<std::uint8_t>(i * 19);
  REQUIRE(file_call(service, FileOperation::write, upload.id, 1, 0, first).status == StoreStatus::invalid);
  REQUIRE(file_call(service, FileOperation::write, upload.id, 0, 0, first).value == first.size());
  REQUIRE(file_call(service, FileOperation::commit, upload.id, 1).status == StoreStatus::invalid);
  REQUIRE(file_call(service, FileOperation::write, upload.id, first.size(), 0, second).status == StoreStatus::ok);
  const auto size = first.size() + second.size();
  REQUIRE(file_call(service, FileOperation::commit, upload.id, size).value == size);
  REQUIRE(file_call(service, FileOperation::commit, upload.id, size).status == StoreStatus::missing);
  REQUIRE(file_call(service, FileOperation::list, 0, 0, 64).argument == 1);
  REQUIRE(file_call(service, FileOperation::open_download, upload.id).value == size);
  REQUIRE(file_call(service, FileOperation::open_download, upload.id).status == StoreStatus::busy);
  REQUIRE(file_call(service, FileOperation::remove, upload.id).status == StoreStatus::busy);
  REQUIRE(file_call(service, FileOperation::read, upload.id, 1, 65536).status == StoreStatus::invalid);
  REQUIRE(file_call(service, FileOperation::read, upload.id, 0, 65536).data == first);
  REQUIRE(file_call(service, FileOperation::read, upload.id, first.size(), 65536).data == second);
  REQUIRE(file_call(service, FileOperation::read, upload.id, size, 65536).data.empty());
  REQUIRE(file_call(service, FileOperation::close_download, upload.id).status == StoreStatus::ok);
  REQUIRE(file_call(service, FileOperation::remove, upload.id).status == StoreStatus::ok);
  REQUIRE(service.shutdown() == StoreStatus::ok);
  REQUIRE(service.shutdown() == StoreStatus::ok);
  REQUIRE(std::filesystem::is_empty(fixture.root));
}
TEST_CASE("Native file service refuses unowned runtimes and preserves failed upload quota ownership") {
  Fixture fixture;
  {
    FileService refused(fixture.root, false);
    REQUIRE(file_call(refused, FileOperation::initialize, 8, 8, 4).status == StoreStatus::denied);
    REQUIRE(std::filesystem::is_empty(fixture.root));
  }
  FileService service(fixture.root, true);
  REQUIRE(file_call(service, FileOperation::initialize, 8, 8, 4).status == StoreStatus::ok);
  const std::array<std::uint8_t, 4> invalid{'.', '.', '/', 'a'}, name{'f', 'i', 'l', 'e'};
  REQUIRE(file_call(service, FileOperation::begin_upload, 0, 0, 0, invalid).status == StoreStatus::invalid);
  const auto upload = file_call(service, FileOperation::begin_upload, 0, 0, 0, name);
  REQUIRE(upload.status == StoreStatus::ok);
  const std::array<std::uint8_t, 9> too_big{};
  REQUIRE(file_call(service, FileOperation::write, upload.id, 0, 0, too_big).status == StoreStatus::limit);
  REQUIRE(file_call(service, FileOperation::commit, upload.id).status == StoreStatus::ok);
  const auto collision = file_call(service, FileOperation::begin_upload, 0, 0, 0, name);
  REQUIRE(collision.status == StoreStatus::ok);
  REQUIRE(file_call(service, FileOperation::commit, collision.id).status == StoreStatus::exists);
  REQUIRE(file_call(service, FileOperation::write, collision.id, 0, 0, too_big).status == StoreStatus::invalid);
  REQUIRE(file_call(service, FileOperation::abort, collision.id).status == StoreStatus::ok);
  REQUIRE(file_call(service, FileOperation::list, 0, 0, 64).argument == 1);
  REQUIRE(file_call(service, FileOperation::retire).status == StoreStatus::ok);
  REQUIRE(file_call(service, FileOperation::list, 0, 0, 64).status == StoreStatus::retired);
  REQUIRE(std::filesystem::is_empty(fixture.root));
}

TEST_CASE("Native file service binds share subdirectories to its one owner and joins retirement") {
  Fixture fixture;
  FileService service(fixture.root, true);
  REQUIRE(service.scope("share", RootAccess::read_only).first == StoreStatus::unavailable);
  REQUIRE(file_call(service, FileOperation::initialize, 8, 8, 8).status == StoreStatus::ok);
  for (const auto path : {"../outside", "/absolute", "C:stream", "a//b", "a/../b"})
    REQUIRE(service.scope(path, RootAccess::read_only).first == StoreStatus::invalid);
  auto scope = service.scope("share/nested", RootAccess::read_write);
  REQUIRE(scope.first == StoreStatus::ok);
  auto &share = scope.second;
  const auto entry = share.create_entry(share.root(), "file", EntryKind::file);
  REQUIRE(entry.status == StoreStatus::ok);
  auto writer = share.open(entry.info.id, RootAccess::read_write);
  REQUIRE(writer.status == StoreStatus::ok);
  const std::array<std::uint8_t, 8> bytes{0, 1, 2, 3, 255, 254, 253, 252};
  REQUIRE(writer.view.write(0, bytes).status == StoreStatus::ok);
  writer.view.close();
  REQUIRE(file_call(service, FileOperation::open_download, entry.info.id).value == 8);
  REQUIRE(file_call(service, FileOperation::read, entry.info.id, 0, 8).data ==
            std::vector<std::uint8_t>(bytes.begin(), bytes.end()));
  REQUIRE(file_call(service, FileOperation::close_download, entry.info.id).status == StoreStatus::ok);
  auto ro = service.scope("share/nested", RootAccess::read_only);
  REQUIRE(ro.first == StoreStatus::ok);
  REQUIRE(ro.second.resolve("file").info.id == entry.info.id);
  REQUIRE(service.scope("share/nested/file/invalid", RootAccess::read_only).first == StoreStatus::invalid);
  REQUIRE(service.shutdown() == StoreStatus::busy);
  REQUIRE(share.resolve("file").status == StoreStatus::retired);
  REQUIRE(ro.second.resolve("file").status == StoreStatus::retired);
  share.close();ro.second.close();
  REQUIRE(service.shutdown() == StoreStatus::ok);
  REQUIRE(std::filesystem::is_empty(fixture.root));
}
TEST_CASE("Drive backend and HTTP file service serialize growth against one native quota ledger") {
  Fixture fixture;
  FileService service(fixture.root, true);
  REQUIRE(file_call(service, FileOperation::initialize, 8, 8, 8).status == StoreStatus::ok);
  std::vector<ScopedSandbox> shares;
  auto scope = service.scope("share", RootAccess::read_write);
  REQUIRE(scope.first == StoreStatus::ok);
  shares.push_back(std::move(scope.second));
  DriveSession drive(std::move(shares));
  const auto file = drive.open(0, create_drive_file("file"));
  REQUIRE(file.status == DriveStatus::ok);
  const std::array<std::uint8_t, 4> name{'h', 't', 't', 'p'}, http_bytes{0, 255, 1, 254};
  const std::array<std::uint8_t, 8> drive_bytes{1, 2, 3, 4, 5, 6, 7, 8};
  const auto upload = file_call(service, FileOperation::begin_upload, 0, 0, 0, name);
  REQUIRE(upload.status == StoreStatus::ok);
  std::atomic<bool> start{false};
  auto http = std::async(std::launch::async, [&] {
    while (!start.load()) std::this_thread::yield();
    return file_call(service, FileOperation::write, upload.id, 0, 0, http_bytes);
  });
  auto rdp = std::async(std::launch::async, [&] {
    while (!start.load()) std::this_thread::yield();
    return drive.write(0, file.handle, 0, drive_bytes);
  });
  start.store(true);
  const auto a = http.get();
  const auto b = rdp.get();
  REQUIRE((a.status == StoreStatus::ok) != (b.status == DriveStatus::ok));
  REQUIRE((a.status == StoreStatus::ok || a.status == StoreStatus::limit));
  REQUIRE((b.status == DriveStatus::ok || b.status == DriveStatus::limit));
  REQUIRE(file_call(service, FileOperation::abort, upload.id).status == StoreStatus::ok);
  REQUIRE(drive.write(0, file.handle, 0, drive_bytes).status == DriveStatus::ok);
  REQUIRE(file_call(service, FileOperation::open_download, file.info.id).status == StoreStatus::ok);
  REQUIRE(drive.write(0, file.handle, 0, drive_bytes).status == DriveStatus::busy);
  REQUIRE(drive.resize(0, file.handle, 0) == DriveStatus::busy);
  REQUIRE(file_call(service, FileOperation::read, file.info.id, 0, 8).data ==
            std::vector<std::uint8_t>(drive_bytes.begin(), drive_bytes.end()));
  REQUIRE(file_call(service, FileOperation::close_download, file.info.id).status == StoreStatus::ok);
  REQUIRE(drive.close(0, file.handle) == DriveStatus::ok);
  drive.retire();
  REQUIRE(service.shutdown() == StoreStatus::ok);
}
TEST_CASE("Drive backend concurrent alias writers retain exact bytes and bounded shared growth") {
  Fixture fixture;
  OwnedStore owned(fixture, {{8, 8, 8}, 4096});
  auto &owner = owned.value;
  std::vector<ScopedSandbox> shares;
  for (unsigned i = 0; i < 2; ++i) {
    auto scope = owner.scope(0, RootAccess::read_write);
    REQUIRE(scope.first == StoreStatus::ok);
    shares.push_back(std::move(scope.second));
  }
  DriveSession drive(std::move(shares));
  const auto first = drive.open(0, create_drive_file("file"));
  REQUIRE(first.status == DriveStatus::ok);
  auto request = create_drive_file("file");request.disposition = DriveDisposition::open;
  const auto second = drive.open(1, request);
  REQUIRE(second.status == DriveStatus::ok);
  const std::array<std::uint8_t, 4> a{0, 255, 1, 254}, b{2, 253, 3, 252};
  auto writer = std::async(std::launch::async, [&] { return drive.write(0, first.handle, 0, a); });
  const auto other = drive.write(1, second.handle, 4, b);
  REQUIRE(writer.get().status == DriveStatus::ok);
  REQUIRE(other.status == DriveStatus::ok);
  REQUIRE(owner.usage().bytes == 8);
  std::array<std::uint8_t, 8> bytes{};
  REQUIRE(drive.read(1, second.handle, 0, bytes).status == DriveStatus::ok);
  REQUIRE(std::equal(a.begin(), a.end(), bytes.begin()));
  REQUIRE(std::equal(b.begin(), b.end(), bytes.begin() + 4));
  REQUIRE(drive.close(0, first.handle) == DriveStatus::ok);
  REQUIRE(drive.close(1, second.handle) == DriveStatus::ok);
}
namespace {
namespace wire = bridge::files::rdpdr;
void little(std::vector<std::uint8_t> &bytes, std::uint64_t value, unsigned count) {
  for (unsigned i = 0; i < count; ++i) bytes.push_back(static_cast<std::uint8_t>(value >> (8U * i)));
}
std::uint64_t get_little(const std::vector<std::uint8_t> &bytes, std::size_t offset, unsigned count) {
  REQUIRE(offset + count <= bytes.size());
  std::uint64_t value = 0;
  for (unsigned i = 0; i < count; ++i) value |= std::uint64_t(bytes[offset + i]) << (8U * i);
  return value;
}
std::vector<std::uint8_t> unicode(std::u16string_view text, bool terminated = true) {
  std::vector<std::uint8_t> bytes;
  for (const auto unit : text) little(bytes, unit, 2);
  if (terminated) little(bytes, 0, 2);
  return bytes;
}
std::vector<std::uint8_t> wire_create(std::u16string_view path, std::uint32_t rights = 0xc0010080U,
                                      std::uint32_t mode = 2, std::uint32_t options = 64) {
  const auto name = unicode(path);
  std::vector<std::uint8_t> body;
  little(body, rights, 4);little(body, 0, 8);little(body, 0x80, 4);little(body, 7, 4);
  little(body, mode, 4);little(body, options, 4);little(body, name.size(), 4);
  body.insert(body.end(), name.begin(), name.end());return body;
}
std::vector<std::uint8_t> wire_io(std::uint32_t count, std::uint64_t offset,
                                  ::bridge::compat::span<const std::uint8_t> payload = {}) {
  std::vector<std::uint8_t> body;little(body, count, 4);little(body, offset, 8);
  body.resize(32, 0x71); // Reserved padding is ignored, not required to be zero.
  body.insert(body.end(), payload.begin(), payload.end());return body;
}
std::vector<std::uint8_t> wire_info(std::uint32_t kind, std::vector<std::uint8_t> data = {}) {
  std::vector<std::uint8_t> body;little(body, kind, 4);little(body, data.size(), 4);
  body.resize(32, 0x39);body.insert(body.end(), data.begin(), data.end());return body;
}
std::uint32_t wire_open(wire::Wire &peer, std::u16string_view name, std::uint32_t rights = 0xc0010080U,
                         std::uint32_t mode = 2, std::uint32_t options = 64) {
  const auto result = peer.request(0, 0, 0, wire_create(name, rights, mode, options));
  REQUIRE_FALSE(result.malformed);REQUIRE(result.status == wire::NtStatus::success);
  REQUIRE(result.bytes.size() == 5);
  return static_cast<std::uint32_t>(get_little(result.bytes, 0, 4));
}
std::vector<std::uint8_t> xrdp_lookup(std::u16string_view name) {
  auto bytes = wire_create(name, 0x00100080U, 1, 0x20);
  std::fill_n(bytes.begin() + 12, 4, std::uint8_t{0});
  return bytes;
}
std::uint32_t xrdp_lookup_open(wire::Wire &peer, std::u16string_view name) {
  const auto opened = peer.request(0, 0, 0, xrdp_lookup(name));
  REQUIRE(opened.status == wire::NtStatus::success);
  return static_cast<std::uint32_t>(get_little(opened.bytes, 0, 4));
}
std::vector<std::uint8_t> wire_directory(std::uint32_t kind, std::u16string_view pattern,
                                         bool initial = true) {
  const auto name = unicode(pattern);
  std::vector<std::uint8_t> body;little(body, kind, 4);little(body, initial ? 1 : 0, 1);
  little(body, initial ? name.size() : 0xffffffffU, 4);body.resize(32, 0x83);
  if (initial) body.insert(body.end(), name.begin(), name.end());
  return body;
}
} // namespace
TEST_CASE("RDPDR UTF16 paths are virtual-root relative and reject ambiguous or escaping encodings") {
  REQUIRE(wire::path(unicode(u"\\Каталог\\日本語😀.txt"), true) == std::optional<std::string>{"Каталог/日本語😀.txt"});
  REQUIRE(wire::path(unicode(u"\\"), true) == std::optional<std::string>{""});
  REQUIRE(wire::path(unicode(u"file", false), false) == std::optional<std::string>{"file"});
  for (const auto name : {u"\\\\server\\share", u"C:\\file", u"\\..\\file", u"a\\..\\file",
                          u"a\\\\b", u"NUL.txt", u"file:ads", u"file.", u"file "})
    REQUIRE_FALSE(wire::path(unicode(name), true));
  REQUIRE_FALSE(wire::path(std::array<std::uint8_t, 1>{0}, true));
  REQUIRE_FALSE(wire::path(std::array<std::uint8_t, 4>{0, 0xd8, 0, 0}, true));
  REQUIRE_FALSE(wire::path(std::array<std::uint8_t, 6>{'a', 0, 0, 0, 'b', 0}, false));
  REQUIRE_FALSE(wire::path(unicode(u"file", false), true));
  REQUIRE_FALSE(wire::path(std::vector<std::uint8_t>(8198), true));
}
TEST_CASE("RDPDR scalar ingress bounds advertised allocation and incomplete-message lifetime before SDK dispatch") {
  wire::Ingress oversized;
  REQUIRE_FALSE(oversized.admit(4, wire::maximum_request_bytes + 25, true, false, 1));
  REQUIRE_FALSE(oversized.poll(2));
  wire::Ingress stream;
  REQUIRE(stream.admit(2, 8, true, false, 10));
  REQUIRE(stream.admit(3, 8, false, false, 11));
  REQUIRE(stream.admit(3, 8, false, true, 12));
  REQUIRE(stream.admit(4, 4, true, true, 13));
  REQUIRE_FALSE(stream.admit(1, 4, false, false, 14));
  wire::Ingress deadline;
  REQUIRE(deadline.admit(1, 4, true, false, 1));
  REQUIRE(deadline.poll(10000));
  REQUIRE_FALSE(deadline.poll(10001));
  wire::Ingress clock;
  REQUIRE(clock.poll(2));REQUIRE_FALSE(clock.poll(1));
  wire::Ingress overlap;
  REQUIRE(overlap.admit(1, 4, true, false, 1));
  REQUIRE_FALSE(overlap.admit(1, 4, true, false, 2));
  wire::Ingress fragments;
  for (unsigned n = 0; n < 4096; ++n) REQUIRE(fragments.admit(1, 4097, n == 0, false, n));
  REQUIRE_FALSE(fragments.admit(1, 4097, false, true, 4096));
  wire::Ingress early_last;
  REQUIRE_FALSE(early_last.admit(1, 4, true, true, 1));
}
TEST_CASE("RDPDR codec creates files and splits large writes while bounding read responses") {
  Fixture fixture;OwnedStore owned(fixture, {{1048576, 1048576, 8}, 4096});
  DriveSession drive(drive_shares(owned.value));wire::Wire peer(drive, 0);
  const auto key = wire_open(peer, u"\\file");
  std::vector<std::uint8_t> payload(131079);
  for (std::size_t i = 0; i < payload.size(); ++i) payload[i] = static_cast<std::uint8_t>(i * 31);
  const auto written = peer.request(4, 0, key, wire_io(static_cast<std::uint32_t>(payload.size()), 0, payload));
  REQUIRE(written.status == wire::NtStatus::success);
  REQUIRE(written.bytes == std::vector<std::uint8_t>{7, 0, 2, 0, 0});
  std::vector<std::uint8_t> copy;
  while (copy.size() < payload.size()) {
    const auto read = peer.request(3, 0, key, wire_io(200000, copy.size()));
    REQUIRE(read.status == wire::NtStatus::success);
    REQUIRE(read.bytes.size() <= wire::maximum_reply_bytes);
    REQUIRE(get_little(read.bytes, 0, 4) == read.bytes.size() - 4);
    copy.insert(copy.end(), read.bytes.begin() + 4, read.bytes.end());
  }
  REQUIRE(copy == payload);
  const auto refused = peer.request(3, 0, key, wire_io(1048577, 0));
  REQUIRE_FALSE(refused.malformed);REQUIRE(refused.status == wire::NtStatus::invalid_parameter);
  const auto volume = peer.request(10, 0, key, wire_info(3));
  REQUIRE(volume.status == wire::NtStatus::success);
  REQUIRE(get_little(volume.bytes, 4, 8) == 256);
  REQUIRE(get_little(volume.bytes, 12, 8) == 223);
  const auto standard = peer.request(5, 0, key, wire_info(5));
  REQUIRE(standard.status == wire::NtStatus::success);
  REQUIRE(standard.bytes.size() == 26); // RDPDR omits the FSCC trailing reserved bytes.
  REQUIRE(get_little(standard.bytes, 12, 8) == payload.size());
  const auto empty = peer.request(4, 0, key, wire_io(0, 0x7fffffffffffffffULL));
  REQUIRE(empty.status == wire::NtStatus::success);
  REQUIRE(owned.value.usage().bytes == payload.size());
}
TEST_CASE("RDPDR canonical rename and delete requests preserve handle identity and return exact fields") {
  Fixture fixture;OwnedStore owned(fixture);
  DriveSession drive(drive_shares(owned.value));wire::Wire peer(drive, 0);
  const auto key = wire_open(peer, u"file");
  auto name = unicode(u"\\renamed.bin", false);
  std::vector<std::uint8_t> rename{0, 0};little(rename, name.size(), 4);
  rename.insert(rename.end(), name.begin(), name.end());
  const auto result = peer.request(6, 0, key, wire_info(10, rename));
  REQUIRE(result.status == wire::NtStatus::success);
  REQUIRE(result.bytes.size() == 4);
  REQUIRE(drive.info(0, key).info.name == "renamed.bin");
  rename[1] = 1;
  REQUIRE(peer.request(6, 0, key, wire_info(10, rename)).malformed);
  REQUIRE(drive.info(0, key).info.name == "renamed.bin");
  REQUIRE(peer.request(6, 0, key, wire_info(13, {1})).status == wire::NtStatus::success);
  REQUIRE(peer.request(0, 0, 0, wire_create(u"renamed.bin", 0x80000080U, 1)).status == wire::NtStatus::delete_pending);
  const auto standard = peer.request(5, 0, key, wire_info(5));
  REQUIRE(standard.bytes[24] == 1);
  REQUIRE(peer.request(2, 0, key, std::vector<std::uint8_t>(32, 0xa7)).status == wire::NtStatus::success);
  REQUIRE(owned.value.usage().entries == 0);
  REQUIRE(peer.request(3, 0, key, wire_io(1, 0)).status == wire::NtStatus::invalid_handle);
}
TEST_CASE("RDPDR directory cursors use bounded Unicode globs and the protocol-specific response layouts") {
  Fixture fixture;OwnedStore owned(fixture);
  DriveSession drive(drive_shares(owned.value));wire::Wire peer(drive, 0);
  for (const auto name : {u"one.txt", u"Ж.txt", u"not.bin"}) {
    const auto key = wire_open(peer, name);
    REQUIRE(peer.request(2, 0, key, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  }
  const auto root = wire_open(peer, u"\\", 0x80000080U, 1, 1);
  const auto a = peer.request(12, 1, root, wire_directory(3, u"\\*.txt"));
  REQUIRE(a.status == wire::NtStatus::success);
  REQUIRE(get_little(a.bytes, 0, 4) == 93 + 14);
  REQUIRE(a.bytes.size() == 4 + 93 + 14);
  const auto b = peer.request(12, 1, root, wire_directory(12, u"ignored", false));
  REQUIRE(b.status == wire::NtStatus::success);
  REQUIRE(wire::path({b.bytes.data() + 16, b.bytes.size() - 16}, false) == std::optional<std::string>{"Ж.txt"});
  REQUIRE(peer.request(12, 1, root, wire_directory(12, u"", false)).status == wire::NtStatus::no_more_files);
  REQUIRE(peer.request(12, 1, root, wire_directory(12, u"\\?.txt")).status == wire::NtStatus::success);
  REQUIRE(peer.request(12, 1, root, wire_directory(12, u"\\missing*")).status == wire::NtStatus::no_such_file);
  REQUIRE(peer.request(12, 1, root, wire_directory(12, u"\\other\\*")).status == wire::NtStatus::invalid_parameter);
}
TEST_CASE("RDPDR directory enumeration includes its virtual self entry without charging a file or exposing a parent") {
  Fixture fixture;OwnedStore owned(fixture);
  DriveSession drive(drive_shares(owned.value));wire::Wire peer(drive, 0), ro(drive, 1);
  const auto root = wire_open(peer, u"", 0x80000080U, 1, 1);
  const auto readonly = wire_open(ro, u"", 0x80000080U, 1, 1);
  for (const auto kind : {1U, 2U, 3U, 12U}) {
    const auto entry = peer.request(12, 1, root, wire_directory(kind, u"*"));
    REQUIRE(entry.status == wire::NtStatus::success);
    const auto header = kind == 12 ? 12U : kind == 1 ? 64U : kind == 2 ? 68U : 93U;
    REQUIRE(entry.bytes.size() == 4 + header + 2);
    REQUIRE(get_little(entry.bytes, 4 + header, 2) == '.');
    REQUIRE(peer.request(12, 1, root, wire_directory(kind, u"", false)).status == wire::NtStatus::no_more_files);
  }
  const auto ro_entry = ro.request(12, 1, readonly, wire_directory(1, u"*"));
  REQUIRE(ro_entry.status == wire::NtStatus::success);
  REQUIRE((get_little(ro_entry.bytes, 60, 4) & (file_readonly | file_directory)) == (file_readonly | file_directory));
  REQUIRE(peer.request(12, 1, root, wire_directory(12, u"missing*")).status == wire::NtStatus::no_such_file);
  REQUIRE(owned.value.usage().entries == 0);
  const auto child = wire_open(peer, u"file");
  REQUIRE(peer.request(2, 0, child, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  REQUIRE(peer.request(12, 1, root, wire_directory(12, u"*")).status == wire::NtStatus::success);
  const auto self = peer.request(12, 1, root, wire_directory(12, u"", false));
  REQUIRE(self.status == wire::NtStatus::success);
  REQUIRE(self.bytes.size() == 18);REQUIRE(get_little(self.bytes, 16, 2) == '.');
  REQUIRE(peer.request(12, 1, root, wire_directory(12, u"", false)).status == wire::NtStatus::no_more_files);
  REQUIRE(owned.value.usage().entries == 1);
}
TEST_CASE("RDPDR malformed lengths are rejected before file mutation and unsupported requests stay explicit") {
  Fixture fixture;OwnedStore owned(fixture);
  DriveSession drive(drive_shares(owned.value));wire::Wire peer(drive, 0);
  const auto valid = wire_create(u"file");
  for (std::size_t length = 0; length < valid.size(); ++length) {
    const auto result = peer.request(0, 0, 0, {valid.data(), length});
    REQUIRE(result.status == wire::NtStatus::invalid_parameter);
    REQUIRE(result.malformed);
    REQUIRE(owned.value.usage().entries == 0);
  }
  REQUIRE(peer.request(0, 0, 0, std::vector<std::uint8_t>(wire::maximum_request_bytes + 1)).malformed);
  REQUIRE(peer.request(0, 0, 0, wire_create(u"..\\escape")).status == wire::NtStatus::invalid_parameter);
  const auto key = wire_open(peer, u"file");
  REQUIRE(peer.request(6, 0, key, wire_info(4, std::vector<std::uint8_t>(36))).status == wire::NtStatus::success);
  REQUIRE(peer.request(17, 0, key, {}).status == wire::NtStatus::not_supported);
  REQUIRE(peer.request(3, 0, key, wire_io(8, 0x7fffffffffffffffULL)).malformed);
  REQUIRE(peer.request(4, 0, key, wire_io(3, 0, std::array<std::uint8_t, 2>{1, 2})).malformed);
  REQUIRE(owned.value.usage().bytes == 0);
}
namespace {
std::vector<std::uint8_t> basic_body(const FileBasic &basic, bool reserved = false) {
  std::vector<std::uint8_t> body;
  for (const auto time : basic.times) little(body, time, 8);
  little(body, basic.attributes, 4);
  if (reserved) little(body, 0xfefdfcfbU, 4);
  return body;
}
} // namespace
TEST_CASE("RDPDR basic metadata roundtrips across aliases and packed directory responses without changing data or quota") {
  Fixture fixture;OwnedStore owned(fixture);
  DriveSession drive(drive_shares(owned.value));wire::Wire peer(drive, 0), ro(drive, 1);
  const auto key = wire_open(peer, u"metadata");
  const auto before = peer.request(5, 0, key, wire_info(4));
  REQUIRE(before.status == wire::NtStatus::success);REQUIRE(before.bytes.size() == 40);
  for (unsigned i = 0; i < 4; ++i) REQUIRE(get_little(before.bytes, 4 + i * 8, 8) > 116444736000000000ULL);
  FileBasic set{{132000000000000001ULL, 132000000000000002ULL,
                 132000000000000003ULL, 132000000000000004ULL}, file_hidden | file_system | file_archive};
  const auto budget = owned.value.usage();
  for (const bool reserved : {false, true}) {
    REQUIRE(peer.request(6, 0, key, wire_info(4, basic_body(set, reserved))).status == wire::NtStatus::success);
    const auto actual = peer.request(5, 0, key, wire_info(4));
    for (unsigned i = 0; i < 4; ++i) REQUIRE(get_little(actual.bytes, 4 + i * 8, 8) == set.times[i]);
    REQUIRE(get_little(actual.bytes, 36, 4) == set.attributes);
  }
  const auto alias = wire_open(ro, u"metadata", 0x80U, 1);
  const auto actual = ro.request(5, 0, alias, wire_info(4));
  REQUIRE(get_little(actual.bytes, 4, 8) == set.times[0]);
  REQUIRE(get_little(actual.bytes, 36, 4) == (set.attributes | file_readonly));
  const auto root = wire_open(peer, u"\\", 0x80000000U, 1, 1);
  for (const auto kind : {1U, 2U, 3U}) {
    const auto listing = peer.request(12, 1, root, wire_directory(kind, u"*"));
    REQUIRE(listing.status == wire::NtStatus::success);
    for (unsigned i = 0; i < 4; ++i) REQUIRE(get_little(listing.bytes, 12 + i * 8, 8) == set.times[i]);
    REQUIRE(get_little(listing.bytes, 60, 4) == set.attributes);
  }
  REQUIRE(owned.value.usage().bytes == budget.bytes);REQUIRE(owned.value.usage().entries == budget.entries);
  REQUIRE(peer.request(2, 0, alias, std::vector<std::uint8_t>(32)).status == wire::NtStatus::invalid_handle);
}
TEST_CASE("Session file read-only attributes bind HTTP and existing drive views while metadata authority can clear them") {
  Fixture fixture;OwnedStore owned(fixture);
  auto &owner = owned.value;DriveSession drive(drive_shares(owner));
  auto request = create_drive_file("file");request.access = request.access | DriveAccess::metadata_write;
  const auto opened = drive.open(0, request);REQUIRE(opened.status == DriveStatus::ok);
  auto http = owner.open(opened.info.id, RootAccess::read_write);REQUIRE(http.status == StoreStatus::ok);
  const std::array<std::uint8_t, 1> data{42};
  REQUIRE(drive.write(0, opened.handle, 0, data).status == DriveStatus::ok);
  REQUIRE(drive.set_basic(0, opened.handle, {{}, file_readonly | file_hidden}) == DriveStatus::ok);
  REQUIRE(drive.write(0, opened.handle, 0, data).status == DriveStatus::denied);
  REQUIRE(drive.resize(0, opened.handle, 4) == DriveStatus::denied);
  REQUIRE(http.view.write(0, data).status == StoreStatus::denied);
  REQUIRE(http.view.append(data).status == StoreStatus::denied);
  REQUIRE(http.view.resize(2) == StoreStatus::denied);
  REQUIRE(owner.open(opened.info.id, RootAccess::read_write).status == StoreStatus::denied);
  REQUIRE(drive.remove_on_close(0, opened.handle, true) == DriveStatus::denied);
  REQUIRE(drive.rename(0, opened.handle, "renamed") == DriveStatus::denied);
  std::array<std::uint8_t, 1> output{};
  REQUIRE(drive.read(0, opened.handle, 0, output).status == DriveStatus::ok);REQUIRE(output == data);
  REQUIRE(drive.set_basic(0, opened.handle, {{}, file_normal}) == DriveStatus::ok);
  REQUIRE(http.view.write(0, data).status == StoreStatus::ok);
  http.view.close();REQUIRE(drive.close(0, opened.handle) == DriveStatus::ok);
  auto scope = owner.scope(0, RootAccess::read_write);REQUIRE(scope.first == StoreStatus::ok);
  REQUIRE(scope.second.set_basic(opened.info.id, {{}, file_readonly}) == StoreStatus::ok);
  REQUIRE(owner.rename(opened.info.id, 0, "renamed") == StoreStatus::denied);
  REQUIRE(owner.remove(opened.info.id) == StoreStatus::denied);
  const auto temporary = owner.begin_upload(0, "file");REQUIRE(temporary.status == StoreStatus::ok);
  REQUIRE(owner.publish_upload(temporary.info.id, true).status == StoreStatus::denied);
  REQUIRE(owner.remove(temporary.info.id) == StoreStatus::ok);
  scope.second.close();drive.retire();
  REQUIRE(owner.cleanup() == StoreStatus::ok); // Owner cleanup is not a remote delete grant.
}
TEST_CASE("RDPDR per-handle timestamp preserve and resume controls do not suppress independent writers") {
  Fixture fixture;OwnedStore owned(fixture);
  DriveSession drive(drive_shares(owned.value));
  auto request = create_drive_file("file");request.access = request.access | DriveAccess::metadata_write;
  const auto a = drive.open(0, request);REQUIRE(a.status == DriveStatus::ok);
  request.disposition = DriveDisposition::open;
  const auto b = drive.open(0, request);REQUIRE(b.status == DriveStatus::ok);
  FileBasic historical{{1, 2, 3, 4}, file_hidden};
  REQUIRE(drive.set_basic(0, a.handle, historical) == DriveStatus::ok);
  FileBasic pause;pause.times.fill(preserve_file_time);
  REQUIRE(drive.set_basic(0, a.handle, pause) == DriveStatus::ok);
  const std::array<std::uint8_t, 2> bytes{1, 2};std::array<std::uint8_t, 2> output{};
  REQUIRE(drive.write(0, a.handle, 0, bytes).status == DriveStatus::ok);
  REQUIRE(drive.read(0, a.handle, 0, output).status == DriveStatus::ok);
  REQUIRE(drive.resize(0, a.handle, 4) == DriveStatus::ok);
  REQUIRE(drive.info(0, a.handle).info.basic.times == historical.times);
  REQUIRE(drive.write(0, b.handle, 0, bytes).status == DriveStatus::ok);
  const auto other = drive.info(0, a.handle).info.basic;
  REQUIRE(other.times[0] == historical.times[0]);REQUIRE(other.times[1] == historical.times[1]);
  REQUIRE(other.times[2] > historical.times[2]);REQUIRE(other.times[3] > historical.times[3]);
  REQUIRE(drive.set_basic(0, a.handle, historical) == DriveStatus::ok);
  FileBasic resume;resume.times.fill(resume_file_time);
  REQUIRE(drive.set_basic(0, a.handle, resume) == DriveStatus::ok);
  REQUIRE(drive.write(0, a.handle, 0, bytes).status == DriveStatus::ok);
  REQUIRE(drive.read(0, a.handle, 0, output).status == DriveStatus::ok);
  const auto current = drive.info(0, a.handle).info.basic;
  REQUIRE(current.times[0] == historical.times[0]);
  for (unsigned i = 1; i < 4; ++i) REQUIRE(current.times[i] > historical.times[i]);
  REQUIRE((current.attributes & file_archive) != 0);
}
TEST_CASE("Basic metadata mutation preserves scope, download-pin, read-only and parser boundaries") {
  Fixture fixture;OwnedStore owned(fixture);
  auto &owner = owned.value;const auto file = owner.create_entry(0, "file", EntryKind::file);
  const auto dir = owner.create_entry(0, "dir", EntryKind::directory);
  auto root = owner.scope(0, RootAccess::read_write);auto limited = owner.scope(dir.info.id, RootAccess::read_write);
  REQUIRE(root.first == StoreStatus::ok);REQUIRE(limited.first == StoreStatus::ok);
  REQUIRE(limited.second.set_basic(file.info.id, {{}, file_hidden}) == StoreStatus::denied);
  auto pin = owner.open_download(file.info.id);REQUIRE(pin.status == StoreStatus::ok);
  REQUIRE(root.second.set_basic(file.info.id, {{}, file_hidden}) == StoreStatus::busy);
  pin.view.close();
  DriveSession drive(drive_shares(owner));wire::Wire peer(drive, 0), ro(drive, 1);
  const auto key = wire_open(peer, u"file", 0x100U, 1); // write attributes, no data access
  const auto reader = wire_open(ro, u"file", 0x80U, 1);
  FileBasic update{{11, 22, 33, 44}, file_hidden};
  REQUIRE(peer.request(6, 0, key, wire_info(4, basic_body(update))).status == wire::NtStatus::success);
  REQUIRE(ro.request(6, 0, reader, wire_info(4, basic_body(update))).status == wire::NtStatus::access_denied);
  for (const auto rights : {0x10U, 0x40U, 0x80U, 0x10000U}) {
    const auto unrelated = wire_open(peer, u"file", rights, 1);
    REQUIRE(peer.request(6, 0, unrelated, wire_info(4, basic_body(update))).status == wire::NtStatus::access_denied);
    REQUIRE(peer.request(2, 0, unrelated, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  }
  REQUIRE(peer.request(4, 0, key, wire_io(1, 0, std::array<std::uint8_t, 1>{1})).status == wire::NtStatus::access_denied);
  const auto stable = peer.request(5, 0, key, wire_info(4)).bytes;
  for (const auto invalid : std::array<std::uint64_t, 2>{preserve_file_time - 2, 0x8000000000000000ULL}) {
    update.times[2] = invalid;
    REQUIRE(peer.request(6, 0, key, wire_info(4, basic_body(update))).status == wire::NtStatus::invalid_parameter);
    REQUIRE(peer.request(5, 0, key, wire_info(4)).bytes == stable);
  }
  update.times[2] = 33;update.attributes = 0x400; // reparse point cannot be claimed
  REQUIRE(peer.request(6, 0, key, wire_info(4, basic_body(update))).status == wire::NtStatus::not_supported);
  REQUIRE(peer.request(5, 0, key, wire_info(4)).bytes == stable);
  auto truncated = basic_body(update);truncated.pop_back();
  REQUIRE(peer.request(6, 0, key, wire_info(4, truncated)).malformed);
  REQUIRE(peer.request(5, 0, key, wire_info(4)).bytes == stable);
  REQUIRE(root.second.set_basic(file.info.id, {{}, file_directory}) == StoreStatus::invalid);
  const auto dkey = wire_open(peer, u"dir", 0x100U, 1, 1);
  REQUIRE(peer.request(6, 0, dkey, wire_info(4, basic_body({{}, file_hidden}))).status == wire::NtStatus::success);
  REQUIRE(get_little(peer.request(5, 0, dkey, wire_info(4)).bytes, 36, 4) == (file_hidden | file_directory));
}
TEST_CASE("RDPDR capability profile advertises only implemented IO and validates completely before narrowing") {
  std::vector<std::uint8_t> valid;
  little(valid, 0x4472, 2);little(valid, 0x4350, 2);little(valid, 2, 2);little(valid, 0xa5a5, 2);
  little(valid, 1, 2);little(valid, 44, 2);little(valid, 2, 4);
  valid.resize(52, 0xff);little(valid, 4, 2);little(valid, 8, 2);little(valid, 2, 4);
  auto selected = valid;
  REQUIRE(wire::restrict_capabilities(selected));
  REQUIRE(get_little(selected, 28, 4) == wire::managed_io_mask);
  for (const auto offset : {32U, 40U, 44U}) REQUIRE(get_little(selected, offset, 4) == 0);
  REQUIRE(get_little(selected, 36, 4) == 0xffffffffU); // Unrelated negotiated PDU flags remain unchanged.
  auto subset = valid;subset[28] = 1;subset[29] = subset[30] = subset[31] = 0;
  REQUIRE(wire::restrict_capabilities(subset));REQUIRE(get_little(subset, 28, 4) == 1);
  for (std::size_t n = 0; n < valid.size(); ++n) {
    auto truncated = std::vector<std::uint8_t>(valid.begin(), valid.begin() + n);
    const auto original = truncated;
    REQUIRE_FALSE(wire::restrict_capabilities(truncated));REQUIRE(truncated == original);
  }
  for (const auto offset : {4U, 8U, 10U, 12U, 52U, 54U, 56U}) {
    auto bad = valid;bad[offset] = 0xff;const auto original = bad;
    REQUIRE_FALSE(wire::restrict_capabilities(bad));REQUIRE(bad == original);
  }
  auto other = valid;other[2] = 1;const auto original = other;
  REQUIRE(wire::restrict_capabilities(other));REQUIRE(other == original);
}
TEST_CASE("RDPDR maximum allowed opens a read-only entry with immutable reduced rights") {
  Fixture fixture;OwnedStore owned(fixture);
  DriveSession drive(drive_shares(owned.value));wire::Wire peer(drive, 0), ro(drive, 1);
  const auto writer = wire_open(peer, u"file");
  const std::array<std::uint8_t, 4> data{0, 255, 17, 128};
  REQUIRE(peer.request(4, 0, writer, wire_io(4, 0, data)).status == wire::NtStatus::success);
  REQUIRE(drive.set_basic(0, writer, {{}, file_readonly}) == DriveStatus::ok);
  REQUIRE(peer.request(2, 0, writer, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  const auto before = owned.value.usage();
  const auto reduced = wire_open(peer, u"file", 0x02000000U, 1);
  const auto alias = wire_open(ro, u"file", 0x02000000U, 1);
  const auto read = peer.request(3, 0, reduced, wire_io(4, 0));
  REQUIRE(read.status == wire::NtStatus::success);
  REQUIRE(std::vector<std::uint8_t>(read.bytes.begin() + 4, read.bytes.end()) ==
          std::vector<std::uint8_t>(data.begin(), data.end()));
  // Sharing is checked against the reduced grant, not a fabricated RW grant.
  auto shared_read = wire_create(u"file", 0x02000000U, 1);shared_read[16] = 1;
  const auto shared = peer.request(0, 0, 0, shared_read);
  REQUIRE(shared.status == wire::NtStatus::success);
  const auto shared_key = static_cast<std::uint32_t>(get_little(shared.bytes, 0, 4));
  for (const auto desired : {0x02000002U, 0x02000004U, 0x02010000U, 0x42000000U, 0x12000000U})
    REQUIRE(peer.request(0, 0, 0, wire_create(u"file", desired, 1)).status == wire::NtStatus::access_denied);
  for (const auto mode : {0U, 4U, 5U})
    REQUIRE(peer.request(0, 0, 0, wire_create(u"file", 0x02000000U, mode)).status == wire::NtStatus::access_denied);
  REQUIRE(peer.request(0, 0, 0, wire_create(u"file", 0x02000000U, 1, 0x1040)).status == wire::NtStatus::access_denied);
  auto allocation = wire_create(u"file", 0x02000000U, 1);allocation[4] = 1;
  REQUIRE(peer.request(0, 0, 0, allocation).status == wire::NtStatus::access_denied);
  REQUIRE(ro.request(6, 0, alias, wire_info(4, basic_body({{}, file_normal}))).status == wire::NtStatus::access_denied);
  REQUIRE(peer.request(4, 0, reduced, wire_io(4, 0, data)).status == wire::NtStatus::access_denied);
  REQUIRE(drive.resize(0, reduced, 8) == DriveStatus::denied);
  REQUIRE(drive.rename(0, reduced, "renamed") == DriveStatus::denied);
  REQUIRE(peer.request(6, 0, reduced, wire_info(13, {1})).status == wire::NtStatus::access_denied);
  auto download = owned.value.open_download(drive.info(0, reduced).info.id);
  REQUIRE(download.status == StoreStatus::ok);
  REQUIRE(peer.request(6, 0, reduced, wire_info(4, basic_body({{}, file_normal}))).status == wire::NtStatus::sharing_violation);
  download.view.close();
  REQUIRE(peer.request(6, 0, reduced, wire_info(4, basic_body({{}, file_normal}))).status == wire::NtStatus::success);
  // A metadata operation cannot upgrade any already-granted handle.
  REQUIRE(peer.request(4, 0, reduced, wire_io(4, 0, data)).status == wire::NtStatus::access_denied);
  REQUIRE(drive.resize(0, reduced, 8) == DriveStatus::denied);
  REQUIRE(drive.rename(0, reduced, "renamed") == DriveStatus::denied);
  REQUIRE(peer.request(6, 0, reduced, wire_info(13, {1})).status == wire::NtStatus::access_denied);
  // New maximum-allowed opens now include write; the old read-only sharing
  // handle must refuse that broader grant until its actual close.
  REQUIRE(peer.request(0, 0, 0, wire_create(u"file", 0x02000000U, 1)).status == wire::NtStatus::sharing_violation);
  REQUIRE(peer.request(2, 0, shared_key, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  const auto fresh = wire_open(peer, u"file", 0x02000000U, 1);
  REQUIRE(peer.request(4, 0, fresh, wire_io(4, 0, data)).status == wire::NtStatus::success);
  REQUIRE(owned.value.usage().bytes == before.bytes);REQUIRE(owned.value.usage().entries == before.entries);
  for (const auto key : {fresh, reduced})
    REQUIRE(peer.request(2, 0, key, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  REQUIRE(ro.request(2, 0, alias, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
}
TEST_CASE("RDPDR maximum allowed respects share policy and read-only directory entry semantics") {
  Fixture fixture;OwnedStore owned(fixture);
  DriveSession drive(drive_shares(owned.value));wire::Wire peer(drive, 0), ro(drive, 1);
  const auto dir = wire_open(peer, u"dir", 0x02000000U, 2, 1);
  REQUIRE(drive.set_basic(0, dir, {{}, file_readonly}) == DriveStatus::ok);
  REQUIRE(peer.request(2, 0, dir, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  const auto reduced = wire_open(peer, u"dir", 0x02000000U, 1, 1);
  REQUIRE(drive.remove_on_close(0, reduced, true) == DriveStatus::denied);
  REQUIRE(drive.rename(0, reduced, "other") == DriveStatus::denied);
  // The directory attribute protects its entry, not the right to create a
  // child through the independently checked writable share.
  const auto created = wire_open(peer, u"dir\\file", 0x02000000U, 2);
  const std::array<std::uint8_t, 1> data{42};
  REQUIRE(peer.request(4, 0, created, wire_io(1, 0, data)).status == wire::NtStatus::success);
  const auto reader = wire_open(ro, u"dir\\file", 0x02000000U, 1);
  REQUIRE(ro.request(3, 0, reader, wire_io(1, 0)).status == wire::NtStatus::success);
  REQUIRE(ro.request(4, 0, reader, wire_io(1, 0, data)).status == wire::NtStatus::access_denied);
  REQUIRE(drive.set_basic(1, reader, {{}, file_hidden}) == DriveStatus::denied);
  REQUIRE(drive.rename(1, reader, "dir/other") == DriveStatus::denied);
  REQUIRE(drive.remove_on_close(1, reader, true) == DriveStatus::denied);
  for (const auto desired : {0x02000002U, 0x02000004U, 0x02010000U, 0x02000100U, 0x42000000U})
    REQUIRE(ro.request(0, 0, 0, wire_create(u"dir\\file", desired, 1)).status == wire::NtStatus::access_denied);
  const auto usage = owned.value.usage();
  REQUIRE(ro.request(0, 0, 0, wire_create(u"dir\\new", 0x02000000U, 2)).status == wire::NtStatus::access_denied);
  REQUIRE(ro.request(0, 0, 0, wire_create(u"dir\\file", 0x02000000U, 1, 0x1040)).status == wire::NtStatus::access_denied);
  REQUIRE(owned.value.usage().bytes == usage.bytes);REQUIRE(owned.value.usage().entries == usage.entries);
  REQUIRE(ro.request(2, 0, reader, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  for (const auto key : {created, reduced})
    REQUIRE(peer.request(2, 0, key, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
}
TEST_CASE("RDPDR read-only devices and owner identity cannot be bypassed through policy or mixed sessions") {
  Fixture fixture;OwnedStore owned(fixture);
  DriveSession drive(drive_shares(owned.value));wire::Wire writable(drive, 0), ro(drive, 1);
  const auto key = wire_open(writable, u"file");
  REQUIRE(ro.request(0, 0, 0, wire_create(u"file", 0x40000000U, 1)).status == wire::NtStatus::access_denied);
  const auto reader = wire_open(ro, u"file", 0x02000000U, 1);
  REQUIRE(ro.request(4, 0, reader, wire_io(1, 0, std::array<std::uint8_t, 1>{1})).status == wire::NtStatus::access_denied);
  REQUIRE(ro.request(6, 0, reader, wire_info(13, {1})).status == wire::NtStatus::access_denied);
  const auto basic = ro.request(5, 0, reader, wire_info(4));
  REQUIRE(basic.status == wire::NtStatus::success);
  REQUIRE(get_little(basic.bytes, 36, 4) == file_readonly);
  REQUIRE(ro.request(5, 0, key, wire_info(5)).status == wire::NtStatus::invalid_handle);
  Fixture another;OwnedStore other(another);
  std::vector<ScopedSandbox> scopes;
  for (auto *owner : {&owned.value, &other.value}) {
    auto scope = owner->scope(0, RootAccess::read_write);
    REQUIRE(scope.first == StoreStatus::ok);scopes.push_back(std::move(scope.second));
  }
  REQUIRE_THROWS_AS(DriveSession(std::move(scopes)), std::invalid_argument);
}
TEST_CASE("RDPDR metadata-only and append-only rights do not grant arbitrary data access") {
  Fixture fixture;OwnedStore owned(fixture, {{8, 8, 8}, 4096});
  DriveSession drive(drive_shares(owned.value));wire::Wire peer(drive, 0), ro(drive, 1);
  const auto original = wire_open(peer, u"file");
  const std::array<std::uint8_t, 2> bytes{1, 2};
  REQUIRE(peer.request(4, 0, original, wire_io(2, 0, bytes)).status == wire::NtStatus::success);
  REQUIRE(peer.request(2, 0, original, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  const auto attributes_only = wire_open(peer, u"file", 0x108U, 1);
  REQUIRE(peer.request(3, 0, attributes_only, wire_io(2, 0)).status == wire::NtStatus::access_denied);
  REQUIRE(peer.request(4, 0, attributes_only, wire_io(2, 0, bytes)).status == wire::NtStatus::access_denied);
  REQUIRE(ro.request(0, 0, 0, wire_create(u"file", 0x100U, 1)).status == wire::NtStatus::access_denied);
  const auto append = wire_open(peer, u"file", 0x84U, 1);
  REQUIRE(peer.request(4, 0, append, wire_io(2, 0, bytes)).status == wire::NtStatus::success);
  REQUIRE(peer.request(4, 0, append, wire_io(2, 0, bytes)).status == wire::NtStatus::success);
  REQUIRE(drive.info(0, append).info.bytes == 6);
  REQUIRE(peer.request(3, 0, append, wire_io(2, 0)).status == wire::NtStatus::access_denied);
  std::vector<std::uint8_t> zero_size(8);
  REQUIRE(peer.request(6, 0, append, wire_info(20, zero_size)).status == wire::NtStatus::access_denied);
  REQUIRE(peer.request(0, 0, 0, wire_create(u"file", 0x00080000U, 1)).status == wire::NtStatus::access_denied);
}
TEST_CASE("Native append views serialize their end offsets against the one quota authority") {
  Fixture fixture;OwnedStore owned(fixture, {{8, 8, 8}, 4096});
  const auto file = owned.value.create_entry(0, "file", EntryKind::file);
  REQUIRE(file.status == StoreStatus::ok);
  auto first = owned.value.open(file.info.id, RootAccess::read_write);
  auto second = owned.value.open(file.info.id, RootAccess::read_write);
  REQUIRE(first.status == StoreStatus::ok);REQUIRE(second.status == StoreStatus::ok);
  const std::array<std::uint8_t, 4> a{1, 1, 1, 1}, b{2, 2, 2, 2};
  auto writer = std::async(std::launch::async, [&] { return first.view.append(a); });
  const auto other = second.view.append(b);
  REQUIRE(writer.get().status == StoreStatus::ok);REQUIRE(other.status == StoreStatus::ok);
  REQUIRE(owned.value.usage().bytes == 8);
  std::array<std::uint8_t, 8> bytes{};
  REQUIRE(first.view.read(0, bytes).status == StoreStatus::ok);
  REQUIRE((bytes == std::array<std::uint8_t, 8>{1, 1, 1, 1, 2, 2, 2, 2} ||
           bytes == std::array<std::uint8_t, 8>{2, 2, 2, 2, 1, 1, 1, 1}));
  REQUIRE(first.view.append(a).status == StoreStatus::limit);
}
TEST_CASE("XRDP delete compatibility is opt-in and grants disposition only to the canonical metadata open") {
  for (const bool enabled : {false, true}) {
    Fixture fixture;OwnedStore owned(fixture);
    const auto entry = owned.value.create_entry(0, "file", EntryKind::file);
    REQUIRE(entry.status == StoreStatus::ok);
    DriveSession drive(drive_shares(owned.value), 128, enabled);wire::Wire peer(drive, 0), ro(drive, 1);
    const auto key = xrdp_lookup_open(peer, u"file");
    REQUIRE(peer.request(5, 0, key, wire_info(4)).status == wire::NtStatus::success);
    const std::array<std::uint8_t, 1> byte{1};
    REQUIRE(peer.request(3, 0, key, wire_io(1, 0)).status == wire::NtStatus::access_denied);
    REQUIRE(peer.request(4, 0, key, wire_io(1, 0, byte)).status == wire::NtStatus::access_denied);
    REQUIRE(peer.request(6, 0, key, wire_info(4, basic_body({{}, file_hidden}))).status == wire::NtStatus::access_denied);
    REQUIRE(peer.request(6, 0, key, wire_info(20, std::vector<std::uint8_t>(8))).status == wire::NtStatus::access_denied);
    REQUIRE(drive.rename(0, key, "renamed") == DriveStatus::denied);
    REQUIRE(peer.request(0x15, 0, key, {}).status == wire::NtStatus::not_supported);
    REQUIRE(ro.request(6, 0, key, wire_info(13, {1})).status == wire::NtStatus::invalid_handle);
    const auto changed = peer.request(6, 0, key, wire_info(13, {1}));
    REQUIRE(changed.status == (enabled ? wire::NtStatus::success : wire::NtStatus::access_denied));
    REQUIRE(peer.request(2, 0, key, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
    REQUIRE(owned.value.info(entry.info.id).status == (enabled ? StoreStatus::missing : StoreStatus::ok));
  }
}
TEST_CASE("XRDP compatibility preserves root, read-only, sharing and native download-pin boundaries") {
  Fixture fixture;OwnedStore owned(fixture);
  const auto entry = owned.value.create_entry(0, "file", EntryKind::file);REQUIRE(entry.status == StoreStatus::ok);
  DriveSession drive(drive_shares(owned.value), 128, true);wire::Wire peer(drive, 0), ro(drive, 1);
  const auto root = xrdp_lookup_open(peer, u"");
  REQUIRE(peer.request(6, 0, root, wire_info(13, {1})).status == wire::NtStatus::access_denied);
  const auto readonly = xrdp_lookup_open(ro, u"file");
  REQUIRE(ro.request(6, 0, readonly, wire_info(13, {1})).status == wire::NtStatus::access_denied);
  REQUIRE(ro.request(2, 0, readonly, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  auto scope = owned.value.scope(0, RootAccess::read_write);REQUIRE(scope.first == StoreStatus::ok);
  REQUIRE(scope.second.set_basic(entry.info.id, {{}, file_readonly}) == StoreStatus::ok);
  const auto key = xrdp_lookup_open(peer, u"file"); // Metadata lookup still works on readonly files.
  REQUIRE(peer.request(6, 0, key, wire_info(13, {1})).status == wire::NtStatus::access_denied);
  REQUIRE(scope.second.set_basic(entry.info.id, {{}, file_normal}) == StoreStatus::ok);
  auto reader = wire_create(u"file", 0x80000000U, 1);reader[16] = 1; // no share-delete
  const auto opened = peer.request(0, 0, 0, reader);REQUIRE(opened.status == wire::NtStatus::success);
  const auto reader_key = static_cast<std::uint32_t>(get_little(opened.bytes, 0, 4));
  REQUIRE(peer.request(6, 0, key, wire_info(13, {1})).status == wire::NtStatus::sharing_violation);
  REQUIRE(peer.request(2, 0, reader_key, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  auto pinned = owned.value.open_download(entry.info.id);REQUIRE(pinned.status == StoreStatus::ok);
  REQUIRE(peer.request(6, 0, key, wire_info(13, {1})).status == wire::NtStatus::success);
  REQUIRE(peer.request(2, 0, key, std::vector<std::uint8_t>(32)).status == wire::NtStatus::sharing_violation);
  REQUIRE(owned.value.info(entry.info.id).status == StoreStatus::ok);
  pinned.view.close();
  const auto fresh = xrdp_lookup_open(peer, u"file");
  REQUIRE(peer.request(6, 0, fresh, wire_info(13, {1})).status == wire::NtStatus::success);
  REQUIRE(peer.request(2, 0, fresh, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  REQUIRE(owned.value.info(entry.info.id).status == StoreStatus::missing);
}
TEST_CASE("XRDP compatibility joins unused mkdir handles only after an authorized legacy disposition") {
  for (const unsigned scenario : {0U, 1U, 2U, 3U, 4U, 5U}) {
    Fixture fixture;OwnedStore owned(fixture);
    DriveSession drive(drive_shares(owned.value), 128, scenario != 0);wire::Wire peer(drive, 0);
    auto create = wire_create(u"directory", 0x0016019fU, 2, 0x21);
    create[12] = scenario == 3 ? 0x12 : 0x10; // Hidden is not the XRDP mkdir selector.
    const auto made = peer.request(0, 0, 0, create);REQUIRE(made.status == wire::NtStatus::success);
    const auto creator = static_cast<std::uint32_t>(get_little(made.bytes, 0, 4));
    const auto entry = owned.value.list(0).entries.front().id;
    if (scenario == 2) // Any subsequent use makes the creator an ordinary live handle.
      REQUIRE(peer.request(5, 0, creator, wire_info(4)).status == wire::NtStatus::success);
    const auto deleting = xrdp_lookup_open(peer, u"directory");
    if (scenario == 4) {
      REQUIRE(peer.request(6, 0, deleting, wire_info(13, {0})).status == wire::NtStatus::success);
      REQUIRE(peer.request(5, 0, creator, wire_info(4)).status == wire::NtStatus::success);
    }
    if (scenario == 5) {
      REQUIRE(owned.value.create_entry(entry, "child", EntryKind::file).status == StoreStatus::ok);
      REQUIRE(peer.request(6, 0, deleting, wire_info(13, {})).status == wire::NtStatus::directory_not_empty);
      REQUIRE(peer.request(5, 0, creator, wire_info(4)).status == wire::NtStatus::success);
      continue;
    }
    REQUIRE(peer.request(6, 0, deleting, wire_info(13, {})).status ==
        (scenario == 0 ? wire::NtStatus::access_denied : wire::NtStatus::success));
    REQUIRE(peer.request(2, 0, deleting, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
    if (scenario == 1) {
      REQUIRE(owned.value.info(entry).status == StoreStatus::missing);
      REQUIRE(peer.request(5, 0, creator, wire_info(4)).status == wire::NtStatus::invalid_handle);
      REQUIRE(peer.request(2, 0, creator, std::vector<std::uint8_t>(32)).status == wire::NtStatus::invalid_handle);
      const auto fresh = wire_open(peer, u"directory", 0x0016019fU, 2, 0x21);
      REQUIRE(fresh > deleting); // Retired creator IDs never alias a replacement entry.
    } else {
      REQUIRE(owned.value.info(entry).status == StoreStatus::ok);
      REQUIRE(peer.request(2, 0, creator, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
      REQUIRE(owned.value.info(entry).status == (scenario == 0 ? StoreStatus::ok : StoreStatus::missing));
    }
  }
}
TEST_CASE("XRDP compatibility never treats near-matching ordinary handles as legacy delete candidates") {
  Fixture fixture;OwnedStore owned(fixture);
  REQUIRE(owned.value.create_entry(0, "file", EntryKind::file).status == StoreStatus::ok);
  DriveSession drive(drive_shares(owned.value), 128, true);wire::Wire peer(drive, 0);
  for (const auto &[offset, value] : std::array<std::pair<std::size_t, std::uint32_t>, 6>{
      {{0, 0x80}, {12, 0x80}, {16, 1}, {20, 3}, {24, 0}, {0, 0x100081}}}) {
    auto bytes = xrdp_lookup(u"file");
    for (unsigned n = 0; n < 4; ++n) bytes[offset + n] = static_cast<std::uint8_t>(value >> (n * 8U));
    const auto opened = peer.request(0, 0, 0, bytes);REQUIRE(opened.status == wire::NtStatus::success);
    const auto key = static_cast<std::uint32_t>(get_little(opened.bytes, 0, 4));
    REQUIRE(peer.request(6, 0, key, wire_info(13, {1})).status == wire::NtStatus::access_denied);
    REQUIRE(peer.request(2, 0, key, std::vector<std::uint8_t>(32)).status == wire::NtStatus::success);
  }
}
TEST_CASE("File service captures XRDP compatibility at successful initialization and cannot renegotiate it") {
  for (const bool enabled : {false, true}) {
    Fixture fixture;FileService service(fixture.root, true);
    REQUIRE_FALSE(service.xrdp_legacy_delete());
    REQUIRE(file_call(service, FileOperation::initialize, 8, 8, 8, {}, enabled ? 1 : 0).status == StoreStatus::ok);
    REQUIRE(service.xrdp_legacy_delete() == enabled);
    REQUIRE(file_call(service, FileOperation::initialize, 8, 8, 8, {}, enabled ? 0 : 1).status == StoreStatus::retired);
    REQUIRE(service.xrdp_legacy_delete() == enabled);
    REQUIRE(service.shutdown() == StoreStatus::ok);
    REQUIRE_FALSE(service.xrdp_legacy_delete());
  }
}
TEST_CASE("XRDP CREATE rights admit fixed-owner DAC hints without granting file or security mutation") {
  Fixture fixture;OwnedStore owned(fixture);
  DriveSession drive(drive_shares(owned.value));wire::Wire peer(drive, 0), ro(drive, 1);
  // Actual XRDP/FUSE create: read/write/append, EA, attributes, READ_CONTROL,
  // WRITE_DAC and SYNCHRONIZE. DACLs remain fixed by the session owner.
  const auto opened = peer.request(0, 0, 0, wire_create(u"created", 0x0016019fU, 2, 0x44));
  REQUIRE(opened.status == wire::NtStatus::success);
  const auto key = static_cast<std::uint32_t>(get_little(opened.bytes, 0, 4));
  const std::array<std::uint8_t, 3> data{0, 127, 255};
  REQUIRE(peer.request(4, 0, key, wire_io(3, 0, data)).status == wire::NtStatus::success);
  REQUIRE(peer.request(3, 0, key, wire_io(3, 0)).status == wire::NtStatus::success);
  REQUIRE(ro.request(0, 0, 0, wire_create(u"forbidden", 0x0016019fU, 2, 0x44)).status == wire::NtStatus::access_denied);
  const auto hint = wire_open(peer, u"created", 0x00040000U, 1);
  REQUIRE(peer.request(4, 0, hint, wire_io(3, 0, data)).status == wire::NtStatus::access_denied);
  REQUIRE(peer.request(3, 0, hint, wire_io(3, 0)).status == wire::NtStatus::access_denied);
  REQUIRE(peer.request(6, 0, hint, wire_info(4, basic_body({{}, file_hidden}))).status == wire::NtStatus::access_denied);
  REQUIRE(peer.request(6, 0, hint, wire_info(20, std::vector<std::uint8_t>(8))).status == wire::NtStatus::access_denied);
  REQUIRE(peer.request(6, 0, hint, wire_info(13, {1})).status == wire::NtStatus::access_denied);
  REQUIRE(peer.request(0x15, 0, hint, {}).status == wire::NtStatus::not_supported); // SET_SECURITY
  for (const auto denied : {0x00080000U, 0x01000000U})
    REQUIRE(peer.request(0, 0, 0, wire_create(u"created", denied, 1)).status == wire::NtStatus::access_denied);
}
#ifdef __linux__
TEST_CASE("Sandbox upload settles actual disk-full writes without publishing partial data", "[.sandbox-disk-full-control]") {
  struct statfs filesystem{};
  REQUIRE(statfs(std::filesystem::current_path().c_str(), &filesystem) == 0);
  REQUIRE(filesystem.f_type == 0x01021994);
  REQUIRE(filesystem.f_blocks * static_cast<std::uint64_t>(filesystem.f_bsize) <= 256 * 1024);
  Fixture fixture;
  OwnedStore owned(fixture, {{1024 * 1024, 512 * 1024, 2}, 4096});
  auto &store = owned.value;
  const auto upload = store.begin_upload(0, "file");
  REQUIRE(upload.status == StoreStatus::ok);
  auto writer = store.open_upload(upload.info.id);
  REQUIRE(writer.status == StoreStatus::ok);
  std::vector<std::uint8_t> bytes(maximum_io_bytes, 0x5a);
  bool full = false;
  std::uint64_t size = 0;
  for (unsigned attempt = 0; attempt < 8 && !full; ++attempt) {
    const auto result = writer.view.write(size, bytes);
    REQUIRE((result.status == StoreStatus::ok || result.status == StoreStatus::disk_full));
    REQUIRE(result.bytes <= bytes.size());
    size += result.bytes;
    REQUIRE(store.usage().bytes == size);
    REQUIRE(store.usage().reserved_bytes == 0);
    REQUIRE(store.list(0).entries.empty());
    REQUIRE(store.info(upload.info.id).status == StoreStatus::missing);
    full = result.status == StoreStatus::disk_full;
  }
  REQUIRE(full);
  REQUIRE_FALSE(store.usage().retired);
  REQUIRE(writer.view.resize(0) == StoreStatus::ok);
  REQUIRE(store.usage().bytes == 0);
  writer.view.close();
  REQUIRE(store.remove(upload.info.id) == StoreStatus::ok);
  REQUIRE(store.usage().entries == 0);
  REQUIRE(clean_store(store) == StoreStatus::ok);
}

TEST_CASE("Bounded tmpfs disk-full settles actual partial file size and allows verified cleanup", "[.disk-full-control]") {
  struct statfs filesystem{};
  REQUIRE(statfs(std::filesystem::current_path().c_str(), &filesystem) == 0);
  REQUIRE(filesystem.f_type == 0x01021994); // Dedicated bounded tmpfs profile only.
  REQUIRE(filesystem.f_blocks * static_cast<std::uint64_t>(filesystem.f_bsize) <= 256 * 1024);
  Fixture fixture;
  auto [root_status, root] = SafeRoot::open(fixture.root);
  auto [quota_status, quota] = FileQuota::create({1024 * 1024, 512 * 1024, 1});
  REQUIRE(root_status == Status::ok);
  REQUIRE(quota_status == QuotaStatus::ok);
  auto entry = quota.acquire();
  REQUIRE(entry.status == QuotaStatus::ok);
  auto opened = root.open_file("file", OpenMode::create_new);
  REQUIRE(opened.status == Status::ok);
  std::vector<std::uint8_t> bytes(maximum_io_bytes, 0x5a);
  bool full = false;
  std::uint64_t size = 0;
  for (unsigned attempt = 0; attempt < 8 && !full; ++attempt) {
    auto pending = entry.allocation.reserve_size(size + bytes.size());
    REQUIRE(pending.status == QuotaStatus::ok);
    auto result = opened.file.write(size, bytes);
    const auto actual = opened.file.size();
    REQUIRE(actual.status == Status::ok);
    REQUIRE(actual.bytes == size + result.bytes);
    REQUIRE(pending.reservation.finish(actual.bytes) == QuotaStatus::ok);
    REQUIRE(quota.snapshot().bytes == actual.bytes);
    REQUIRE(quota.snapshot().reserved_bytes == 0);
    REQUIRE((result.status == Status::ok || result.status == Status::disk_full));
    size = actual.bytes;
    full = result.status == Status::disk_full;
  }
  REQUIRE(full);
  auto shrink = entry.allocation.reserve_size(0);
  REQUIRE(shrink.status == QuotaStatus::ok);
  REQUIRE(opened.file.resize(0) == Status::ok);
  REQUIRE(shrink.reservation.finish(opened.file.size().bytes) == QuotaStatus::ok);
  REQUIRE(quota.snapshot().bytes == 0);
  opened.file = File{};
  REQUIRE(root.remove("file", EntryKind::file) == Status::ok);
  REQUIRE(entry.allocation.release() == QuotaStatus::ok);
  REQUIRE(quota.snapshot().entries == 0);
}
#endif

#if defined(__linux__) && defined(__x86_64__) && !defined(__ILP32__)
TEST_CASE("Managed roots fail closed when the kernel refuses openat2") {
  Fixture fixture;
  host_file(fixture.root / "file", "owned sentinel");
  auto [status, root] = SafeRoot::open(fixture.root);
  REQUIRE(status == Status::ok);
  const auto child = fork();
  REQUIRE(child >= 0);
  if (child == 0) {
    // Restrict this child only, simulating a pre-openat2 kernel. No global
    // injection hook or unchecked openat fallback enters production code.
    sock_filter instructions[] = {
        {BPF_LD | BPF_W | BPF_ABS, 0, 0, offsetof(seccomp_data, nr)},
        {BPF_JMP | BPF_JEQ | BPF_K, 0, 1, 437},
        {BPF_RET | BPF_K, 0, 0, SECCOMP_RET_ERRNO | ENOSYS},
        {BPF_RET | BPF_K, 0, 0, SECCOMP_RET_ALLOW}};
    sock_fprog filter{static_cast<unsigned short>(std::size(instructions)), instructions};
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 ||
        prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &filter) != 0)
      _exit(2);
    const auto unopened = SafeRoot::open(fixture.root);
    if (unopened.first != Status::unavailable || unopened.second)
      _exit(3);
    for (const auto mode : {OpenMode::read, OpenMode::read_write, OpenMode::create_new}) {
      const auto denied = root.open_file("file", mode);
      if (denied.status != Status::unavailable || denied.file)
        _exit(4);
    }
    if (root.create_directory("new") != Status::unavailable ||
        root.remove("file", EntryKind::file) != Status::unavailable ||
        root.rename("file", "new", EntryKind::file) != Status::unavailable)
      _exit(5);
    _exit(0);
  }
  int result = 0;
  pid_t waited = -1;
  do {
    waited = waitpid(child, &result, 0);
  } while (waited < 0 && errno == EINTR);
  REQUIRE(waited == child);
  REQUIRE(WIFEXITED(result));
  REQUIRE(WEXITSTATUS(result) == 0);
  REQUIRE(host_read(fixture.root / "file") == "owned sentinel");
}

TEST_CASE("Managed rename never falls back to copying or overwriting when renameat2 is unavailable") {
  Fixture fixture;
  host_file(fixture.root / "file", "source sentinel");
  host_file(fixture.root / "final", "target sentinel");
  auto [status, root] = SafeRoot::open(fixture.root);
  REQUIRE(status == Status::ok);
  const auto child = fork();
  REQUIRE(child >= 0);
  if (child == 0) {
    sock_filter instructions[] = {
        {BPF_LD | BPF_W | BPF_ABS, 0, 0, offsetof(seccomp_data, nr)},
        {BPF_JMP | BPF_JEQ | BPF_K, 0, 1, 316},
        {BPF_RET | BPF_K, 0, 0, SECCOMP_RET_ERRNO | ENOSYS},
        {BPF_RET | BPF_K, 0, 0, SECCOMP_RET_ALLOW}};
    sock_fprog filter{static_cast<unsigned short>(std::size(instructions)), instructions};
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 ||
        prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &filter) != 0)
      _exit(2);
    if (root.rename("file", "new", EntryKind::file) != Status::unavailable ||
        root.rename("file", "final", EntryKind::file, RenameMode::replace_file) != Status::unavailable)
      _exit(3);
    _exit(0);
  }
  int result = 0;
  pid_t waited = -1;
  do {
    waited = waitpid(child, &result, 0);
  } while (waited < 0 && errno == EINTR);
  REQUIRE(waited == child);
  REQUIRE(WIFEXITED(result));
  REQUIRE(WEXITSTATUS(result) == 0);
  REQUIRE(host_read(fixture.root / "file") == "source sentinel");
  REQUIRE(host_read(fixture.root / "final") == "target sentinel");
  REQUIRE_FALSE(std::filesystem::exists(fixture.root / "new"));
}
#endif
