#pragma once
#include "sandbox.hpp"
#include <map>
#include <mutex>

namespace bridge::files {
enum class DriveStatus {
  ok, invalid, missing, exists, denied, busy, limit, disk_full, unavailable,
  retired, retained, io, not_empty, invalid_handle, not_directory, is_directory,
  sharing_violation, delete_pending, handle_limit
};
// These are bridge semantics, not vendor wire values. The RDPDR adapter maps
// the pinned public FreeRDP/WinPR constants at its boundary.
enum class DriveAccess : unsigned { none = 0, read = 1, write = 2, erase = 4, append = 8, metadata_write = 16 };
constexpr DriveAccess operator|(DriveAccess a, DriveAccess b) noexcept {
  return static_cast<DriveAccess>(static_cast<unsigned>(a) | static_cast<unsigned>(b));
}
enum class DriveDisposition { open, create, open_if, overwrite, overwrite_if, supersede };
enum class DriveCreated { opened, created, overwritten, superseded };
struct DriveOpen {
  std::string_view path; // Already normalized portable relative UTF-8; empty is share root.
  DriveAccess access = DriveAccess::read;
  DriveAccess share = DriveAccess::read | DriveAccess::write | DriveAccess::erase;
  DriveDisposition disposition = DriveDisposition::open;
  std::optional<EntryKind> kind;
  std::uint64_t allocation_bytes = 0;
  bool delete_on_close = false;
  bool xrdp_legacy_delete = false; // Candidate only; authorization is checked at disposition.
  std::uint32_t attributes = 0;
  bool maximum_allowed = false; // Expand only after resolving this entry's policy/attributes.
};
struct DriveOpened {
  DriveStatus status = DriveStatus::invalid;
  std::uint32_t handle = 0;
  FileInfo info{};
  DriveCreated information = DriveCreated::opened;
};
struct DriveInfo { DriveStatus status; FileInfo info{}; bool delete_pending = false; };
struct DriveVolume {
  DriveStatus status;
  RootAccess access = RootAccess::read_only;
  std::uint64_t total = 0, available = 0;
  bool xrdp_legacy_delete = false;
};
struct DriveIo { DriveStatus status; std::size_t bytes = 0; };
struct DrivePage { DriveStatus status; NativeFileId next = 0; std::vector<FileInfo> entries{}; };

// One bounded registry for ALL shares in a session: alias drives cannot bypass
// sharing/delete-pending checks by opening the same native key through another
// device. Never performs pathname IO or owns a separate quota ledger.
class DriveSession {
  struct Handle;
  std::vector<ScopedSandbox> shares_;
  std::map<std::uint32_t, std::unique_ptr<Handle>> handles_;
  std::map<NativeFileId, std::size_t> deleting_; // Share that authorized deletion.
  const std::size_t maximum_handles_;
  const bool xrdp_legacy_delete_;
  std::uint32_t next_ = 1;
  mutable std::mutex mutex_;
  bool retired_ = false;
  Handle *handle(std::size_t share, std::uint32_t id) const;
  bool compatible(NativeFileId, DriveAccess, DriveAccess, std::uint32_t except = 0) const;
  DriveStatus pending(const ScopedSandbox &, const FileInfo &) const;
  DriveStatus close_locked(std::size_t, std::uint32_t);

public:
  explicit DriveSession(std::vector<ScopedSandbox>, std::size_t maximum_handles = 128,
                        bool xrdp_legacy_delete = false);
  ~DriveSession();
  DriveSession(const DriveSession &) = delete;
  DriveSession &operator=(const DriveSession &) = delete;
  DriveOpened open(std::size_t share, const DriveOpen &);
  DriveStatus close(std::size_t share, std::uint32_t handle);
  DriveInfo info(std::size_t share, std::uint32_t handle);
  DriveStatus set_basic(std::size_t share, std::uint32_t handle, const FileBasic &);
  DriveVolume volume(std::size_t share) const;
  DriveIo read(std::size_t share, std::uint32_t handle, std::uint64_t offset,
               ::bridge::compat::span<std::uint8_t>);
  DriveIo write(std::size_t share, std::uint32_t handle, std::uint64_t offset,
                ::bridge::compat::span<const std::uint8_t>);
  DriveStatus resize(std::size_t share, std::uint32_t handle, std::uint64_t bytes);
  DrivePage list(std::size_t share, std::uint32_t directory,
                 NativeFileId after = 0, std::size_t count = maximum_file_page);
  DriveStatus remove_on_close(std::size_t share, std::uint32_t handle, bool remove);
  DriveStatus rename(std::size_t share, std::uint32_t handle,
                     std::string_view target, bool replace = false);
  void retire(); // Call after/join channel producers; closes pins without guessing at deletion.
};
} // namespace bridge::files
