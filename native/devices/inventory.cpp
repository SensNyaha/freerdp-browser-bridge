#include "inventory.hpp"
#include "../clipboard/text.hpp"
#include <algorithm>

namespace bridge::devices {
struct Snapshot::Storage {
  struct Device {
    std::array<std::uint8_t, wire::maximum_text_bytes> id{}, name{};
  };
  std::array<Device, wire::maximum_devices> devices{};
};
namespace {
bool text(::bridge::compat::span<const std::uint8_t> value) {
  if (value.empty() || value.size() > wire::maximum_text_bytes ||
      !::bridge::clipboard::valid_clipboard_utf8(value)) return false;
  for (std::size_t i = 0; i < value.size(); ++i)
    if (value[i] < 32 || value[i] == 127 ||
        (value[i] == 0xc2 && i + 1 < value.size() && value[i + 1] <= 0x9f)) return false;
  return true;
}
}
Snapshot::Snapshot(wire::Request request) {
  (void)wire::encode_request(request); // Refuse policy/count before storage allocation.
  maximum_ = request.maximum;
  selected_ = request.classes;
  storage_ = std::make_unique<Storage>();
}
Snapshot::~Snapshot() = default;
void Snapshot::begin(wire::DeviceClass kind) {
  const auto number = static_cast<unsigned>(kind);
  if (active_ || number < 1 || number > 5 || !(selected_ & (1U << (number - 1))) ||
      report_.class_count >= report_.classes.size() ||
      (report_.class_count && number <= static_cast<unsigned>(report_.classes[report_.class_count - 1].kind)))
    throw ::bridge::ipc::ProtocolError();
  report_.classes[report_.class_count++] = {kind, wire::Status::failure, report_.device_count, 0};
  bytes_ += 8;
  limited_ = invalid_ = false;
  active_ = true;
}
bool Snapshot::append(const wire::DeviceView &device) {
  if (!active_) throw ::bridge::ipc::ProtocolError();
  auto &group = report_.classes[report_.class_count - 1];
  if (invalid_ || limited_) return false;
  if (!text(device.id) || !text(device.name) ||
      (group.kind != wire::DeviceClass::usb &&
       (device.vendor || device.product || device.bus || device.address))) {
    invalid_ = true;
    return false;
  }
  for (std::size_t i = group.first; i < report_.device_count; ++i) {
    const auto previous = report_.devices[i].id;
    if (device.id.size() == previous.size() && std::equal(device.id.begin(), device.id.end(), previous.begin())) {
      invalid_ = true;
      return false;
    }
  }
  const auto needed = 16 + device.id.size() + device.name.size();
  // Reserve headers for all five possible classes, even before they are visited.
  const auto remaining_headers = (report_.classes.size() - report_.class_count) * 8;
  if (report_.device_count >= maximum_ || bytes_ > wire::maximum_bytes - remaining_headers ||
      needed > wire::maximum_bytes - remaining_headers - bytes_) {
    limited_ = true;
    return false;
  }
  auto &owned = storage_->devices[report_.device_count];
  std::copy(device.id.begin(), device.id.end(), owned.id.begin());
  std::copy(device.name.begin(), device.name.end(), owned.name.begin());
  report_.devices[report_.device_count++] = {
      ::bridge::compat::span<const std::uint8_t>(owned.id).first(device.id.size()),
      ::bridge::compat::span<const std::uint8_t>(owned.name).first(device.name.size()),
      device.vendor, device.product, device.bus, device.address};
  ++group.count;
  bytes_ += needed;
  return true;
}
void Snapshot::finish(wire::Status status) {
  if (!active_ || static_cast<unsigned>(status) > 5) throw ::bridge::ipc::ProtocolError();
  active_ = false;
  auto &group = report_.classes[report_.class_count - 1];
  group.status = invalid_ ? wire::Status::failure : limited_ ? wire::Status::limit : status;
  if (group.status != wire::Status::available && group.status != wire::Status::limit) {
    while (report_.device_count > group.first) {
      auto &device = report_.devices[--report_.device_count];
      bytes_ -= 16 + device.id.size() + device.name.size();
      device = {};
      storage_->devices[report_.device_count] = {};
    }
    group.count = 0;
  }
}
} // namespace bridge::devices
