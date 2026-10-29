#pragma once
#include "safe_root.hpp"

namespace bridge::files {
inline constexpr std::string_view managed_files_component = "managed-files";
inline constexpr std::string_view managed_files_claim = ".managed-files-owned";
struct ClaimResult {
  Status status;
  bool created = false;
  FileIdentity identity{};
};
// Called only by an eligible FileService, before any managed user content.
// Immutable schema-1 ownership metadata; no credentials, filenames or file data.
ClaimResult create_managed_files_claim(const SafeRoot &runtime, const FileIdentity &container);

// Trusted lifecycle helper only. The caller independently holds the runtime
// directory/marker locks and confirms the owner endpoint absent before apply.
// A claim owns only the private .data/.uploads trees, never other runtime files.
class ManagedFilesRecovery {
  SafeRoot runtime_, container_;
  std::vector<InventoryEntry> entries_;
  std::optional<FileIdentity> container_identity_, claim_identity_;
  std::vector<std::uint8_t> claim_bytes_;
  bool prepared_ = false;

public:
  ManagedFilesRecovery() = default;
  ManagedFilesRecovery(ManagedFilesRecovery &&) noexcept = default;
  ManagedFilesRecovery &operator=(ManagedFilesRecovery &&) noexcept = default;
  ManagedFilesRecovery(const ManagedFilesRecovery &) = delete;
  ManagedFilesRecovery &operator=(const ManagedFilesRecovery &) = delete;
  static std::pair<Status, ManagedFilesRecovery> prepare(SafeRoot runtime);
  Status apply(); // Revalidates the entire plan before deleting its first entry.
};
} // namespace bridge::files
