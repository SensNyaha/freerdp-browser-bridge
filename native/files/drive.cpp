#include "drive.hpp"
#include <algorithm>
#include <limits>
#include <stdexcept>

namespace bridge::files {
namespace {
DriveStatus convert(StoreStatus status) noexcept {
  switch (status) {
  case StoreStatus::ok: return DriveStatus::ok;
  case StoreStatus::invalid: return DriveStatus::invalid;
  case StoreStatus::missing: return DriveStatus::missing;
  case StoreStatus::exists: return DriveStatus::exists;
  case StoreStatus::denied: return DriveStatus::denied;
  case StoreStatus::busy: return DriveStatus::busy;
  case StoreStatus::limit: return DriveStatus::limit;
  case StoreStatus::disk_full: return DriveStatus::disk_full;
  case StoreStatus::unavailable: return DriveStatus::unavailable;
  case StoreStatus::retired: return DriveStatus::retired;
  case StoreStatus::retained: return DriveStatus::retained;
  case StoreStatus::io: return DriveStatus::io;
  case StoreStatus::not_empty: return DriveStatus::not_empty;
  }
  return DriveStatus::io;
}
bool has(DriveAccess mask, DriveAccess flag) noexcept {
  return (static_cast<unsigned>(mask) & static_cast<unsigned>(flag)) != 0;
}
bool valid(DriveAccess mask) noexcept { return (static_cast<unsigned>(mask) & ~31U) == 0; }
std::pair<std::string_view, std::string_view> split(std::string_view path) noexcept {
  const auto slash = path.rfind('/');
  return slash == path.npos ? std::pair{std::string_view{}, path} :
                             std::pair{path.substr(0, slash), path.substr(slash + 1)};
}
} // namespace
struct DriveSession::Handle {
  std::size_t share = 0;
  NativeFileId id = 0;
  EntryKind kind = EntryKind::file;
  DriveAccess access = DriveAccess::none, shared = DriveAccess::none;
  FileView file;
  ScopedSandbox directory;
  bool ready = false, xrdp_legacy_delete = false;
  std::uint8_t preserve = 0;
};
DriveSession::DriveSession(std::vector<ScopedSandbox> shares, std::size_t maximum_handles,
                             bool xrdp_legacy_delete)
    : shares_(std::move(shares)), maximum_handles_(maximum_handles), xrdp_legacy_delete_(xrdp_legacy_delete) {
  if (shares_.empty() || shares_.size() > 32 || !maximum_handles || maximum_handles > 128 ||
      std::any_of(shares_.begin(), shares_.end(), [&](const auto &share) {
        return !share || share.state_ != shares_.front().state_;
      }))
    throw std::invalid_argument("Invalid drive reservation");
}
DriveSession::~DriveSession() { retire(); }
DriveSession::Handle *DriveSession::handle(std::size_t share, std::uint32_t id) const {
  const auto at = handles_.find(id);
  return at != handles_.end() && at->second->ready && at->second->share == share ? at->second.get() : nullptr;
}
bool DriveSession::compatible(NativeFileId id, DriveAccess access, DriveAccess shared, std::uint32_t except) const {
  if (has(access, DriveAccess::append)) access = access | DriveAccess::write;
  for (const auto &item : handles_) {
    const auto &other = *item.second;
    if (item.first == except || !other.ready || other.id != id) continue;
    auto other_access = other.access;
    if (has(other_access, DriveAccess::append)) other_access = other_access | DriveAccess::write;
    for (const auto bit : {DriveAccess::read, DriveAccess::write, DriveAccess::erase})
      if ((has(access, bit) && !has(other.shared, bit)) ||
          (has(other_access, bit) && !has(shared, bit))) return false;
  }
  return true;
}
DriveStatus DriveSession::pending(const ScopedSandbox &scope, const FileInfo &entry) const {
  auto current = entry;
  for (unsigned depth = 0; depth <= maximum_path_depth; ++depth) {
    if (deleting_.count(current.id)) return DriveStatus::delete_pending;
    if (current.id == scope.root()) return DriveStatus::ok;
    const auto parent = scope.info(current.parent);
    if (parent.status != StoreStatus::ok) return convert(parent.status);
    current = parent.info;
  }
  return DriveStatus::invalid;
}
DriveOpened DriveSession::open(std::size_t share, const DriveOpen &request) {
  std::lock_guard lock(mutex_);
  if (retired_) return {DriveStatus::retired};
  if (share >= shares_.size() || !valid(request.access) || (static_cast<unsigned>(request.share) & ~7U) ||
      (!request.path.empty() && !valid_relative_path(request.path)) ||
      (request.kind && *request.kind != EntryKind::file && *request.kind != EntryKind::directory) ||
      request.allocation_bytes > static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max()) ||
      (request.attributes & ~basic_attribute_mask))
    return {DriveStatus::invalid};
  switch (request.disposition) {
  case DriveDisposition::open: case DriveDisposition::create: case DriveDisposition::open_if:
  case DriveDisposition::overwrite: case DriveDisposition::overwrite_if: case DriveDisposition::supersede: break;
  default: return {DriveStatus::invalid};
  }
  auto &scope = shares_[share];
  if (request.xrdp_legacy_delete &&
      (!xrdp_legacy_delete_ || scope.access() != RootAccess::read_write ||
       request.access != DriveAccess::none || request.disposition != DriveDisposition::open ||
       request.share != (DriveAccess::read | DriveAccess::write | DriveAccess::erase) ||
       request.kind || request.allocation_bytes || request.attributes || request.delete_on_close || request.maximum_allowed))
    return {DriveStatus::denied};
  if (scope.access() == RootAccess::read_only &&
       (has(request.access, DriveAccess::write) || has(request.access, DriveAccess::erase) ||
        has(request.access, DriveAccess::append) || has(request.access, DriveAccess::metadata_write)))
    return {DriveStatus::denied};
  if (handles_.size() >= maximum_handles_ || next_ == std::numeric_limits<std::uint32_t>::max())
    return {DriveStatus::handle_limit};
  auto entry = scope.resolve(request.path);
  const bool exists = entry.status == StoreStatus::ok;
  if (!exists && entry.status != StoreStatus::missing) return {convert(entry.status)};
  if (exists) {
    const auto allowed = pending(scope, entry.info);
    if (allowed != DriveStatus::ok) return {allowed};
    if ((entry.info.basic.attributes & file_readonly) &&
        (request.delete_on_close || has(request.access, DriveAccess::erase) ||
         (entry.info.kind == EntryKind::file && (has(request.access, DriveAccess::write) || has(request.access, DriveAccess::append)))))
      return {DriveStatus::denied};
  }
  if (exists && request.disposition == DriveDisposition::create) return {DriveStatus::exists};
  if (!exists && (request.disposition == DriveDisposition::open || request.disposition == DriveDisposition::overwrite))
    return {DriveStatus::missing};
  const auto kind = exists ? entry.info.kind : request.kind.value_or(EntryKind::file);
  auto granted = request.access;
  if (request.maximum_allowed) {
    // Explicit rights were checked above; MAXIMUM_ALLOWED must not conceal an
    // explicit forbidden request. The immutable grant derives from this entry,
    // never from the writable-share flag alone. No ACL/security rights exist
    // in this virtual backend. Read-only entry deletion remains bridge-denied.
    granted = granted | DriveAccess::read;
    if (scope.access() == RootAccess::read_write) {
      granted = granted | DriveAccess::metadata_write;
      if (!exists || !(entry.info.basic.attributes & file_readonly))
        granted = granted | DriveAccess::write | DriveAccess::append | DriveAccess::erase;
    }
  }
  if (request.delete_on_close && !has(granted, DriveAccess::erase)) return {DriveStatus::denied};
  if (request.kind && *request.kind != kind)
    return {kind == EntryKind::directory ? DriveStatus::is_directory : DriveStatus::not_directory};
  if ((request.attributes & file_directory) && kind != EntryKind::directory) return {DriveStatus::invalid};
  const bool truncate = exists && (request.disposition == DriveDisposition::overwrite ||
      request.disposition == DriveDisposition::overwrite_if || request.disposition == DriveDisposition::supersede);
  if (truncate && kind == EntryKind::directory) return {DriveStatus::is_directory};
  if ((truncate && !has(granted, DriveAccess::write)) ||
      (request.disposition == DriveDisposition::supersede && !has(granted, DriveAccess::erase)) ||
      (request.allocation_bytes && (!has(granted, DriveAccess::write) || kind == EntryKind::directory)))
    return {DriveStatus::denied};
  if (exists && !compatible(entry.info.id, granted, request.share)) return {DriveStatus::sharing_violation};
  if (request.delete_on_close && exists) {
    if (entry.info.id == scope.root()) return {DriveStatus::denied};
    if (kind == EntryKind::directory) {
      const auto page = scope.list(entry.info.id, 0, 1);
      if (page.status != StoreStatus::ok) return {convert(page.status)};
      if (!page.entries.empty()) return {DriveStatus::not_empty};
    }
  }
  // Reserve the bounded handle/map node before any filesystem creation or resize.
  const auto key = next_++;
  auto at = handles_.emplace(key, std::make_unique<Handle>()).first;
  auto &opened = *at->second;
  bool keep = false, created = false, marked = false;
  struct Rollback {
    DriveSession &owner; std::uint32_t key; bool &keep, &created, &marked; ScopedSandbox &scope;
    ~Rollback() {
      if (keep) return;
      const auto found = owner.handles_.find(key);
      if (found == owner.handles_.end()) return;
      const auto id = found->second->id;
      found->second->file.close();found->second->directory.close();
      owner.handles_.erase(found);
      if (marked) owner.deleting_.erase(id);
      if (created) {
        try {
          const auto removed = scope.remove(id);
          if (removed == StoreStatus::retained || removed == StoreStatus::retired) owner.retired_ = true;
        } catch (...) { owner.retired_ = true; } // Retain uncertain native entries/charges.
      }
    }
  } rollback{*this, key, keep, created, marked, scope};
  if (!exists) {
    const auto parts = split(request.path);
    const auto parent = scope.resolve(parts.first);
    if (parent.status != StoreStatus::ok) return {convert(parent.status)};
    if (parent.info.kind != EntryKind::directory) return {DriveStatus::not_directory};
    const auto allowed = pending(scope, parent.info);
    if (allowed != DriveStatus::ok) return {allowed};
    entry = scope.create_entry(parent.info.id, parts.second, kind);
    if (entry.status != StoreStatus::ok) return {convert(entry.status)};
    created = true;
  }
  opened.share = share;opened.id = entry.info.id;opened.kind = kind;
  opened.access = granted;opened.shared = request.share;
  opened.xrdp_legacy_delete = request.xrdp_legacy_delete;
  if (request.delete_on_close) {
    deleting_.emplace(entry.info.id, share);marked = true;
  }
  if (kind == EntryKind::file) {
    auto file = scope.open(entry.info.id, (has(granted, DriveAccess::write) || has(granted, DriveAccess::append))
                                           ? RootAccess::read_write : RootAccess::read_only);
    if (file.status != StoreStatus::ok) return {convert(file.status)};
    opened.file = std::move(file.view);
    if (truncate || (!exists && request.allocation_bytes)) {
      const auto resized = opened.file.resize(request.allocation_bytes);
      if (resized != StoreStatus::ok) return {convert(resized)};
    }
    const auto size = opened.file.size();
    if (size.status != StoreStatus::ok) return {convert(size.status)};
    entry.info.bytes = size.bytes;
  } else {
    auto pinned = scope.scope(entry.info.id, scope.access());
    if (pinned.first != StoreStatus::ok) return {convert(pinned.first)};
    opened.directory = std::move(pinned.second);
  }
  if ((!exists || truncate) && request.attributes) {
    FileBasic basic;basic.attributes = request.attributes;
    const auto changed = scope.set_basic(entry.info.id, basic);
    if (changed != StoreStatus::ok) return {convert(changed)};
    const auto refreshed = scope.info(entry.info.id);
    if (refreshed.status != StoreStatus::ok) return {convert(refreshed.status)};
    entry.info = refreshed.info;
  }
  opened.ready = keep = true;
  return {DriveStatus::ok, key, std::move(entry.info), !exists ? DriveCreated::created :
      (truncate ? (request.disposition == DriveDisposition::supersede ? DriveCreated::superseded : DriveCreated::overwritten) : DriveCreated::opened)};
}
DriveStatus DriveSession::close_locked(std::size_t share, std::uint32_t key) {
  auto *opened = handle(share, key);
  if (!opened) return DriveStatus::invalid_handle;
  const auto id = opened->id;
  opened->file.close();opened->directory.close();
  handles_.erase(key);
  if (!deleting_.count(id)) return DriveStatus::ok;
  for (const auto &other : handles_) if (other.second->ready && other.second->id == id) return DriveStatus::ok;
  const auto removed = shares_[deleting_.at(id)].remove(id);
  deleting_.erase(id);
  return removed == StoreStatus::missing ? DriveStatus::ok : convert(removed);
}
DriveStatus DriveSession::close(std::size_t share, std::uint32_t key) {
  std::lock_guard lock(mutex_);
  return retired_ ? DriveStatus::retired : close_locked(share, key);
}
DriveInfo DriveSession::info(std::size_t share, std::uint32_t key) {
  std::lock_guard lock(mutex_);
  if (retired_) return {DriveStatus::retired};
  const auto *opened = handle(share, key);
  if (!opened) return {DriveStatus::invalid_handle};
  const auto entry = shares_[share].info(opened->id);
  return {convert(entry.status), entry.info, deleting_.count(opened->id) != 0};
}
DriveStatus DriveSession::set_basic(std::size_t share, std::uint32_t key, const FileBasic &requested) {
  std::lock_guard lock(mutex_);
  if (retired_) return DriveStatus::retired;
  auto *opened = handle(share, key);
  if (!opened) return DriveStatus::invalid_handle;
  if (!valid_basic(requested, true)) return DriveStatus::invalid;
  if (!has(opened->access, DriveAccess::metadata_write) || shares_[share].access() != RootAccess::read_write)
    return DriveStatus::denied;
  if (deleting_.count(opened->id)) return DriveStatus::delete_pending;
  auto basic = requested;auto preserve = opened->preserve;
  for (unsigned i = 0; i < 4; ++i) {
    if (basic.times[i] == preserve_file_time) { preserve |= static_cast<std::uint8_t>(1U << i);basic.times[i] = 0; }
    else if (basic.times[i] == resume_file_time) { preserve &= static_cast<std::uint8_t>(~(1U << i));basic.times[i] = 0; }
  }
  const auto changed = shares_[share].set_basic(opened->id, basic, preserve);
  if (changed == StoreStatus::ok) opened->preserve = preserve;
  return convert(changed);
}
DriveVolume DriveSession::volume(std::size_t share) const {
  std::lock_guard lock(mutex_);
  if (retired_) return {DriveStatus::retired};
  if (share >= shares_.size()) return {DriveStatus::invalid};
  const auto value = shares_[share].quota();
  if (value.second.status != QuotaStatus::ok || value.second.retired)
    return {DriveStatus::retired};
  return {DriveStatus::ok, shares_[share].access(), value.first.bytes,
            value.first.bytes - std::min(value.first.bytes, value.second.bytes), xrdp_legacy_delete_};
}
DriveIo DriveSession::read(std::size_t share, std::uint32_t key, std::uint64_t offset,
                           ::bridge::compat::span<std::uint8_t> bytes) {
  std::lock_guard lock(mutex_);
  if (retired_) return {DriveStatus::retired};
  auto *opened = handle(share, key);
  if (!opened) return {DriveStatus::invalid_handle};
  if (opened->kind != EntryKind::file) return {DriveStatus::is_directory};
  if (!has(opened->access, DriveAccess::read)) return {DriveStatus::denied};
  const auto result = opened->file.read(offset, bytes, opened->preserve);
  return {convert(result.status), result.bytes};
}
DriveIo DriveSession::write(std::size_t share, std::uint32_t key, std::uint64_t offset,
                            ::bridge::compat::span<const std::uint8_t> bytes) {
  std::lock_guard lock(mutex_);
  if (retired_) return {DriveStatus::retired};
  auto *opened = handle(share, key);
  if (!opened) return {DriveStatus::invalid_handle};
  if (opened->kind != EntryKind::file) return {DriveStatus::is_directory};
  if (!has(opened->access, DriveAccess::write) && !has(opened->access, DriveAccess::append)) return {DriveStatus::denied};
  const auto result = has(opened->access, DriveAccess::write) ? opened->file.write(offset, bytes, opened->preserve) : opened->file.append(bytes, opened->preserve);
  return {convert(result.status), result.bytes};
}
DriveStatus DriveSession::resize(std::size_t share, std::uint32_t key, std::uint64_t bytes) {
  std::lock_guard lock(mutex_);
  if (retired_) return DriveStatus::retired;
  auto *opened = handle(share, key);
  if (!opened) return DriveStatus::invalid_handle;
  if (opened->kind != EntryKind::file) return DriveStatus::is_directory;
  if (!has(opened->access, DriveAccess::write)) return DriveStatus::denied;
  return convert(opened->file.resize(bytes, opened->preserve));
}
DrivePage DriveSession::list(std::size_t share, std::uint32_t key, NativeFileId after, std::size_t count) {
  std::lock_guard lock(mutex_);
  if (retired_) return {DriveStatus::retired};
  const auto *opened = handle(share, key);
  if (!opened) return {DriveStatus::invalid_handle};
  if (opened->kind != EntryKind::directory) return {DriveStatus::not_directory};
  if (!has(opened->access, DriveAccess::read)) return {DriveStatus::denied};
  auto page = opened->directory.list(opened->id, after, count);
  return {convert(page.status), page.next, std::move(page.entries)};
}
DriveStatus DriveSession::remove_on_close(std::size_t share, std::uint32_t key, bool remove) {
  std::lock_guard lock(mutex_);
  if (retired_) return DriveStatus::retired;
  const auto *opened = handle(share, key);
  if (!opened) return DriveStatus::invalid_handle;
  if ((!has(opened->access, DriveAccess::erase) && !opened->xrdp_legacy_delete) ||
      shares_[share].access() != RootAccess::read_write ||
      opened->id == shares_[share].root()) return DriveStatus::denied;
  if (!remove) { deleting_.erase(opened->id);return DriveStatus::ok; }
  const auto metadata = shares_[share].info(opened->id);
  if (metadata.status != StoreStatus::ok) return convert(metadata.status);
  if (metadata.info.basic.attributes & file_readonly) return DriveStatus::denied;
  for (const auto &other : handles_)
    if (other.first != key && other.second->ready && other.second->id == opened->id &&
        !has(other.second->shared, DriveAccess::erase)) return DriveStatus::sharing_violation;
  if (opened->kind == EntryKind::directory) {
    const auto page = opened->directory.list(opened->id, 0, 1);
    if (page.status != StoreStatus::ok) return convert(page.status);
    if (!page.entries.empty()) return DriveStatus::not_empty;
  }
  deleting_.emplace(opened->id, share);
  return DriveStatus::ok;
}
DriveStatus DriveSession::rename(std::size_t share, std::uint32_t key, std::string_view target, bool replace) {
  std::lock_guard lock(mutex_);
  if (retired_) return DriveStatus::retired;
  auto *opened = handle(share, key);
  if (!opened) return DriveStatus::invalid_handle;
  auto &scope = shares_[share];
  if (!has(opened->access, DriveAccess::erase) || scope.access() != RootAccess::read_write || opened->id == scope.root())
    return DriveStatus::denied;
  if (!valid_relative_path(target)) return DriveStatus::invalid;
  if (deleting_.count(opened->id)) return DriveStatus::delete_pending;
  const auto current = scope.info(opened->id);
  if (current.status != StoreStatus::ok) return convert(current.status);
  if (current.info.basic.attributes & file_readonly) return DriveStatus::denied;
  for (const auto &other : handles_)
    if (other.first != key && other.second->ready && other.second->id == opened->id) return DriveStatus::busy;
  const auto parts = split(target);
  const auto parent = scope.resolve(parts.first);
  if (parent.status != StoreStatus::ok) return convert(parent.status);
  if (parent.info.kind != EntryKind::directory) return DriveStatus::not_directory;
  const auto allowed = pending(scope, parent.info);
  if (allowed != DriveStatus::ok) return allowed;
  opened->file.close();opened->directory.close();
  const auto changed = scope.rename(opened->id, parent.info.id, parts.second, replace, opened->preserve);
  StoreStatus reopened;
  if (opened->kind == EntryKind::file) {
    auto file = scope.open(opened->id, (has(opened->access, DriveAccess::write) || has(opened->access, DriveAccess::append))
                                        ? RootAccess::read_write : RootAccess::read_only);
    reopened = file.status;opened->file = std::move(file.view);
  } else {
    auto directory = scope.scope(opened->id, scope.access());
    reopened = directory.first;opened->directory = std::move(directory.second);
  }
  return reopened != StoreStatus::ok ? convert(reopened) : convert(changed);
}
void DriveSession::retire() {
  std::lock_guard lock(mutex_);
  retired_ = true;
  handles_.clear();deleting_.clear();shares_.clear();
}
} // namespace bridge::files
