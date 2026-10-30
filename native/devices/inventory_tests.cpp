#include "inventory.hpp"
#include <catch2/catch_test_macros.hpp>

using namespace bridge::devices;
namespace {
const std::array<std::uint8_t, 1> id{'i'}, name{'n'};
const wire::DeviceView device{id, name};
}
TEST_CASE("Inventory collector copies borrowed backend names and enforces global count") {
  Snapshot snapshot({31,1});
  snapshot.begin(wire::DeviceClass::printers);
  std::array<std::uint8_t, 1> temporary{'t'};
  REQUIRE(snapshot.append({temporary, name}));
  temporary[0] = 'X';
  snapshot.finish(wire::Status::available);
  snapshot.begin(wire::DeviceClass::smartcards);
  REQUIRE_FALSE(snapshot.append(device));
  snapshot.finish(wire::Status::available);
  snapshot.begin(wire::DeviceClass::serial);snapshot.finish(wire::Status::unavailable);
  snapshot.begin(wire::DeviceClass::parallel);snapshot.finish(wire::Status::denied);
  snapshot.begin(wire::DeviceClass::usb);snapshot.finish(wire::Status::unsupported);
  const auto &view = snapshot.view();
  REQUIRE(view.device_count == 1);
  REQUIRE(view.devices[0].id[0] == 't');
  REQUIRE(view.classes[1].status == wire::Status::limit);
  REQUIRE(view.classes[1].count == 0);
  REQUIRE_NOTHROW(wire::validate_selection(view, {31,1}));
  REQUIRE(wire::decode_report(wire::encode_report(view)).device_count == 1);
}
TEST_CASE("Inventory collector discards a failed class without damaging previous metadata") {
  Snapshot snapshot({7,8});
  snapshot.begin(wire::DeviceClass::printers);REQUIRE(snapshot.append(device));
  snapshot.finish(wire::Status::available);
  snapshot.begin(wire::DeviceClass::smartcards);REQUIRE(snapshot.append(device));
  snapshot.finish(wire::Status::denied);
  snapshot.begin(wire::DeviceClass::serial);REQUIRE(snapshot.append(device));
  REQUIRE_FALSE(snapshot.append(device)); // duplicate backend ID
  snapshot.finish(wire::Status::available);
  REQUIRE(snapshot.view().device_count == 1);
  REQUIRE(snapshot.view().classes[0].count == 1);
  REQUIRE(snapshot.view().classes[1].count == 0);
  REQUIRE(snapshot.view().classes[1].status == wire::Status::denied);
  REQUIRE(snapshot.view().classes[2].count == 0);
  REQUIRE(snapshot.view().classes[2].status == wire::Status::failure);
  REQUIRE_NOTHROW(wire::validate_selection(snapshot.view(), {7,8}));
}
TEST_CASE("Inventory collector enforces lifecycle request class and metadata bounds") {
  REQUIRE_THROWS_AS(Snapshot(wire::Request{0,1}), bridge::ipc::ProtocolError);
  Snapshot snapshot({1,8});
  REQUIRE_THROWS_AS(snapshot.append(device), bridge::ipc::ProtocolError);
  REQUIRE_THROWS_AS(snapshot.finish(wire::Status::available), bridge::ipc::ProtocolError);
  REQUIRE_THROWS_AS(snapshot.begin(wire::DeviceClass::usb), bridge::ipc::ProtocolError);
  snapshot.begin(wire::DeviceClass::printers);
  REQUIRE_THROWS_AS(snapshot.begin(wire::DeviceClass::printers), bridge::ipc::ProtocolError);
  const std::array<std::uint8_t, 2> control{0xc2,0x80};
  REQUIRE_FALSE(snapshot.append({id,control}));
  snapshot.finish(wire::Status::available);
  REQUIRE(snapshot.view().classes[0].status == wire::Status::failure);
  REQUIRE(snapshot.view().device_count == 0);
}
TEST_CASE("Inventory collector reports byte admission as explicit limit and remains encodable") {
  Snapshot snapshot({31,128});
  snapshot.begin(wire::DeviceClass::printers);
  std::array<std::uint8_t,255> label{};label.fill('n');
  unsigned admitted = 0;
  for (unsigned i = 0; i < 128; ++i) {
    label[0] = static_cast<std::uint8_t>('A' + i / 26);
    label[1] = static_cast<std::uint8_t>('a' + i % 26);
    if (!snapshot.append({label,label})) break;
    ++admitted;
  }
  REQUIRE(admitted == 124);
  snapshot.finish(wire::Status::available);
  for (unsigned kind = 2; kind <= 5; ++kind) {
    snapshot.begin(static_cast<wire::DeviceClass>(kind));snapshot.finish(wire::Status::unsupported);
  }
  REQUIRE(snapshot.view().classes[0].status == wire::Status::limit);
  const auto output = wire::encode_report(snapshot.view());
  REQUIRE(output.size() <= wire::maximum_bytes);
  REQUIRE(wire::decode_report(output).device_count == admitted);
}
