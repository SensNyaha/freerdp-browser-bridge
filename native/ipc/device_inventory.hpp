#pragma once
#include "protocol.hpp"

namespace bridge::ipc::inventory {
// This grammar describes bridge-host devices only (ADR-006), never browser/companion devices.
inline constexpr std::size_t maximum_bytes = 65536;
inline constexpr std::size_t maximum_devices = 128;
inline constexpr std::size_t maximum_text_bytes = 255;
enum class DeviceClass : std::uint16_t { printers = 1, smartcards, serial, parallel, usb };
enum class Status : std::uint16_t { available, unavailable, denied, unsupported, limit, failure };
struct Request {
  std::uint16_t classes = 0;
  std::uint16_t maximum = 0;
};
struct DeviceView {
  ::bridge::compat::span<const std::uint8_t> id;
  ::bridge::compat::span<const std::uint8_t> name;
  std::uint16_t vendor = 0, product = 0;
  std::uint8_t bus = 0, address = 0;
};
struct ClassView {
  DeviceClass kind{};
  Status status{};
  std::uint16_t first = 0, count = 0;
};
// Borrowed views: keep the packet/backing strings alive until encoding/consumption ends.
// Decoding uses only fixed storage and never allocates device strings or device arrays.
struct ReportView {
  std::array<ClassView, 5> classes{};
  std::array<DeviceView, maximum_devices> devices{};
  std::uint16_t class_count = 0, device_count = 0;
};
std::array<std::uint8_t, 8> encode_request(Request request);
Request decode_request(::bridge::compat::span<const std::uint8_t> bytes);
std::vector<std::uint8_t> encode_report(const ReportView &report);
ReportView decode_report(::bridge::compat::span<const std::uint8_t> bytes);
void validate_selection(const ReportView &report, Request request);
} // namespace bridge::ipc::inventory
