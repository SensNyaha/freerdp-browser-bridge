#pragma once
#include "sandbox.hpp"
#include "../ipc/files.hpp"
#include <optional>

namespace bridge::files {
// One service per worker. The host supplies its trusted private runtime directory;
// commands contain no host paths. Worker connection producers must join before
// shutdown. The service does not claim dead-process/orphan recovery acceptance.
class FileService {
  struct Transfer {
    NativeFileId id;
    std::uint64_t offset = 0, size = 0;
    FileView view;
  };
  const std::filesystem::path runtime_;
  const bool eligible_;
  bool attempted_ = false, retired_ = false, created_ = false, contents_cleaned_ = false;
  bool xrdp_legacy_delete_ = false;
  bool claim_created_ = false, container_removed_ = false;
  SafeRoot parent_;
  FileIdentity identity_, claim_identity_;
  std::optional<Sandbox> store_;
  std::optional<Transfer> upload_, download_;
  StoreStatus initialize(const ipc::files::Record &);
  ipc::files::Record execute(const ipc::files::Record &, std::vector<std::uint8_t> &);

public:
  FileService(std::filesystem::path trusted_runtime, bool owned_runtime);
  ~FileService();
  FileService(const FileService &) = delete;
  FileService &operator=(const FileService &) = delete;
  std::vector<std::uint8_t> command(::bridge::compat::span<const std::uint8_t>);
  // Trusted connection setup, serialized with command()/shutdown() before
  // channel producers start. Resulting scopes may run concurrently with IPC.
  // Subdirectory is logical session-relative UTF-8; never a host pathname.
  std::pair<StoreStatus, ScopedSandbox> scope(std::string_view subdirectory, RootAccess);
  bool xrdp_legacy_delete() const noexcept { return store_.has_value() && !retired_ && xrdp_legacy_delete_; }
  StoreStatus shutdown();
};
} // namespace bridge::files
