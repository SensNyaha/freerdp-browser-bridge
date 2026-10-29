#pragma once
#include "protocol.hpp"
#include "../files/sandbox.hpp"

namespace bridge::ipc::files {
inline constexpr std::size_t metadata_bytes = 40;
inline constexpr std::size_t max_record_bytes = metadata_bytes + ::bridge::files::maximum_io_bytes;
enum class Operation : std::uint16_t {
  initialize = 1, begin_upload, write, commit, abort, open_download, read, close_download,
  list, mkdir, remove, retire
};
struct Record {
  Operation operation;
  ::bridge::files::StoreStatus status = ::bridge::files::StoreStatus::ok;
  std::uint16_t flags = 0;
  std::uint64_t id = 0, argument = 0, value = 0;
  ::bridge::compat::span<const std::uint8_t> data{};
};
// Schema 1; validates fixed fields and bounds before any payload-owned allocation.
// Data is borrowed. IDs and limits are private host/worker authority, not public IDs.
Record decode(::bridge::compat::span<const std::uint8_t>, bool response);
std::vector<std::uint8_t> encode(const Record &, bool response);
std::vector<std::uint8_t> encode_page(const ::bridge::files::FilePage &);
} // namespace bridge::ipc::files
