#include "sandbox.hpp"
#include <algorithm>
#include <limits>
#include <map>
#include <mutex>
#include <new>
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace bridge::files {
namespace {
constexpr std::string_view data_root = ".data", upload_root = ".uploads";
constexpr unsigned maximum_views = 256;
constexpr auto maximum_offset = static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max());
StoreStatus convert(Status status) noexcept {
  switch (status) {
  case Status::ok: return StoreStatus::ok;
  case Status::invalid: return StoreStatus::invalid;
  case Status::missing: return StoreStatus::missing;
  case Status::exists: return StoreStatus::exists;
  case Status::denied: return StoreStatus::denied;
  case Status::busy: return StoreStatus::busy;
  case Status::disk_full: return StoreStatus::disk_full;
  case Status::unavailable: return StoreStatus::unavailable;
  case Status::not_empty: return StoreStatus::not_empty;
  case Status::io: return StoreStatus::io;
  }
  return StoreStatus::io;
}
StoreStatus convert(QuotaStatus status) noexcept {
  switch (status) {
  case QuotaStatus::ok: return StoreStatus::ok;
  case QuotaStatus::invalid: return StoreStatus::invalid;
  case QuotaStatus::limit: return StoreStatus::limit;
  case QuotaStatus::retired: return StoreStatus::retired;
  case QuotaStatus::busy: return StoreStatus::busy;
  case QuotaStatus::unavailable: return StoreStatus::unavailable;
  }
  return StoreStatus::io;
}
bool valid_name(std::string_view name) noexcept {
  return name.size() <= maximum_component_bytes && name.find('/') == name.npos &&
         valid_relative_path(name);
}
bool same_name(std::string_view a, std::string_view b) noexcept {
#ifdef _WIN32
  std::array<wchar_t, maximum_component_bytes> first{}, second{};
  const auto n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, a.data(), static_cast<int>(a.size()),
                                    first.data(), static_cast<int>(first.size()));
  const auto m = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, b.data(), static_cast<int>(b.size()),
                                    second.data(), static_cast<int>(second.size()));
  return n > 0 && m > 0 && CompareStringOrdinal(first.data(), n, second.data(), m, TRUE) == CSTR_EQUAL;
#else
  return a == b;
#endif
}
std::string staged_path(NativeFileId id) {
  std::string path(upload_root);
  path.push_back('/');
  constexpr char hex[] = "0123456789abcdef";
  for (unsigned shift = 64; shift; shift -= 4)
    path.push_back(hex[(id >> (shift - 4)) & 15U]);
  return path;
}
struct Record {
  NativeFileId id, parent;
  EntryKind kind;
  std::string name, path;
  unsigned depth;
  bool staged, uncertain = true;
  std::uint64_t bytes = 0;
  unsigned views = 0;
  unsigned pins = 0;
  FileIdentity identity;
  FileBasic basic;
  QuotaAllocation allocation;
  Record(NativeFileId key, NativeFileId parent_id, EntryKind type, std::string title,
         std::string location, unsigned level, bool temporary, QuotaAllocation charge)
      : id(key), parent(parent_id), kind(type), name(std::move(title)), path(std::move(location)),
        depth(level), staged(temporary), allocation(std::move(charge)) {
    basic.times.fill(file_time_now());
    basic.attributes = kind == EntryKind::directory ? file_directory : file_archive;
  }
  std::size_t metadata_bytes() const noexcept { return name.size() + path.size(); }
  FileInfo info() const { return {id, parent, kind, bytes, name, basic}; }
};
} // namespace

