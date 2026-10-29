#include "recovery.hpp"
#include <algorithm>
#include <array>

namespace bridge::files {
namespace {
constexpr std::array<std::uint8_t, 8> magic{'B', 'R', 'M', 'F', '0', '0', '0', '1'};
constexpr std::size_t claim_size = 56;
std::array<std::uint8_t, claim_size> encode(const FileIdentity &runtime, const FileIdentity &container) {
  std::array<std::uint8_t, claim_size> bytes{};
  std::copy(magic.begin(), magic.end(), bytes.begin());
  for (unsigned i = 0; i < 8; ++i) {
    bytes[8 + i] = static_cast<std::uint8_t>(runtime.volume >> ((7U - i) * 8U));
    bytes[32 + i] = static_cast<std::uint8_t>(container.volume >> ((7U - i) * 8U));
  }
  std::copy(runtime.file.begin(), runtime.file.end(), bytes.begin() + 16);
  std::copy(container.file.begin(), container.file.end(), bytes.begin() + 40);
  return bytes;
}
struct Claim {
  Status status;
  FileIdentity identity{};
  std::vector<std::uint8_t> bytes;
};
Claim read_claim(const SafeRoot &runtime) {
  const auto expected = runtime.inspect(managed_files_claim, EntryKind::file, true);
  if (expected.status != Status::ok) return {expected.status, {}, {}};
  auto file = runtime.open_file(managed_files_claim, OpenMode::read);
  if (file.status != Status::ok) return {file.status, {}, {}};
  const auto metadata = file.file.metadata();
  if (metadata.status != Status::ok) return {metadata.status, {}, {}};
  if (metadata.identity != expected.identity || metadata.bytes != expected.bytes || metadata.bytes > claim_size)
    return {Status::denied, {}, {}};
  std::array<std::uint8_t, claim_size + 1> bytes{};
  const auto read = file.file.read(0, bytes);
  if (read.status != Status::ok || read.bytes != metadata.bytes) return {Status::denied, {}, {}};
  return {Status::ok, metadata.identity, {bytes.begin(), bytes.begin() + static_cast<std::ptrdiff_t>(read.bytes)}};
}
bool same_inventory(const std::vector<InventoryEntry> &a, const std::vector<InventoryEntry> &b) {
  if (a.size() != b.size()) return false;
  for (std::size_t i = 0; i < a.size(); ++i)
    if (a[i].path != b[i].path || a[i].kind != b[i].kind ||
        a[i].metadata.identity != b[i].metadata.identity || a[i].metadata.bytes != b[i].metadata.bytes)
      return false;
  return true;
}
bool admitted(const std::vector<InventoryEntry> &entries) {
  // These fixed roots are declared native-owned by the claim. Uploads are
  // flat 16-digit native keys; logical names occur only under .data.
  for (const auto &entry : entries) {
    if (entry.path == ".data" || entry.path == ".uploads") {
      if (entry.kind != EntryKind::directory) return false;
    } else if (entry.path.substr(0, 6) == ".data/") {
      continue;
    } else if (entry.path.substr(0, 9) == ".uploads/") {
      const auto name = std::string_view(entry.path).substr(9);
      if (entry.kind != EntryKind::file || name.size() != 16 ||
          !std::all_of(name.begin(), name.end(), [](char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); }))
        return false;
    } else return false;
  }
  return true;
}
} // namespace
ClaimResult create_managed_files_claim(const SafeRoot &runtime, const FileIdentity &container) {
  const auto parent = runtime.identity();
  if (parent.status != Status::ok) return {parent.status};
  auto file = runtime.open_file(managed_files_claim, OpenMode::create_new);
  if (file.status != Status::ok) return {file.status};
  const auto identity = file.file.metadata();
  if (identity.status != Status::ok) return {identity.status, true};
  const auto bytes = encode(parent.identity, container);
  const auto written = file.file.write(0, bytes);
  if (written.status != Status::ok || written.bytes != bytes.size())
    return {written.status == Status::ok ? Status::io : written.status, true, identity.identity};
  const auto final = file.file.metadata();
  return {final.status == Status::ok && final.identity == identity.identity && final.bytes == claim_size ?
      Status::ok : Status::io, true, identity.identity};
}
std::pair<Status, ManagedFilesRecovery> ManagedFilesRecovery::prepare(SafeRoot runtime) {
  ManagedFilesRecovery plan;
  if (!runtime) return {Status::invalid, std::move(plan)};
  const auto parent = runtime.identity();
  if (parent.status != Status::ok) return {parent.status, std::move(plan)};
  const auto container = runtime.inspect(managed_files_component, EntryKind::directory);
  if (container.status != Status::ok && container.status != Status::missing) return {container.status, std::move(plan)};
  if (container.status == Status::ok) {
    auto opened = runtime.open_directory(managed_files_component);
    if (opened.first != Status::ok) return {opened.first, std::move(plan)};
    if (opened.second.identity().identity != container.identity) return {Status::denied, std::move(plan)};
    plan.container_ = std::move(opened.second);plan.container_identity_ = container.identity;
    auto snapshot = plan.container_.inventory();
    if (snapshot.status != Status::ok) return {snapshot.status, std::move(plan)};
    if (!admitted(snapshot.entries)) return {Status::denied, std::move(plan)};
    plan.entries_ = std::move(snapshot.entries);
  }
  const auto claim = read_claim(runtime);
  if (claim.status != Status::ok && claim.status != Status::missing) return {claim.status, std::move(plan)};
  if (claim.status == Status::ok) {
    const auto expected = encode(parent.identity, container.identity);
    // If the container is already gone, its old identity has no deletion
    // authority left to confer. Still require the exact parent-bound prefix.
    const auto compared = plan.container_identity_ ? claim.bytes.size() : std::min(std::size_t{32}, claim.bytes.size());
    if (!std::equal(claim.bytes.begin(), claim.bytes.begin() + static_cast<std::ptrdiff_t>(compared), expected.begin()))
      return {Status::denied, std::move(plan)};
    if (claim.bytes.size() != claim_size && !plan.entries_.empty()) return {Status::denied, std::move(plan)};
    plan.claim_identity_ = claim.identity;plan.claim_bytes_ = claim.bytes;
  } else if (!plan.entries_.empty()) return {Status::denied, std::move(plan)};
  plan.runtime_ = std::move(runtime);plan.prepared_ = true;
  return {Status::ok, std::move(plan)};
}
Status ManagedFilesRecovery::apply() {
  if (!prepared_) return Status::invalid;
  const auto claim = read_claim(runtime_);
  if (claim_identity_) {
    if (claim.status != Status::ok || claim.identity != *claim_identity_ || claim.bytes != claim_bytes_) return Status::denied;
  } else if (claim.status != Status::missing) return Status::denied;
  const auto container = runtime_.inspect(managed_files_component, EntryKind::directory);
  if (container_identity_) {
    if (container.status != Status::ok || container.identity != *container_identity_) return Status::denied;
    const auto current = container_.inventory();
    if (current.status != Status::ok) return current.status;
    if (!same_inventory(entries_, current.entries)) return Status::denied;
  } else if (container.status != Status::missing) return Status::denied;
  // This plan is single-use, even if a physical removal later refuses.
  prepared_ = false;
  for (auto it = entries_.rbegin(); it != entries_.rend(); ++it) {
    const auto removed = container_.remove(it->path, it->kind, it->metadata.identity);
    if (removed != Status::ok) return removed;
  }
  container_ = SafeRoot{}; // Join Windows directory pin before final removal.
  if (container_identity_) {
    const auto removed = runtime_.remove(managed_files_component, EntryKind::directory, *container_identity_);
    if (removed != Status::ok) return removed;
  }
  return claim_identity_ ? runtime_.remove(managed_files_claim, EntryKind::file, *claim_identity_) : Status::ok;
}
} // namespace bridge::files
