#include "device_inventory.hpp"
#include "../clipboard/text.hpp"
#include <algorithm>

namespace bridge::ipc::inventory {
namespace {
using Bytes = ::bridge::compat::span<const std::uint8_t>;
std::uint16_t u16(Bytes bytes, std::size_t offset) {
  return static_cast<std::uint16_t>(read_be(bytes.subspan(offset, 2)));
}
void validate_request(Request request) {
  if (!request.classes || request.classes > 31 || !request.maximum ||
      request.maximum > maximum_devices) throw ProtocolError();
}
bool text(Bytes bytes) noexcept {
  if (bytes.empty() || bytes.size() > maximum_text_bytes ||
      !::bridge::clipboard::valid_clipboard_utf8(bytes)) return false;
  for (std::size_t i = 0; i < bytes.size(); ++i) {
    if (bytes[i] < 32 || bytes[i] == 127) return false;
    if (bytes[i] == 0xc2 && i + 1 < bytes.size() && bytes[i + 1] <= 0x9f) return false;
  }
  return true;
}
bool equal(Bytes left, Bytes right) noexcept {
  return left.size() == right.size() && std::equal(left.begin(), left.end(), right.begin());
}
std::size_t admitted_size(const ReportView &report) {
  if (!report.class_count || report.class_count > report.classes.size() ||
      report.device_count > maximum_devices) throw ProtocolError();
  std::size_t bytes = 8, total = 0;
  std::uint16_t previous = 0;
  for (std::size_t i = 0; i < report.class_count; ++i) {
    const auto &group = report.classes[i];
    const auto kind = static_cast<std::uint16_t>(group.kind);
    if (kind <= previous || kind > 5 || static_cast<unsigned>(group.status) > 5 ||
        group.first != total || group.count > report.device_count - total ||
        (group.status != Status::available && group.status != Status::limit && group.count))
      throw ProtocolError();
    previous = kind;
    if (bytes > maximum_bytes - 8) throw ProtocolError();
    bytes += 8;
    for (std::size_t j = 0; j < group.count; ++j) {
      const auto &device = report.devices[total + j];
      if (!text(device.id) || !text(device.name) ||
          (group.kind != DeviceClass::usb &&
           (device.vendor || device.product || device.bus || device.address))) throw ProtocolError();
      for (std::size_t k = 0; k < j; ++k)
        if (equal(device.id, report.devices[total + k].id)) throw ProtocolError();
      const auto needed = 16 + device.id.size() + device.name.size();
      if (needed > maximum_bytes - bytes) throw ProtocolError();
      bytes += needed;
    }
    total += group.count;
  }
  if (total != report.device_count || bytes > maximum_bytes) throw ProtocolError();
  return bytes;
}
} // namespace

std::array<std::uint8_t, 8> encode_request(Request request) {
  validate_request(request);
  return {0, 1, 0, static_cast<std::uint8_t>(request.classes), 0,
          static_cast<std::uint8_t>(request.maximum), 0, 0};
}
Request decode_request(Bytes bytes) {
  if (bytes.size() != 8 || u16(bytes, 0) != 1 || u16(bytes, 6)) throw ProtocolError();
  Request request{u16(bytes, 2), u16(bytes, 4)};
  validate_request(request);
  return request;
}
std::vector<std::uint8_t> encode_report(const ReportView &report) {
  const auto size = admitted_size(report);
  std::vector<std::uint8_t> result;
  result.reserve(size);
  append_be(result, 1, 2);
  append_be(result, report.class_count, 2);
  append_be(result, report.device_count, 2);
  append_be(result, 0, 2);
  for (std::size_t i = 0; i < report.class_count; ++i) {
    const auto &group = report.classes[i];
    append_be(result, static_cast<std::uint16_t>(group.kind), 2);
    append_be(result, static_cast<std::uint16_t>(group.status), 2);
    append_be(result, group.count, 2);
    append_be(result, 0, 2);
    for (std::size_t j = 0; j < group.count; ++j) {
      const auto &device = report.devices[group.first + j];
      append_be(result, device.id.size(), 2);
      append_be(result, device.name.size(), 2);
      append_be(result, device.vendor, 2);
      append_be(result, device.product, 2);
      append_be(result, device.bus, 1);
      append_be(result, device.address, 1);
      append_be(result, 0, 6);
      result.insert(result.end(), device.id.begin(), device.id.end());
      result.insert(result.end(), device.name.begin(), device.name.end());
    }
  }
  return result;
}
ReportView decode_report(Bytes bytes) {
  if (bytes.size() < 16 || bytes.size() > maximum_bytes || u16(bytes, 0) != 1 ||
      !u16(bytes, 2) || u16(bytes, 2) > 5 || u16(bytes, 4) > maximum_devices || u16(bytes, 6))
    throw ProtocolError();
  ReportView result{};
  result.class_count = u16(bytes, 2);
  result.device_count = u16(bytes, 4);
  std::size_t offset = 8, total = 0;
  std::uint16_t previous = 0;
  for (std::size_t i = 0; i < result.class_count; ++i) {
    if (bytes.size() - offset < 8) throw ProtocolError();
    const auto kind = u16(bytes, offset), status = u16(bytes, offset + 2),
               count = u16(bytes, offset + 4);
    if (kind <= previous || kind > 5 || status > 5 || count > result.device_count - total ||
        (status != 0 && status != 4 && count) || u16(bytes, offset + 6)) throw ProtocolError();
    previous = kind;
    result.classes[i] = {static_cast<DeviceClass>(kind), static_cast<Status>(status),
                         static_cast<std::uint16_t>(total), count};
    offset += 8;
    for (std::size_t j = 0; j < count; ++j) {
      if (bytes.size() - offset < 16) throw ProtocolError();
      const auto id_bytes = u16(bytes, offset), name_bytes = u16(bytes, offset + 2);
      if (!id_bytes || !name_bytes || id_bytes > maximum_text_bytes ||
          name_bytes > maximum_text_bytes || read_be(bytes.subspan(offset + 10, 6)) ||
          static_cast<std::size_t>(id_bytes) + name_bytes > bytes.size() - offset - 16)
        throw ProtocolError();
      auto &device = result.devices[total + j];
      device.vendor = u16(bytes, offset + 4);
      device.product = u16(bytes, offset + 6);
      device.bus = bytes[offset + 8];
      device.address = bytes[offset + 9];
      if (kind != 5 && (device.vendor || device.product || device.bus || device.address))
        throw ProtocolError();
      offset += 16;
      device.id = bytes.subspan(offset, id_bytes);
      device.name = bytes.subspan(offset + id_bytes, name_bytes);
      if (!text(device.id) || !text(device.name)) throw ProtocolError();
      for (std::size_t k = 0; k < j; ++k)
        if (equal(device.id, result.devices[total + k].id)) throw ProtocolError();
      offset += static_cast<std::size_t>(id_bytes) + name_bytes;
    }
    total += count;
  }
  if (offset != bytes.size() || total != result.device_count) throw ProtocolError();
  return result;
}
void validate_selection(const ReportView &report, Request request) {
  validate_request(request);
  (void)admitted_size(report);
  std::uint16_t mask = 0;
  for (std::size_t i = 0; i < report.class_count; ++i)
    mask = static_cast<std::uint16_t>(mask | (1U << (static_cast<unsigned>(report.classes[i].kind) - 1)));
  if (mask != request.classes || report.device_count > request.maximum) throw ProtocolError();
}
} // namespace bridge::ipc::inventory