struct SandboxState {
  SafeRoot root;
  FileQuota quota;
  const std::size_t metadata_limit;
  std::mutex mutex;
  std::map<NativeFileId, std::unique_ptr<Record>> records;
  std::size_t metadata_bytes = 0;
  NativeFileId next = 1;
  unsigned views = 0;
  bool retired = false, data_created = false, uploads_created = false;
  FileIdentity data_identity, upload_identity;
  FileBasic root_basic;
  SandboxState(SafeRoot storage, FileQuota budget, std::size_t limit)
      : root(std::move(storage)), quota(std::move(budget)), metadata_limit(limit) {
    root_basic.times.fill(file_time_now());root_basic.attributes = file_directory;
  }
  void stop() { retired = true; quota.retire(); }
  Record *find(NativeFileId id) const {
    const auto at = records.find(id);
    return at == records.end() ? nullptr : at->second.get();
  }
  bool directory(NativeFileId id) const {
    const auto *record = find(id);
    return id == 0 || (record && !record->staged && !record->uncertain && record->kind == EntryKind::directory);
  }
  Record *child(NativeFileId parent, std::string_view name, NativeFileId except = 0) const {
    for (const auto &entry : records) {
      auto &record = *entry.second;
      if (!record.staged && record.id != except && record.parent == parent && same_name(record.name, name))
        return &record;
    }
    return nullptr;
  }
  bool descendant(NativeFileId child_id, NativeFileId ancestor) const {
    for (unsigned depth = 0; depth <= maximum_path_depth; ++depth) {
      if (child_id == ancestor) return true;
      const auto *entry = find(child_id);
      if (!entry) return false;
      child_id = entry->parent;
    }
    return false;
  }
  StoreStatus scoped(NativeFileId root_id, NativeFileId id) {
    if (retired) return StoreStatus::retired;
    if (!directory(root_id)) return StoreStatus::missing;
    if (verify_directory(root_id) != StoreStatus::ok) return StoreStatus::retained;
    if (id == root_id) return StoreStatus::ok;
    const auto *record = find(id);
    if (!record || record->staged || record->uncertain || !descendant(id, root_id))
      return StoreStatus::denied;
    return verify(*record);
  }
  FileInfo scoped_info(NativeFileId id) const {
    return id == 0 ? FileInfo{0, 0, EntryKind::directory, 0, {}, root_basic} : find(id)->info();
  }
  std::string_view parent_path(NativeFileId id) const {
    return id == 0 ? data_root : std::string_view(find(id)->path);
  }
  unsigned child_depth(NativeFileId parent) const { return parent == 0 ? 1 : find(parent)->depth + 1; }
  StoreStatus verify(const Record &record, bool size = true) {
    const auto actual = root.inspect(record.path, record.kind);
    if (record.uncertain || actual.status != Status::ok || actual.identity != record.identity ||
        (size && actual.bytes != record.bytes)) {
      stop();
      return StoreStatus::retained;
    }
    return StoreStatus::ok;
  }
  StoreStatus verify_directory(NativeFileId id) {
    if (id != 0) return verify(*find(id));
    const auto actual = root.inspect(data_root, EntryKind::directory);
    if (actual.status == Status::ok && actual.identity == data_identity) return StoreStatus::ok;
    stop();return StoreStatus::retained;
  }
  void touch_directory(NativeFileId id) {
    auto &basic = id ? find(id)->basic : root_basic;
    const auto now = file_time_now();basic.times[2] = basic.times[3] = now;
  }
  EntryResult create(NativeFileId parent, std::string_view name, EntryKind kind, bool staged) {
    if (retired) return {StoreStatus::retired};
    if (!valid_name(name) || (kind != EntryKind::file && kind != EntryKind::directory))
      return {StoreStatus::invalid};
    if (!directory(parent)) return {StoreStatus::missing};
    if (verify_directory(parent) != StoreStatus::ok) return {StoreStatus::retained};
    if (staged) {
      const auto uploads = root.inspect(upload_root, EntryKind::directory);
      if (uploads.status != Status::ok || uploads.identity != upload_identity) {
        stop();return {StoreStatus::retained};
      }
    }
    if (!staged && child(parent, name)) return {StoreStatus::exists};
    const auto prefix = parent_path(parent);
    const auto depth = child_depth(parent);
    const auto length = staged ? upload_root.size() + 17 : prefix.size() + 1 + name.size();
    if (depth >= maximum_path_depth || prefix.size() + 1 + name.size() > maximum_path_bytes ||
        length > maximum_path_bytes || name.size() + length > metadata_limit - metadata_bytes)
      return {StoreStatus::limit};
    if (next == std::numeric_limits<NativeFileId>::max()) {
      stop();return {StoreStatus::retired};
    }
    auto charge = quota.acquire();
    if (charge.status != QuotaStatus::ok) return {convert(charge.status)};
    std::unique_ptr<Record> record;
    const auto id = next++;
    try {
      auto path = staged ? staged_path(id) : std::string(prefix) + "/" + std::string(name);
      record = std::make_unique<Record>(id, parent, kind, std::string(name), std::move(path), depth,
                                         staged, std::move(charge.allocation));
      // Allocate the map node before moving the charge-owning record. If node
      // allocation throws, the provisional charge still has a live owner.
      const auto inserted = records.try_emplace(id);
      inserted.first->second = std::move(record);
    } catch (const std::bad_alloc &) {
      // Allocation failed before OS creation, so no physical entry can exist.
      if (record) (void)record->allocation.release();
      else if (charge.allocation) (void)charge.allocation.release();
      return {StoreStatus::unavailable};
    }
    auto &entry = *records.at(id);
    metadata_bytes += entry.metadata_bytes();
    Status created = Status::io;
    MetadataResult actual;
    try {
      if (kind == EntryKind::file) {
        auto opened = root.open_file(entry.path, OpenMode::create_new);
        created = opened.status;
        if (created == Status::ok) actual = opened.file.metadata();
      } else {
        created = root.create_directory(entry.path);
        if (created == Status::ok) actual = root.inspect(entry.path, EntryKind::directory);
      }
    } catch (...) {
      stop();return {StoreStatus::retained};
    }
    if (created != Status::ok) {
      const auto check = root.inspect(entry.path, kind);
      if (created == Status::exists || check.status == Status::missing) {
        // EEXIST does not confer ownership; a verified absence also confirms
        // that no physical entry or pending IO owns this provisional charge.
        (void)entry.allocation.release();
        metadata_bytes -= entry.metadata_bytes();
        records.erase(id);
        if (created == Status::disk_full || created == Status::busy)
          return {convert(created)};
      }
      stop();return {StoreStatus::retained};
    }
    if (actual.status != Status::ok || actual.bytes != 0) {
      stop();return {StoreStatus::retained};
    }
    entry.identity = actual.identity;
    entry.uncertain = false;
    if (!staged) touch_directory(parent);
    return {StoreStatus::ok, entry.info()};
  }
  StoreStatus erase(NativeFileId id, bool cleanup = false) {
    auto *entry = find(id);
    if (!entry) return StoreStatus::missing;
    if (!cleanup && (entry->basic.attributes & file_readonly)) return StoreStatus::denied;
    if (entry->views) return StoreStatus::busy;
    for (const auto &other : records)
      if (other.second->parent == id) return StoreStatus::not_empty;
    if (verify(*entry, !cleanup) != StoreStatus::ok) return StoreStatus::retained;
    const auto result = root.remove(entry->path, entry->kind);
    if (result != Status::ok) return convert(result);
    if (!cleanup && !entry->staged) touch_directory(entry->parent);
    if (entry->allocation.release() != QuotaStatus::ok) { stop();return StoreStatus::retained; }
    metadata_bytes -= entry->metadata_bytes();
    records.erase(id);
    return StoreStatus::ok;
  }
  EntryResult publish(NativeFileId id, NativeFileId parent, std::string_view name, bool replace,
                       bool publishing, std::uint8_t preserve = 0) {
    if (retired) return {StoreStatus::retired};
    auto *entry = find(id);
    if (!entry || entry->staged != publishing || !directory(parent)) return {StoreStatus::missing};
    if (entry->basic.attributes & file_readonly) return {StoreStatus::denied};
    if (entry->views) return {StoreStatus::busy};
    if (!valid_name(name)) return {StoreStatus::invalid};
    if (verify_directory(parent) != StoreStatus::ok) return {StoreStatus::retained};
    if (entry->kind == EntryKind::directory && descendant(parent, id)) return {StoreStatus::invalid};
    if (!publishing && entry->parent == parent && entry->name == name) return {StoreStatus::ok, entry->info()};
    auto *target = child(parent, name, id);
    if (target && !replace) return {StoreStatus::exists};
    if (target && (target->basic.attributes & file_readonly)) return {StoreStatus::denied};
    if (target && (target->kind != EntryKind::file || entry->kind != EntryKind::file)) return {StoreStatus::denied};
    if (target && target->views) return {StoreStatus::busy};
    if (verify(*entry) != StoreStatus::ok || (target && verify(*target) != StoreStatus::ok))
      return {StoreStatus::retained};
    const auto prefix = parent_path(parent);
    const auto new_depth = child_depth(parent);
    if (new_depth >= maximum_path_depth || prefix.size() + 1 + name.size() > maximum_path_bytes)
      return {StoreStatus::limit};
    struct Plan { Record *entry; std::string path; unsigned depth; };
    std::size_t projected = metadata_bytes - entry->name.size() + name.size();
    const auto root_length = prefix.size() + 1 + name.size();
    for (const auto &item : records) {
      const auto &child = *item.second;
      if (child.id != id && !descendant(child.id, id)) continue;
      if (child.views && (!child.staged || child.id == id)) return {StoreStatus::busy};
      const auto length = child.staged && child.id != id ? child.path.size() :
                          (child.id == id ? root_length : root_length + child.path.size() - entry->path.size());
      const auto depth = child.depth - entry->depth + new_depth;
      if (length > maximum_path_bytes || depth >= maximum_path_depth) return {StoreStatus::limit};
      projected -= child.path.size();
      if (length > metadata_limit - std::min(projected, metadata_limit)) return {StoreStatus::limit};
      projected += length;
    }
    if (projected > metadata_limit) return {StoreStatus::limit};
    std::vector<Plan> plans;
    std::string title(name), destination = std::string(prefix) + "/" + title;
    for (const auto &item : records) {
      auto &child = *item.second;
      if (child.id != id && !descendant(child.id, id)) continue;
      plans.push_back({&child, child.staged && child.id != id ? child.path :
                               (child.id == id ? destination : destination + child.path.substr(entry->path.size())),
                       child.depth - entry->depth + new_depth});
    }
    const auto result = root.rename(entry->path, destination, entry->kind,
                                      replace ? RenameMode::replace_file : RenameMode::no_replace);
    if (result != Status::ok) return {convert(result)};
    for (auto &plan : plans) { plan.entry->path.swap(plan.path);plan.entry->depth = plan.depth; }
    const auto previous_parent = entry->parent;
    const auto was_staged = entry->staged;
    entry->name.swap(title);entry->parent = parent;entry->staged = false;
    if (!(preserve & 8U)) entry->basic.times[3] = file_time_now();
    if (!was_staged) touch_directory(previous_parent);
    touch_directory(parent);
    metadata_bytes = projected;
    if (target) {
      if (target->allocation.release() != QuotaStatus::ok) { stop();return {StoreStatus::retained}; }
      metadata_bytes -= target->metadata_bytes();
      records.erase(target->id);
    }
    if (verify(*entry) != StoreStatus::ok) return {StoreStatus::retained};
    return {StoreStatus::ok, entry->info()};
  }
};

