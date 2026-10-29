#include "files.hpp"
#include <limits>

namespace bridge::ipc::files {
namespace {
using Status = ::bridge::files::StoreStatus;
constexpr std::array statuses{Status::ok, Status::invalid, Status::missing, Status::exists,
    Status::denied, Status::busy, Status::limit, Status::disk_full, Status::unavailable,
    Status::retired, Status::retained, Status::io, Status::not_empty};
constexpr auto maximum = static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max());
std::uint16_t code(Status status) {
  for (std::uint16_t i = 0; i < statuses.size(); ++i)
    if (statuses[i] == status) return i;
  throw ProtocolError();
}
bool empty(const Record &r) { return r.data.empty(); }
void validate_page(const Record &r) {
  if (r.argument > ::bridge::files::maximum_file_page || r.value) throw ProtocolError();
  auto bytes = r.data;
  std::uint64_t previous = 0, parent = 0;
  for (std::uint64_t i = 0; i < r.argument; ++i) {
    if (bytes.size() < 32) throw ProtocolError();
    const auto length = read_be(bytes.subspan(26, 2));
    const auto id = read_be(bytes.first(8)), owner = read_be(bytes.subspan(8, 8));
    if (id <= previous || (i && owner != parent) || read_be(bytes.subspan(16, 8)) > maximum ||
        (read_be(bytes.subspan(24, 2)) == 1 && read_be(bytes.subspan(16, 8))) ||
        read_be(bytes.subspan(24, 2)) > 1 || read_be(bytes.subspan(28, 4)) ||
        !length || length > ::bridge::files::maximum_component_bytes || length > bytes.size() - 32)
      throw ProtocolError();
    const std::string_view name(reinterpret_cast<const char *>(bytes.data() + 32), static_cast<std::size_t>(length));
    if (name.find('/') != name.npos || !::bridge::files::valid_relative_path(name)) throw ProtocolError();
    bytes = bytes.subspan(32 + static_cast<std::size_t>(length));
    previous = id;parent = owner;
  }
  if (!bytes.empty() || (r.id && (!r.argument || r.id != previous))) throw ProtocolError();
}
void validate(const Record &r, bool response) {
  const auto op = static_cast<unsigned>(r.operation);
  if (op < 1 || op > 12 || r.data.size() > ::bridge::files::maximum_io_bytes) throw ProtocolError();
  (void)code(r.status);
  if (response) {
    if (r.flags) throw ProtocolError();
    if (r.status != Status::ok) {
      if (!empty(r) || r.argument > maximum || r.value > maximum) throw ProtocolError();
      return;
    }
    if (r.operation == Operation::list) { validate_page(r);return; }
    if (r.operation == Operation::read) {
      if (!r.id || r.argument > maximum || r.value != r.data.size() || r.value > maximum - r.argument)
        throw ProtocolError();
      return;
    }
    if (!empty(r)) throw ProtocolError();
    if (r.operation == Operation::initialize || r.operation == Operation::retire) {
      if (r.id || r.argument || r.value) throw ProtocolError();
      return;
    }
    if (!r.id) throw ProtocolError();
    switch (r.operation) {
    case Operation::begin_upload:
    case Operation::mkdir:
      if (r.value) throw ProtocolError();
      break;
    case Operation::write:
      if (r.argument > maximum || r.value > ::bridge::files::maximum_io_bytes || r.value > r.argument)
        throw ProtocolError();
      break;
    case Operation::commit:
    case Operation::open_download:
      if (r.argument || r.value > maximum) throw ProtocolError();
      break;
    default:
      if (r.argument || r.value) throw ProtocolError();
    }
    return;
  }
  if (r.status != Status::ok || (r.flags &&
      ((r.operation != Operation::commit && r.operation != Operation::initialize) || r.flags != 1)))
    throw ProtocolError();
  bool valid = false;
  switch (r.operation) {
  case Operation::initialize:
    valid = empty(r) && r.id <= maximum && r.argument <= r.id && r.value <= ::bridge::files::maximum_quota_entries;
    break;
  case Operation::begin_upload:
  case Operation::mkdir:
    valid = !r.argument && !r.value && !empty(r) && r.data.size() <= ::bridge::files::maximum_component_bytes;
    break;
  case Operation::write:
    valid = r.id && r.argument <= maximum && !r.value && !empty(r) && r.data.size() <= maximum - r.argument;
    break;
  case Operation::commit:
    valid = r.id && r.argument <= maximum && !r.value && empty(r);
    break;
  case Operation::abort:
  case Operation::open_download:
  case Operation::close_download:
  case Operation::remove:
    valid = r.id && !r.argument && !r.value && empty(r);
    break;
  case Operation::read:
    valid = r.id && r.argument <= maximum && r.value && r.value <= ::bridge::files::maximum_io_bytes &&
            r.value <= maximum - r.argument && empty(r);
    break;
  case Operation::list:
    valid = !r.flags && r.value && r.value <= ::bridge::files::maximum_file_page && empty(r);
    break;
  case Operation::retire:
    valid = !r.id && !r.argument && !r.value && empty(r);
    break;
  }
  if (!valid) throw ProtocolError();
}
} // namespace
Record decode(::bridge::compat::span<const std::uint8_t> bytes, bool response) {
  if (bytes.size() < metadata_bytes || bytes.size() > max_record_bytes || read_be(bytes.first(2)) != 1 ||
      read_be(bytes.subspan(36, 4)) || read_be(bytes.subspan(32, 4)) != bytes.size() - metadata_bytes)
    throw ProtocolError();
  const auto status = read_be(bytes.subspan(4, 2));
  if (status >= statuses.size()) throw ProtocolError();
  Record result{static_cast<Operation>(read_be(bytes.subspan(2, 2))), statuses[status],
                static_cast<std::uint16_t>(read_be(bytes.subspan(6, 2))), read_be(bytes.subspan(8, 8)),
                read_be(bytes.subspan(16, 8)), read_be(bytes.subspan(24, 8)), bytes.subspan(metadata_bytes)};
  validate(result, response);
  return result;
}
std::vector<std::uint8_t> encode(const Record &record, bool response) {
  validate(record, response);
  std::vector<std::uint8_t> result;
  result.reserve(metadata_bytes + record.data.size());
  append_be(result, 1, 2);append_be(result, static_cast<unsigned>(record.operation), 2);
  append_be(result, code(record.status), 2);append_be(result, record.flags, 2);
  append_be(result, record.id, 8);append_be(result, record.argument, 8);append_be(result, record.value, 8);
  append_be(result, record.data.size(), 4);append_be(result, 0, 4);
  result.insert(result.end(), record.data.begin(), record.data.end());
  return result;
}
std::vector<std::uint8_t> encode_page(const ::bridge::files::FilePage &page) {
  if (page.status != Status::ok || page.entries.size() > ::bridge::files::maximum_file_page) throw ProtocolError();
  std::vector<std::uint8_t> result;
  result.reserve(page.entries.size() * (32 + ::bridge::files::maximum_component_bytes));
  for (const auto &entry : page.entries) {
    if (entry.name.empty() || entry.name.size() > ::bridge::files::maximum_component_bytes) throw ProtocolError();
    append_be(result, entry.id, 8);append_be(result, entry.parent, 8);append_be(result, entry.bytes, 8);
    append_be(result, entry.kind == ::bridge::files::EntryKind::directory ? 1 : 0, 2);
    append_be(result, entry.name.size(), 2);append_be(result, 0, 4);
    result.insert(result.end(), entry.name.begin(), entry.name.end());
  }
  return result;
}
} // namespace bridge::ipc::files
