#include "service.hpp"
#include "recovery.hpp"
#include <algorithm>

namespace bridge::files {
namespace {
constexpr std::string_view component = "managed-files";
using Operation = ipc::files::Operation;
using WireRecord = ipc::files::Record;
void wipe(std::vector<std::uint8_t> &bytes) noexcept {
  volatile std::uint8_t *at = bytes.data();
  for (std::size_t i = 0; i < bytes.size(); ++i) at[i] = 0;
}
} // namespace
FileService::FileService(std::filesystem::path runtime, bool owned)
    : runtime_(std::move(runtime)), eligible_(owned) {}
FileService::~FileService() {
  try { (void)shutdown(); } catch (...) { /* Retain uncertain objects, never recurse. */ }
}
StoreStatus FileService::initialize(const WireRecord &request) {
  if (attempted_ || retired_) return StoreStatus::retired;
  attempted_ = true;
  if (!eligible_) return StoreStatus::denied;
  auto parent = SafeRoot::open(runtime_);
  if (parent.first != Status::ok) return StoreStatus::denied;
  parent_ = std::move(parent.second);
  if (parent_.create_directory(component) != Status::ok) return StoreStatus::retained;
  created_ = true;
  const auto identity = parent_.inspect(component, EntryKind::directory);
  if (identity.status != Status::ok) return StoreStatus::retained;
  identity_ = identity.identity;
  auto root = SafeRoot::open(runtime_ / std::string(component));
  if (root.first != Status::ok) return StoreStatus::retained;
  const auto claim = create_managed_files_claim(parent_, identity_);
  claim_created_ = claim.created;claim_identity_ = claim.identity;
  if (claim.status != Status::ok) return StoreStatus::retained;
  auto made = Sandbox::create(std::move(root.second), {{request.id, request.argument,
                                      static_cast<std::uint32_t>(request.value)}, 1024 * 1024});
  if (made.first != StoreStatus::ok) return StoreStatus::retained;
  store_.emplace(std::move(made.second));
  xrdp_legacy_delete_ = (request.flags & 1U) != 0;
  return StoreStatus::ok;
}
WireRecord FileService::execute(const WireRecord &request, std::vector<std::uint8_t> &data) {
  WireRecord result{request.operation};
  if (request.operation == Operation::initialize) {
    result.status = initialize(request);return result;
  }
  if (request.operation == Operation::retire) {
    result.status = shutdown();return result;
  }
  result.id = request.id;
  if (retired_) { result.status = StoreStatus::retired;return result; }
  if (!store_) { result.status = StoreStatus::unavailable;return result; }
  switch (request.operation) {
  case Operation::begin_upload:
  case Operation::mkdir: {
    if (request.operation == Operation::begin_upload && upload_) {
      result.status = StoreStatus::busy;break;
    }
    const std::string_view name(reinterpret_cast<const char *>(request.data.data()), request.data.size());
    const auto entry = request.operation == Operation::mkdir ?
        store_->create_entry(request.id, name, EntryKind::directory) : store_->begin_upload(request.id, name);
    result.status = entry.status;
    if (entry.status != StoreStatus::ok) break;
    result.id = entry.info.id;result.argument = entry.info.parent;
    if (request.operation == Operation::begin_upload) {
      auto opened = store_->open_upload(entry.info.id);
      if (opened.status != StoreStatus::ok) {
        result.status = opened.status;
        if (store_->remove(entry.info.id) != StoreStatus::ok) store_->retire();
        break;
      }
      upload_.emplace(Transfer{entry.info.id, 0, 0, std::move(opened.view)});
    }
    break;
  }
  case Operation::write:
    if (!upload_ || upload_->id != request.id) { result.status = StoreStatus::missing;break; }
    if (!upload_->view || request.argument != upload_->offset) { result.status = StoreStatus::invalid;break; }
    {
      const auto written = upload_->view.write(request.argument, request.data);
      upload_->offset += written.bytes;
      result.status = written.status;result.argument = upload_->offset;result.value = written.bytes;
    }
    break;
  case Operation::commit:
    if (!upload_ || upload_->id != request.id) { result.status = StoreStatus::missing;break; }
    if (request.argument != upload_->offset) { result.status = StoreStatus::invalid;break; }
    if (upload_->view) {
      const auto actual = upload_->view.size();
      if (actual.status != StoreStatus::ok) { result.status = actual.status;break; }
      if (actual.bytes != request.argument) { result.status = StoreStatus::invalid;break; }
      upload_->size = actual.bytes;
    }
    if (upload_->size != request.argument) { result.status = StoreStatus::invalid;break; }
    upload_->view.close();
    result.status = store_->publish_upload(request.id, request.flags == 1).status;
    if (result.status == StoreStatus::ok) { result.value = upload_->offset;upload_.reset(); }
    break;
  case Operation::abort:
    if (!upload_ || upload_->id != request.id) { result.status = StoreStatus::missing;break; }
    upload_->view.close();
    result.status = store_->remove(request.id);
    if (result.status == StoreStatus::ok) upload_.reset();
    break;
  case Operation::open_download: {
    if (download_) { result.status = StoreStatus::busy;break; }
    auto opened = store_->open_download(request.id);
    result.status = opened.status;
    if (opened.status != StoreStatus::ok) break;
    const auto info = store_->info(request.id);
    result.status = info.status;
    if (info.status != StoreStatus::ok) break;
    result.value = info.info.bytes;
    download_.emplace(Transfer{request.id, 0, info.info.bytes, std::move(opened.view)});
    break;
  }
  case Operation::read: {
    if (!download_ || download_->id != request.id) { result.status = StoreStatus::missing;break; }
    if (request.argument != download_->offset) { result.status = StoreStatus::invalid;break; }
    const auto length = static_cast<std::size_t>(std::min(request.value, download_->size - download_->offset));
    data.resize(length);
    const auto read = download_->view.read(request.argument, data);
    result.status = read.status;
    result.argument = request.argument;
    if (read.status == StoreStatus::ok) {
      if (read.bytes > length || (length && !read.bytes)) { store_->retire();result.status = StoreStatus::retained;wipe(data);data.clear();break; }
      data.resize(read.bytes);
      download_->offset += read.bytes;
      result.value = read.bytes;result.data = data;
    } else { wipe(data);data.clear(); }
    break;
  }
  case Operation::close_download:
    if (!download_ || download_->id != request.id) { result.status = StoreStatus::missing;break; }
    download_.reset();break;
  case Operation::list: {
    const auto page = store_->list(request.id, request.argument, static_cast<std::size_t>(request.value));
    result.status = page.status;
    if (page.status == StoreStatus::ok) {
      data = ipc::files::encode_page(page);result.id = page.next;result.argument = page.entries.size();result.data = data;
    }
    break;
  }
  case Operation::remove:
    result.status = store_->remove(request.id);break;
  case Operation::initialize:
  case Operation::retire:
    throw ipc::ProtocolError(); // Handled before dispatch.
  }
  return result;
}
std::vector<std::uint8_t> FileService::command(::bridge::compat::span<const std::uint8_t> bytes) {
  const auto request = ipc::files::decode(bytes, false);
  std::vector<std::uint8_t> data;
  struct Wiper { std::vector<std::uint8_t> &data;~Wiper() { wipe(data); } } wiper{data};
  const auto result = execute(request, data);
  return ipc::files::encode(result, true);
}
std::pair<StoreStatus, ScopedSandbox> FileService::scope(std::string_view subdirectory, RootAccess access) {
  if (retired_) return {StoreStatus::retired, ScopedSandbox{}};
  if (!store_) return {StoreStatus::unavailable, ScopedSandbox{}};
  if ((access != RootAccess::read_only && access != RootAccess::read_write) ||
      (!subdirectory.empty() && !valid_relative_path(subdirectory)))
    return {StoreStatus::invalid, ScopedSandbox{}};
  auto root = store_->scope(0, RootAccess::read_write);
  if (root.first != StoreStatus::ok) return root;
  auto parent = root.second.root();
  while (!subdirectory.empty()) {
    const auto slash = subdirectory.find('/');
    const auto part = subdirectory.substr(0, slash);
    auto entry = root.second.find_child(parent, part);
    if (entry.status == StoreStatus::missing)
      entry = root.second.create_entry(parent, part, EntryKind::directory);
    if (entry.status != StoreStatus::ok) return {entry.status, ScopedSandbox{}};
    if (entry.info.kind != EntryKind::directory) return {StoreStatus::invalid, ScopedSandbox{}};
    parent = entry.info.id;
    if (slash == subdirectory.npos) break;
    subdirectory.remove_prefix(slash + 1);
  }
  return root.second.scope(parent, access);
}
StoreStatus FileService::shutdown() {
  retired_ = true;
  upload_.reset();download_.reset();
  if (!created_) return StoreStatus::ok;
  if (!contents_cleaned_) {
    if (!store_) return StoreStatus::retained;
    const auto cleaned = store_->cleanup();
    if (cleaned != StoreStatus::ok) return cleaned;
    // Release the root handle before removing the empty container on Windows.
    store_.reset();
    contents_cleaned_ = true;
  }
  if (!container_removed_) {
    if (parent_.remove(component, EntryKind::directory, identity_) != Status::ok) return StoreStatus::retained;
    container_removed_ = true;
  }
  if (claim_created_) {
    if (parent_.remove(managed_files_claim, EntryKind::file, claim_identity_) != Status::ok) return StoreStatus::retained;
    claim_created_ = false;
  }
  created_ = false;
  return StoreStatus::ok;
}
} // namespace bridge::files