Sandbox::Sandbox(std::shared_ptr<SandboxState> state) : state_(std::move(state)) {}
Sandbox::~Sandbox() { retire(); }
Sandbox::Sandbox(Sandbox &&) noexcept = default;
std::pair<StoreStatus, Sandbox> Sandbox::create(SafeRoot root, SandboxLimits limits) {
  if (!root || limits.metadata_bytes > maximum_sandbox_metadata) return {StoreStatus::invalid, Sandbox{}};
  auto [status, quota] = FileQuota::create(limits.quota);
  if (status != QuotaStatus::ok) return {convert(status), Sandbox{}};
  const auto empty = root.empty();
  if (empty.status != Status::ok) return {convert(empty.status), Sandbox{}};
  if (!empty.empty) return {StoreStatus::denied, Sandbox{}};
  auto state = std::make_shared<SandboxState>(std::move(root), std::move(quota), limits.metadata_bytes);
  Status result = Status::io;
  MetadataResult data, uploads;
  try {
  result = state->root.create_directory(data_root);
  state->data_created = result == Status::ok;
  if (result == Status::ok) {
    result = state->root.create_directory(upload_root);
    state->uploads_created = result == Status::ok;
  }
  data = state->data_created ? state->root.inspect(data_root, EntryKind::directory) : MetadataResult{};
  uploads = state->uploads_created ? state->root.inspect(upload_root, EntryKind::directory) : MetadataResult{};
  } catch (...) {
    // Initialization may already have created an internal directory. Return a
    // retained root to the lifecycle host rather than guessing what to unlink.
    state->stop();
    return {StoreStatus::retained, Sandbox{}};
  }
  if (result != Status::ok || data.status != Status::ok || uploads.status != Status::ok) {
    // Only known newly-created EMPTY directories are rolled back. Any unknown
    // content remains for the lifecycle host; no recursive claim is made.
    bool clean = true;
    if (state->uploads_created) clean = state->root.remove(upload_root, EntryKind::directory) == Status::ok;
    if (state->data_created) clean = state->root.remove(data_root, EntryKind::directory) == Status::ok && clean;
    const auto remaining = state->root.empty();
    state->stop();
    const auto failure = result != Status::ok ? result : (data.status != Status::ok ? data.status : uploads.status);
    return {clean && remaining.status == Status::ok && remaining.empty ? convert(failure) : StoreStatus::retained, Sandbox{}};
  }
  state->data_identity = data.identity;state->upload_identity = uploads.identity;
  return {StoreStatus::ok, Sandbox(std::move(state))};
}
EntryResult Sandbox::create_entry(NativeFileId parent, std::string_view name, EntryKind kind) {
  if (!state_) return {};
  std::lock_guard lock(state_->mutex);return state_->create(parent, name, kind, false);
}
EntryResult Sandbox::begin_upload(NativeFileId parent, std::string_view name) {
  if (!state_) return {};
  std::lock_guard lock(state_->mutex);return state_->create(parent, name, EntryKind::file, true);
}
EntryResult Sandbox::publish_upload(NativeFileId id, bool replace) {
  if (!state_) return {};
  std::lock_guard lock(state_->mutex);
  const auto *record = state_->find(id);
  return record ? state_->publish(id, record->parent, record->name, replace, true) : EntryResult{StoreStatus::missing};
}
EntryResult Sandbox::info(NativeFileId id) const {
  if (!state_) return {};
  std::lock_guard lock(state_->mutex);
  if (state_->retired) return {StoreStatus::retired};
  const auto *entry = state_->find(id);
  return entry && !entry->staged && !entry->uncertain ? EntryResult{StoreStatus::ok, entry->info()}
                                                    : EntryResult{StoreStatus::missing};
}
EntryResult Sandbox::find_child(NativeFileId parent, std::string_view name) const {
  if (!state_) return {};
  std::lock_guard lock(state_->mutex);
  if (state_->retired) return {StoreStatus::retired};
  if (!valid_name(name)) return {};
  if (!state_->directory(parent)) return {StoreStatus::missing};
  const auto *entry = state_->child(parent, name);
  return entry && !entry->uncertain ? EntryResult{StoreStatus::ok, entry->info()} : EntryResult{StoreStatus::missing};
}
FilePage Sandbox::list(NativeFileId parent, NativeFileId after, std::size_t count) const {
  if (!state_ || !count || count > maximum_file_page) return {};
  std::lock_guard lock(state_->mutex);
  if (state_->retired) return {StoreStatus::retired, 0, {}};
  if (!state_->directory(parent)) return {StoreStatus::missing, 0, {}};
  FilePage result{StoreStatus::ok, 0, {}};
  for (auto it = state_->records.upper_bound(after); it != state_->records.end(); ++it) {
    const auto &entry = *it->second;
    if (entry.parent != parent || entry.staged || entry.uncertain) continue;
    if (result.entries.size() == count) { result.next = result.entries.back().id;break; }
    result.entries.push_back(entry.info());
  }
  return result;
}
StoreStatus Sandbox::rename(NativeFileId id, NativeFileId parent, std::string_view name, bool replace) {
  if (!state_) return StoreStatus::invalid;
  std::lock_guard lock(state_->mutex);return state_->publish(id, parent, name, replace, false).status;
}
StoreStatus Sandbox::remove(NativeFileId id) {
  if (!state_) return StoreStatus::invalid;
  std::lock_guard lock(state_->mutex);
  return state_->retired ? StoreStatus::retired : state_->erase(id);
}
void Sandbox::retire() {
  if (!state_) return;
  std::lock_guard lock(state_->mutex);state_->stop();
}
QuotaSnapshot Sandbox::usage() const {
  return state_ ? state_->quota.snapshot() : QuotaSnapshot{};
}
StoreStatus Sandbox::cleanup() {
  if (!state_) return StoreStatus::ok;
  std::lock_guard lock(state_->mutex);state_->stop();
  if (state_->views) return StoreStatus::busy;
  while (!state_->records.empty()) {
    auto selected = state_->records.begin();
    for (auto it = state_->records.begin(); it != state_->records.end(); ++it)
      if (it->second->depth > selected->second->depth) selected = it;
    const auto removed = state_->erase(selected->first, true);
    if (removed != StoreStatus::ok) return removed;
  }
  for (const auto &directory : {std::pair{upload_root, &state_->upload_identity}, std::pair{data_root, &state_->data_identity}}) {
    bool &created = directory.first == data_root ? state_->data_created : state_->uploads_created;
    if (!created) continue;
    const auto actual = state_->root.inspect(directory.first, EntryKind::directory);
    if (actual.status != Status::ok || actual.identity != *directory.second) return StoreStatus::retained;
    const auto removed = state_->root.remove(directory.first, EntryKind::directory);
    if (removed != Status::ok) return convert(removed);
    created = false;
  }
  const auto empty = state_->root.empty();
  return empty.status == Status::ok && empty.empty ? StoreStatus::ok : StoreStatus::retained;
}
namespace {
struct RawView { StoreStatus status; File file; };
RawView open_view(const std::shared_ptr<SandboxState> &state, NativeFileId id, RootAccess access, bool upload,
                  bool pin = false, std::optional<NativeFileId> scope_root = {}) {
  if (!state || (access != RootAccess::read_only && access != RootAccess::read_write))
    return {StoreStatus::invalid, {}};
  std::lock_guard lock(state->mutex);
  if (state->retired) return {StoreStatus::retired, {}};
  if (scope_root) {
    const auto admitted = state->scoped(*scope_root, id);
    if (admitted != StoreStatus::ok) return {admitted, {}};
  }
  auto *entry = state->find(id);
  if (!entry || entry->staged != upload || entry->kind != EntryKind::file || entry->uncertain)
    return {StoreStatus::missing, {}};
  if (access == RootAccess::read_write && (entry->basic.attributes & file_readonly))
    return {StoreStatus::denied, {}};
  if (state->views == maximum_views) return {StoreStatus::limit, {}};
  auto opened = state->root.open_file(entry->path, access == RootAccess::read_only ? OpenMode::read : OpenMode::read_write);
  if (opened.status != Status::ok) { state->stop();return {StoreStatus::retained, {}}; }
  const auto actual = opened.file.metadata();
  if (actual.status != Status::ok || actual.identity != entry->identity || actual.bytes != entry->bytes) {
    state->stop();return {StoreStatus::retained, {}};
  }
  ++entry->views;++state->views;
  if (pin) ++entry->pins;
  return {StoreStatus::ok, std::move(opened.file)};
}
} // namespace
ViewResult Sandbox::open(NativeFileId id, RootAccess access) {
  auto opened = open_view(state_, id, access, false);
  return {opened.status, opened.status == StoreStatus::ok ? FileView(state_, id, std::move(opened.file), access) : FileView{}};
}
ViewResult Sandbox::open_upload(NativeFileId id) {
  auto opened = open_view(state_, id, RootAccess::read_write, true);
  return {opened.status, opened.status == StoreStatus::ok ?
                            FileView(state_, id, std::move(opened.file), RootAccess::read_write) : FileView{}};
}
ViewResult Sandbox::open_download(NativeFileId id) {
  auto opened = open_view(state_, id, RootAccess::read_only, false, true);
  return {opened.status, opened.status == StoreStatus::ok ?
                            FileView(state_, id, std::move(opened.file), RootAccess::read_only, true) : FileView{}};
}
ScopedSandbox::ScopedSandbox(std::shared_ptr<SandboxState> state, NativeFileId root, RootAccess access) noexcept
    : state_(std::move(state)), root_(root), access_(access) {}
