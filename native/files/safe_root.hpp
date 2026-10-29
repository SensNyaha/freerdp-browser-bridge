#pragma once
#include "../compat/span.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <optional>
#include <string_view>
#include <string>
#include <utility>
#include <vector>

namespace bridge::files {
inline constexpr std::size_t maximum_path_bytes = 4096;
inline constexpr std::size_t maximum_component_bytes = 255;
inline constexpr std::size_t maximum_path_depth = 32;
inline constexpr std::size_t maximum_io_bytes = 64 * 1024;
enum class Status { ok, invalid, denied, missing, exists, disk_full, unavailable, io, not_empty, busy };
enum class OpenMode { read, read_write, create_new };
enum class EntryKind { file, directory };
enum class RenameMode { no_replace, replace_file };
enum class RootAccess { read_only, read_write };
struct IoResult {
  Status status;
  std::size_t bytes = 0; // Completed bytes remain authoritative on partial failure.
};
struct SizeResult {
  Status status;
  std::uint64_t bytes = 0;
};
struct FileIdentity {
  std::uint64_t volume = 0;
  std::array<std::uint8_t, 16> file{};
  bool operator==(const FileIdentity &other) const noexcept {
    return volume == other.volume && file == other.file;
  }
  bool operator!=(const FileIdentity &other) const noexcept { return !(*this == other); }
};
struct MetadataResult {
  Status status = Status::invalid;
  std::uint64_t bytes = 0;
  FileIdentity identity{};
};
struct EmptyResult {
  Status status = Status::invalid;
  bool empty = false;
};
inline constexpr std::size_t maximum_inventory_entries = 65540;
inline constexpr std::size_t maximum_inventory_paths = 4 * 1024 * 1024;
struct InventoryEntry {
  std::string path;
  EntryKind kind;
  MetadataResult metadata;
};
struct InventoryResult {
  Status status = Status::invalid;
  std::vector<InventoryEntry> entries;
};
// Portable UTF-8 relative names, no normalization/decoding or filesystem access.
bool valid_relative_path(std::string_view path) noexcept;

class File {
  struct Impl;
  std::unique_ptr<Impl> impl_;
  explicit File(std::unique_ptr<Impl> impl);
  friend class SafeRoot;

public:
  File();
  ~File();
  File(File &&) noexcept;
  File &operator=(File &&) noexcept;
  File(const File &) = delete;
  File &operator=(const File &) = delete;
  explicit operator bool() const noexcept;
  IoResult read(std::uint64_t offset, ::bridge::compat::span<std::uint8_t> output);
  IoResult write(std::uint64_t offset, ::bridge::compat::span<const std::uint8_t> input);
  SizeResult size();
  MetadataResult metadata();
  Status resize(std::uint64_t bytes);
};
struct OpenResult {
  Status status;
  File file;
};

class SafeRoot {
  struct Impl;
  std::unique_ptr<Impl> impl_;
  explicit SafeRoot(std::unique_ptr<Impl> impl);

public:
  SafeRoot();
  ~SafeRoot();
  SafeRoot(SafeRoot &&) noexcept;
  SafeRoot &operator=(SafeRoot &&) noexcept;
  SafeRoot(const SafeRoot &) = delete;
  SafeRoot &operator=(const SafeRoot &) = delete;
  explicit operator bool() const noexcept;
  // Trusted host supplies an already private root, never a browser-selected path.
  // Existing nonprivate roots are refused, never repaired. No file API is exposed
  // until the session owner, quota accounting and opaque-ID boundary are installed.
  static std::pair<Status, SafeRoot> open(const std::filesystem::path &private_root,
                                          RootAccess access = RootAccess::read_write);
  // Native lifecycle host only: duplicate its already-held directory handle
  // without reopening a pathname or relaxing sharing/ownership checks.
  static std::pair<Status, SafeRoot> duplicate_private(std::uintptr_t borrowed);
  OpenResult open_file(std::string_view relative, OpenMode mode) const;
  // Handle-relative private child root, same filesystem and access policy.
  std::pair<Status, SafeRoot> open_directory(std::string_view relative) const;
  MetadataResult identity() const;
  MetadataResult inspect(std::string_view relative, EntryKind kind, bool require_private = false) const;
  EmptyResult empty() const; // Bounded read of this root only; never enters children.
  // Trusted lifecycle preflight only, not a browser listing. A complete bounded
  // sorted inventory or an empty refusal; never deletes or reads file contents.
  InventoryResult inventory(std::size_t entries = maximum_inventory_entries,
                            std::size_t path_bytes = maximum_inventory_paths) const;
  // One entry only, no implicit parents or recursive deletion. Rename commits
  // atomically; replacement is an explicit file-only policy, never a directory.
  Status create_directory(std::string_view relative) const;
  Status remove(std::string_view relative, EntryKind kind,
                std::optional<FileIdentity> expected = {}) const;
  Status rename(std::string_view source, std::string_view target, EntryKind kind,
                RenameMode mode = RenameMode::no_replace) const;
};
} // namespace bridge::files
