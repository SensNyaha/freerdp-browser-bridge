#pragma once
#include "../ipc/device_inventory.hpp"
#include <memory>

namespace bridge::devices {
namespace wire = ::bridge::ipc::inventory;
// Fixed, bounded owned storage; backend metadata never outlives its source API.
class Snapshot final {
  struct Storage;
  std::unique_ptr<Storage> storage_;
  wire::ReportView report_{};
  std::size_t bytes_ = 8;
  std::uint16_t maximum_ = 0;
  std::uint16_t selected_ = 0;
  bool limited_ = false, invalid_ = false, active_ = false;

public:
  explicit Snapshot(wire::Request request);
  ~Snapshot();
  Snapshot(const Snapshot &) = delete;
  Snapshot &operator=(const Snapshot &) = delete;
  void begin(wire::DeviceClass kind);
  // Returns false to stop enumeration. Invalid metadata fails the whole class;
  // an admission bound preserves the admitted prefix with explicit limit status.
  bool append(const wire::DeviceView &device);
  void finish(wire::Status status);
  const wire::ReportView &view() const noexcept { return report_; }
};
// Called only in a fresh, inventory-only worker. Potential OS/library waits are
// additionally bounded by that process's supervisor deadline and joined cleanup.
std::vector<std::uint8_t> discover(wire::Request request);
// Pinned optional library backends; foundation builds return unsupported.
wire::Status discover_usb(Snapshot &snapshot);
wire::Status discover_cups(Snapshot &snapshot);
wire::Status discover_pcsc(Snapshot &snapshot);
} // namespace bridge::devices