ScopedSandbox::~ScopedSandbox() { close(); }
std::pair<QuotaLimits, QuotaSnapshot> ScopedSandbox::quota() const {
  return state_ ? std::pair{state_->quota.limits(), state_->quota.snapshot()} :
                  std::pair{QuotaLimits{0, 0, 0}, QuotaSnapshot{}};
}
ScopedSandbox::ScopedSandbox(ScopedSandbox &&other) noexcept
    : state_(std::move(other.state_)), root_(other.root_), access_(other.access_) {}
ScopedSandbox &ScopedSandbox::operator=(ScopedSandbox &&other) noexcept {
  if (this != &other) {
    close();state_ = std::move(other.state_);root_ = other.root_;access_ = other.access_;
  }
  return *this;
}
void ScopedSandbox::close() {
  if (!state_) return;
  auto state = std::move(state_);
  std::lock_guard lock(state->mutex);
  auto *entry = state->find(root_);
  if (!state->views || (root_ && (!entry || !entry->views))) {
    state->stop();return;
  }
  if (entry) --entry->views;
  --state->views;
}
std::pair<StoreStatus, ScopedSandbox> ScopedSandbox::acquire(
    const std::shared_ptr<SandboxState> &state, NativeFileId id, RootAccess access,
    std::optional<NativeFileId> scope_root) {
  if (!state || (access != RootAccess::read_only && access != RootAccess::read_write))
    return {StoreStatus::invalid, ScopedSandbox{}};
  std::lock_guard lock(state->mutex);
  if (state->retired) return {StoreStatus::retired, ScopedSandbox{}};
  if (scope_root) {
    const auto admitted = state->scoped(*scope_root, id);
    if (admitted != StoreStatus::ok) return {admitted, ScopedSandbox{}};
  }
  if (!state->directory(id)) return {StoreStatus::missing, ScopedSandbox{}};
  if (state->verify_directory(id) != StoreStatus::ok) return {StoreStatus::retained, ScopedSandbox{}};
  if (state->views == maximum_views) return {StoreStatus::limit, ScopedSandbox{}};
  auto *entry = state->find(id);
  if (entry) ++entry->views;
  ++state->views;
  return {StoreStatus::ok, ScopedSandbox(state, id, access)};
}
std::pair<StoreStatus, ScopedSandbox> Sandbox::scope(NativeFileId root, RootAccess access) {
  return ScopedSandbox::acquire(state_, root, access);
}
std::pair<StoreStatus, ScopedSandbox> ScopedSandbox::scope(NativeFileId id, RootAccess access) const {
  if (access_ == RootAccess::read_only && access != RootAccess::read_only)
    return {StoreStatus::denied, ScopedSandbox{}};
  return acquire(state_, id, access, root_);
}
EntryResult ScopedSandbox::info(NativeFileId id) const {
  if (!state_) return {};
  std::lock_guard lock(state_->mutex);
  const auto admitted = state_->scoped(root_, id);
  return admitted == StoreStatus::ok ? EntryResult{admitted, state_->scoped_info(id)} : EntryResult{admitted};
}
EntryResult ScopedSandbox::resolve(std::string_view path) const {
  if (!state_ || (!path.empty() && !valid_relative_path(path))) return {};
  std::lock_guard lock(state_->mutex);
  const auto admitted = state_->scoped(root_, root_);
  if (admitted != StoreStatus::ok) return {admitted};
  auto id = root_;
  while (!path.empty()) {
    if (!state_->directory(id)) return {StoreStatus::missing};
    if (state_->verify_directory(id) != StoreStatus::ok) return {StoreStatus::retained};
    const auto slash = path.find('/');
    const auto *entry = state_->child(id, path.substr(0, slash));
    if (!entry || entry->uncertain) return {StoreStatus::missing};
    if (state_->verify(*entry) != StoreStatus::ok) return {StoreStatus::retained};
    id = entry->id;
    if (slash == path.npos) break;
    path.remove_prefix(slash + 1);
  }
  return {StoreStatus::ok, state_->scoped_info(id)};
}
EntryResult ScopedSandbox::find_child(NativeFileId parent, std::string_view name) const {
  if (!state_ || !valid_name(name)) return {};
  std::lock_guard lock(state_->mutex);
  const auto admitted = state_->scoped(root_, parent);
  if (admitted != StoreStatus::ok) return {admitted};
  if (!state_->directory(parent)) return {StoreStatus::missing};
  const auto *entry = state_->child(parent, name);
  if (!entry || entry->uncertain) return {StoreStatus::missing};
  return state_->verify(*entry) == StoreStatus::ok ? EntryResult{StoreStatus::ok, entry->info()}
                                                  : EntryResult{StoreStatus::retained};
}
EntryResult ScopedSandbox::create_entry(NativeFileId parent, std::string_view name, EntryKind kind) {
  if (!state_) return {};
  if (access_ != RootAccess::read_write) return {StoreStatus::denied};
  std::lock_guard lock(state_->mutex);
  const auto admitted = state_->scoped(root_, parent);
  return admitted == StoreStatus::ok ? state_->create(parent, name, kind, false) : EntryResult{admitted};
}
ViewResult ScopedSandbox::open(NativeFileId id, RootAccess access) {
  if (access_ == RootAccess::read_only && access != RootAccess::read_only)
    return {StoreStatus::denied, {}};
  auto opened = open_view(state_, id, access, false, false, root_);
  return {opened.status, opened.status == StoreStatus::ok ?
      FileView(state_, id, std::move(opened.file), access) : FileView{}};
}
FilePage ScopedSandbox::list(NativeFileId parent, NativeFileId after, std::size_t count) const {
  if (!state_ || !count || count > maximum_file_page) return {};
  std::lock_guard lock(state_->mutex);
  const auto admitted = state_->scoped(root_, parent);
  if (admitted != StoreStatus::ok) return {admitted, 0, {}};
  if (!state_->directory(parent)) return {StoreStatus::missing, 0, {}};
  FilePage page{StoreStatus::ok, 0, {}};
  for (auto it = state_->records.upper_bound(after); it != state_->records.end(); ++it) {
    const auto &entry = *it->second;
    if (entry.parent != parent || entry.staged || entry.uncertain) continue;
    if (page.entries.size() == count) { page.next = page.entries.back().id;break; }
    if (state_->verify(entry) != StoreStatus::ok) return {StoreStatus::retained, 0, {}};
    page.entries.push_back(entry.info());
  }
  return page;
}
StoreStatus ScopedSandbox::rename(NativeFileId id, NativeFileId parent, std::string_view name, bool replace, std::uint8_t preserve) {
  if (!state_) return StoreStatus::invalid;
  if (access_ != RootAccess::read_write || id == root_) return StoreStatus::denied;
  std::lock_guard lock(state_->mutex);
  for (const auto key : {id, parent}) {
    const auto admitted = state_->scoped(root_, key);
    if (admitted != StoreStatus::ok) return admitted;
  }
  return state_->publish(id, parent, name, replace, false, preserve).status;
}
StoreStatus ScopedSandbox::set_basic(NativeFileId id, const FileBasic &basic, std::uint8_t preserve) {
  if (!state_ || !valid_basic(basic) || (preserve & ~15U)) return StoreStatus::invalid;
  if (access_ != RootAccess::read_write || !id) return StoreStatus::denied;
  std::lock_guard lock(state_->mutex);
  const auto admitted = state_->scoped(root_, id);
  if (admitted != StoreStatus::ok) return admitted;
  auto &entry = *state_->find(id);
  if (entry.pins) return StoreStatus::busy;
  // Validate every field before changing metadata. Attributes cannot change
  // entry kind or grant filesystem/ACL authority. Read-only may be cleared by
  // an authorized metadata handle but never by a read-only share.
  if (basic.attributes & file_directory && entry.kind != EntryKind::directory) return StoreStatus::invalid;
  if (!basic.times[3] && !(preserve & 8U) &&
      (basic.attributes || basic.times[0] || basic.times[1] || basic.times[2])) entry.basic.times[3] = file_time_now();
  for (std::size_t n = 0; n < basic.times.size(); ++n)
    if (basic.times[n]) entry.basic.times[n] = basic.times[n];
  if (basic.attributes) entry.basic.attributes = basic_attributes(basic.attributes, entry.kind == EntryKind::directory);
  return StoreStatus::ok;
}
StoreStatus ScopedSandbox::remove(NativeFileId id) {
  if (!state_) return StoreStatus::invalid;
  if (access_ != RootAccess::read_write || id == root_) return StoreStatus::denied;
  std::lock_guard lock(state_->mutex);
  const auto admitted = state_->scoped(root_, id);
  return admitted == StoreStatus::ok ? state_->erase(id) : admitted;
}
FileView::FileView(std::shared_ptr<SandboxState> state, NativeFileId id, File file, RootAccess access, bool pin)
    : state_(std::move(state)), id_(id), file_(std::move(file)), access_(access), pinned_(pin) {}
