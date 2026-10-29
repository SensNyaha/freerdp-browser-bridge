#pragma once
#include "quota.hpp"
#include "safe_root.hpp"
#include "basic.hpp"
#include <optional>
#include <string>
#include <vector>

namespace bridge::files {
using NativeFileId = std::uint64_t; // Session-local opaque key, never a pathname or authorization.
inline constexpr std::size_t maximum_sandbox_metadata = 4 * 1024 * 1024;
inline constexpr std::size_t maximum_file_page = 64;
struct SandboxLimits {
  QuotaLimits quota;
  std::size_t metadata_bytes = 1024 * 1024;
};
enum class StoreStatus { ok, invalid, missing, exists, denied, busy, limit, disk_full,
                         unavailable, retired, retained, io, not_empty };
struct FileInfo {
  NativeFileId id = 0, parent = 0;
  EntryKind kind = EntryKind::file;
  std::uint64_t bytes = 0;
  std::string name;
  FileBasic basic{};
};
struct EntryResult {
  StoreStatus status = StoreStatus::invalid;
  FileInfo info{};
};
struct FilePage {
  StoreStatus status = StoreStatus::invalid;
  NativeFileId next = 0;
  std::vector<FileInfo> entries;
};
struct StoreIo {
  StoreStatus status;
  std::size_t bytes = 0;
};
struct StoreSize {
  StoreStatus status;
  std::uint64_t bytes = 0;
};
struct SandboxState;
class Sandbox;
class ScopedSandbox;
class FileView {
  std::shared_ptr<SandboxState> state_;
  NativeFileId id_ = 0;
  File file_;
  RootAccess access_ = RootAccess::read_only;
  bool pinned_ = false;
  FileView(std::shared_ptr<SandboxState>, NativeFileId, File, RootAccess, bool = false);
  friend class Sandbox;
  friend class ScopedSandbox;

public:
  // A view's close/move must be serialized with its own IO; independent views
  // share the sandbox's synchronized owner. Keep each view alive until IO joins.
  FileView() = default;
  ~FileView();
  FileView(FileView &&) noexcept;
  FileView &operator=(FileView &&) noexcept;
  FileView(const FileView &) = delete;
  FileView &operator=(const FileView &) = delete;
  explicit operator bool() const noexcept { return state_ != nullptr; }
  StoreIo read(std::uint64_t offset, ::bridge::compat::span<std::uint8_t> output, std::uint8_t preserve = 0);
  StoreIo write(std::uint64_t offset, ::bridge::compat::span<const std::uint8_t> input, std::uint8_t preserve = 0);
  StoreIo append(::bridge::compat::span<const std::uint8_t> input, std::uint8_t preserve = 0);
  StoreStatus resize(std::uint64_t bytes, std::uint8_t preserve = 0);
  StoreSize size(); // OS-verified held-handle size, never a caller declaration.
  void close(); // Closes the OS handle before releasing its entry's open-view count.
};
struct ViewResult {
  StoreStatus status;
  FileView view;
};

// A pinned, immutable share policy over the same session owner and quota.
// IDs accepted here are native adapter keys, never browser authorization.
// Independent operations are synchronized by the owner's existing mutex.
// Close/move of this scope must join its own callers before releasing its pin.
class ScopedSandbox {
  std::shared_ptr<SandboxState> state_;
  NativeFileId root_ = 0;
  RootAccess access_ = RootAccess::read_only;
  ScopedSandbox(std::shared_ptr<SandboxState>, NativeFileId, RootAccess) noexcept;
  static std::pair<StoreStatus, ScopedSandbox> acquire(
      const std::shared_ptr<SandboxState> &, NativeFileId, RootAccess,
      std::optional<NativeFileId> = {});
  friend class Sandbox;
  friend class DriveSession;

public:
  ScopedSandbox() = default;
  ~ScopedSandbox();
  ScopedSandbox(ScopedSandbox &&) noexcept;
  ScopedSandbox &operator=(ScopedSandbox &&) noexcept;
  ScopedSandbox(const ScopedSandbox &) = delete;
  ScopedSandbox &operator=(const ScopedSandbox &) = delete;
  explicit operator bool() const noexcept { return state_ != nullptr; }
  NativeFileId root() const noexcept { return root_; }
  RootAccess access() const noexcept { return access_; }
  std::pair<QuotaLimits, QuotaSnapshot> quota() const;
  void close();
  // Empty path addresses this share root. Nonempty paths are portable relative
  // UTF-8, not host paths. Membership is checked again by every final operation.
  EntryResult resolve(std::string_view relative) const;
  EntryResult info(NativeFileId) const;
  EntryResult find_child(NativeFileId parent, std::string_view name) const;
  EntryResult create_entry(NativeFileId parent, std::string_view name, EntryKind);
  ViewResult open(NativeFileId, RootAccess);
  FilePage list(NativeFileId parent, NativeFileId after = 0,
                std::size_t count = maximum_file_page) const;
  StoreStatus rename(NativeFileId, NativeFileId parent, std::string_view name,
                     bool replace = false, std::uint8_t preserve = 0);
  StoreStatus set_basic(NativeFileId, const FileBasic &, std::uint8_t preserve = 0);
  StoreStatus remove(NativeFileId);
  std::pair<StoreStatus, ScopedSandbox> scope(NativeFileId, RootAccess) const;
};

// Trusted native owner only. HTTP/RDP callers must use authenticated/scoped
// adapters; these primitives are not a public filesystem/authorization API.
class Sandbox {
  std::shared_ptr<SandboxState> state_;
  explicit Sandbox(std::shared_ptr<SandboxState>);

public:
  Sandbox() = default;
  ~Sandbox();
  Sandbox(Sandbox &&) noexcept;
  Sandbox &operator=(Sandbox &&) = delete;
  Sandbox(const Sandbox &) = delete;
  Sandbox &operator=(const Sandbox &) = delete;
  // Takes ownership of a trusted already-private EMPTY root. Never imports
  // arbitrary existing files. Root itself remains owned by its lifecycle host.
  static std::pair<StoreStatus, Sandbox> create(SafeRoot root, SandboxLimits limits = {});
  std::pair<StoreStatus, ScopedSandbox> scope(NativeFileId root, RootAccess);
  EntryResult create_entry(NativeFileId parent, std::string_view name, EntryKind kind);
  EntryResult begin_upload(NativeFileId parent, std::string_view name);
  EntryResult publish_upload(NativeFileId id, bool replace = false);
  ViewResult open(NativeFileId id, RootAccess access);
  // Stable HTTP download: all writes/resize, including already-open writers,
  // return busy until this view closes. Namespace changes already join views.
  ViewResult open_download(NativeFileId id);
  ViewResult open_upload(NativeFileId id);
  EntryResult info(NativeFileId id) const;
  EntryResult find_child(NativeFileId parent, std::string_view name) const;
  FilePage list(NativeFileId parent, NativeFileId after = 0, std::size_t count = maximum_file_page) const;
  StoreStatus rename(NativeFileId id, NativeFileId parent, std::string_view name, bool replace = false);
  StoreStatus remove(NativeFileId id); // Also aborts an unpublished upload.
  void retire();
  StoreStatus cleanup(); // Busy until every view closes; verified known entries only.
  QuotaSnapshot usage() const;
};
} // namespace bridge::files