FileView::~FileView() { close(); }
FileView::FileView(FileView &&other) noexcept
    : state_(std::move(other.state_)), id_(other.id_), file_(std::move(other.file_)), access_(other.access_), pinned_(other.pinned_) {}
FileView &FileView::operator=(FileView &&other) noexcept {
  if (this != &other) {
    close();state_ = std::move(other.state_);id_ = other.id_;
    file_ = std::move(other.file_);access_ = other.access_;pinned_ = other.pinned_;
  }
  return *this;
}
void FileView::close() {
  if (!state_) return;
  auto state = std::move(state_);
  std::lock_guard lock(state->mutex);
  file_ = File{};
  auto *entry = state->find(id_);
  if (!entry || !entry->views || !state->views) { state->stop();return; }
  if (pinned_) {
    if (!entry->pins) { state->stop();return; }
    --entry->pins;
  }
  --entry->views;--state->views;
}
namespace {
bool valid_io(std::uint64_t offset, std::size_t bytes) noexcept {
  return bytes <= maximum_io_bytes && offset <= maximum_offset && bytes <= maximum_offset - offset;
}
Record *checked_view(SandboxState &state, NativeFileId id, File &file) {
  auto *entry = state.find(id);
  const auto actual = file.metadata();
  if (!entry || actual.status != Status::ok || actual.identity != entry->identity || actual.bytes != entry->bytes) {
    state.stop();return nullptr;
  }
  return entry;
}
StoreStatus settle(SandboxState &state, Record &entry, File &file, GrowthReservation &pending) {
  const auto actual = file.metadata();
  if (actual.status != Status::ok || actual.identity != entry.identity ||
      pending.finish(actual.bytes) != QuotaStatus::ok) {
    state.stop();return StoreStatus::retained;
  }
  entry.bytes = actual.bytes;
  return StoreStatus::ok;
}
} // namespace
StoreIo FileView::read(std::uint64_t offset, ::bridge::compat::span<std::uint8_t> output, std::uint8_t preserve) {
  if (!state_ || !valid_io(offset, output.size())) return {StoreStatus::invalid};
  std::lock_guard lock(state_->mutex);
  if (state_->retired) return {StoreStatus::retired};
  auto *entry = checked_view(*state_, id_, file_);
  if (!entry) return {StoreStatus::retained};
  const auto result = file_.read(offset, output);
  if (result.bytes && !(preserve & 2U)) entry->basic.times[1] = file_time_now();
  return {convert(result.status), result.bytes};
}
StoreSize FileView::size() {
  if (!state_) return {StoreStatus::invalid};
  std::lock_guard lock(state_->mutex);
  if (state_->retired) return {StoreStatus::retired};
  const auto *entry = checked_view(*state_, id_, file_);
  return entry ? StoreSize{StoreStatus::ok, entry->bytes} : StoreSize{StoreStatus::retained};
}
StoreIo FileView::write(std::uint64_t offset, ::bridge::compat::span<const std::uint8_t> input, std::uint8_t preserve) {
  if (!state_ || !valid_io(offset, input.size())) return {StoreStatus::invalid};
  if (access_ != RootAccess::read_write) return {StoreStatus::denied};
  std::lock_guard lock(state_->mutex);
  if (state_->retired) return {StoreStatus::retired};
  auto *entry = checked_view(*state_, id_, file_);
  if (!entry) return {StoreStatus::retained};
  if (entry->basic.attributes & file_readonly) return {StoreStatus::denied};
  if (entry->pins) return {StoreStatus::busy};
  auto admission = entry->allocation.reserve_size(input.empty() ? entry->bytes : std::max(entry->bytes, offset + input.size()));
  if (admission.status != QuotaStatus::ok) return {convert(admission.status)};
  const auto result = file_.write(offset, input);
  if (result.bytes) {
    const auto now = file_time_now();
    if (!(preserve & 4U)) entry->basic.times[2] = now;
    if (!(preserve & 8U)) entry->basic.times[3] = now;
    entry->basic.attributes = basic_attributes(entry->basic.attributes | file_archive, false);
  }
  if (settle(*state_, *entry, file_, admission.reservation) != StoreStatus::ok) return {StoreStatus::retained};
  return {convert(result.status), result.bytes};
}
StoreIo FileView::append(::bridge::compat::span<const std::uint8_t> input, std::uint8_t preserve) {
  if (!state_ || input.size() > maximum_io_bytes) return {StoreStatus::invalid};
  if (access_ != RootAccess::read_write) return {StoreStatus::denied};
  std::lock_guard lock(state_->mutex);
  if (state_->retired) return {StoreStatus::retired};
  auto *entry = checked_view(*state_, id_, file_);
  if (!entry) return {StoreStatus::retained};
  if (entry->basic.attributes & file_readonly) return {StoreStatus::denied};
  if (entry->pins) return {StoreStatus::busy};
  if (entry->bytes > maximum_offset || input.size() > maximum_offset - entry->bytes)
    return {StoreStatus::invalid};
  const auto offset = entry->bytes;
  auto admission = entry->allocation.reserve_size(offset + input.size());
  if (admission.status != QuotaStatus::ok) return {convert(admission.status)};
  const auto result = file_.write(offset, input);
  if (result.bytes) {
    const auto now = file_time_now();
    if (!(preserve & 4U)) entry->basic.times[2] = now;
    if (!(preserve & 8U)) entry->basic.times[3] = now;
    entry->basic.attributes = basic_attributes(entry->basic.attributes | file_archive, false);
  }
  if (settle(*state_, *entry, file_, admission.reservation) != StoreStatus::ok)
    return {StoreStatus::retained};
  return {convert(result.status), result.bytes};
}
StoreStatus FileView::resize(std::uint64_t bytes, std::uint8_t preserve) {
  if (!state_ || bytes > maximum_offset) return StoreStatus::invalid;
  if (access_ != RootAccess::read_write) return StoreStatus::denied;
  std::lock_guard lock(state_->mutex);
  if (state_->retired) return StoreStatus::retired;
  auto *entry = checked_view(*state_, id_, file_);
  if (!entry) return StoreStatus::retained;
  if (entry->basic.attributes & file_readonly) return StoreStatus::denied;
  if (entry->pins) return StoreStatus::busy;
  auto admission = entry->allocation.reserve_size(bytes);
  if (admission.status != QuotaStatus::ok) return convert(admission.status);
  const auto result = file_.resize(bytes);
  const auto previous = entry->bytes;
  if (settle(*state_, *entry, file_, admission.reservation) != StoreStatus::ok) return StoreStatus::retained;
  if (entry->bytes != previous) {
    const auto now = file_time_now();
    if (!(preserve & 4U)) entry->basic.times[2] = now;
    if (!(preserve & 8U)) entry->basic.times[3] = now;
    entry->basic.attributes = basic_attributes(entry->basic.attributes | file_archive, false);
  }
  return convert(result);
}
} // namespace bridge::files
