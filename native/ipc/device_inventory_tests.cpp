#include "device_inventory.hpp"
#include <catch2/catch_test_macros.hpp>
#include <memory>

namespace wire = bridge::ipc::inventory;
using bridge::ipc::ProtocolError;
namespace {
const std::vector<std::uint8_t> golden{
    0,1,0,1,0,1,0,0, 0,5,0,0,0,1,0,0,
    0,1,0,2,0x12,0x34,0xab,0xcd,2,3,0,0,0,0,0,0, 0x75,0xd0,0x96};
}
TEST_CASE("Host inventory agrees with independent request and Unicode USB report vectors") {
  const std::array<std::uint8_t, 8> request{0,1,0,17,0,128,0,0};
  REQUIRE(wire::encode_request({17,128}) == request);
  REQUIRE(wire::decode_request(request).classes == 17);
  REQUIRE(wire::decode_request(request).maximum == 128);
  const auto report = wire::decode_report(golden);
  REQUIRE(report.class_count == 1);
  REQUIRE(report.device_count == 1);
  REQUIRE(report.classes[0].kind == wire::DeviceClass::usb);
  REQUIRE(report.devices[0].vendor == 0x1234);
  REQUIRE(report.devices[0].product == 0xabcd);
  REQUIRE(report.devices[0].bus == 2);
  REQUIRE(report.devices[0].address == 3);
  REQUIRE(report.devices[0].name.size() == 2);
  REQUIRE(report.devices[0].name.data() == golden.data() + 33); // Borrowed, no string copy.
  REQUIRE(wire::encode_report(report) == golden);
  REQUIRE_NOTHROW(wire::validate_selection(report, {16,1}));
  REQUIRE_THROWS_AS(wire::validate_selection(report, {1,1}), ProtocolError);
}
TEST_CASE("Host inventory refuses all truncations and reserved/count/text/metadata mutations") {
  for (std::size_t size = 0; size < golden.size(); ++size)
    REQUIRE_THROWS_AS(wire::decode_report(bridge::compat::span<const std::uint8_t>(golden).first(size)), ProtocolError);
  const std::array<std::pair<std::size_t,std::uint8_t>, 25> changes{{
    {1,2},{3,0},{3,6},{5,0},{5,129},{7,1},{9,0},{9,6},{11,6},{13,2},
    {15,1},{17,0},{16,1},{19,0},{18,1},{26,1},{31,1},{32,0},{33,0xc0},{34,0xff},
    {21,255},{23,255},{24,255},{25,255},{11,3}}};
  for (const auto [offset, value] : changes) {
    auto bytes = golden;
    bytes[offset] = value;
    if (offset >= 20 && offset <= 25) {
      // USB numeric fields are valid at their full wire range; not on another class.
      bytes[9] = 3;
    }
    REQUIRE_THROWS_AS(wire::decode_report(bytes), ProtocolError);
  }
  auto trailing = golden;trailing.push_back(0);
  REQUIRE_THROWS_AS(wire::decode_report(trailing), ProtocolError);
  const std::vector<std::uint8_t> oversized(wire::maximum_bytes + 1);
  REQUIRE_THROWS_AS(wire::decode_report(oversized), ProtocolError);
  for (const wire::Request invalid : {wire::Request{0,1}, {32,1}, {16,0}, {16,129}})
    REQUIRE_THROWS_AS(wire::encode_request(invalid), ProtocolError);
  auto request = wire::encode_request({16,1});request[7] = 1;
  REQUIRE_THROWS_AS(wire::decode_request(request), ProtocolError);
}
TEST_CASE("Host inventory rejects duplicate IDs and classes and distinguishes empty unavailable results") {
  auto duplicate = golden;
  duplicate.insert(duplicate.end(), golden.begin() + 16, golden.end());
  duplicate[5] = 2;duplicate[13] = 2;
  REQUIRE_THROWS_AS(wire::decode_report(duplicate), ProtocolError);
  const std::vector<std::uint8_t> classes{0,1,0,2,0,0,0,0, 0,3,0,0,0,0,0,0, 0,3,0,0,0,0,0,0};
  REQUIRE_THROWS_AS(wire::decode_report(classes), ProtocolError);
  for (std::uint8_t status = 0; status < 6; ++status) {
    std::vector<std::uint8_t> empty{0,1,0,1,0,0,0,0, 0,2,0,status,0,0,0,0};
    REQUIRE(wire::encode_report(wire::decode_report(empty)) == empty);
    if (status != 0 && status != 4) {
      auto bytes = golden;bytes[11] = status;
      REQUIRE_THROWS_AS(wire::decode_report(bytes), ProtocolError);
    }
  }
}
TEST_CASE("Host inventory admits exact count/text limits but rejects output overflow before reserve") {
  std::array<std::uint8_t, 255> name{};name.fill('n');
  const auto ids = std::make_unique<std::array<std::array<std::uint8_t, 255>, wire::maximum_devices>>();
  wire::ReportView report{};
  report.class_count = 1;report.device_count = 128;
  report.classes[0] = {wire::DeviceClass::serial, wire::Status::available, 0,128};
  for (std::size_t i = 0; i < ids->size(); ++i) {
    (*ids)[i].fill('x');(*ids)[i][0] = static_cast<std::uint8_t>('A' + i / 26);
    (*ids)[i][1] = static_cast<std::uint8_t>('a' + i % 26);
    report.devices[i].id = bridge::compat::span<const std::uint8_t>((*ids)[i]).first(2);
    report.devices[i].name = name;
  }
  const auto encoded = wire::encode_report(report);
  REQUIRE(wire::decode_report(encoded).device_count == 128);
  REQUIRE_THROWS_AS(wire::validate_selection(report, {4,127}), ProtocolError);
  for (std::size_t i = 0; i < ids->size(); ++i) {
    report.devices[i].id = i < 124 ? bridge::compat::span<const std::uint8_t>((*ids)[i])
                                  : bridge::compat::span<const std::uint8_t>((*ids)[i]).first(2);
    report.devices[i].name = i < 124 ? bridge::compat::span<const std::uint8_t>(name)
                                    : bridge::compat::span<const std::uint8_t>(name).first(56);
  }
  const auto exact = wire::encode_report(report);
  REQUIRE(exact.size() == wire::maximum_bytes);
  REQUIRE(wire::decode_report(exact).device_count == 128);
  report.devices[127].name = bridge::compat::span<const std::uint8_t>(name).first(57);
  REQUIRE_THROWS_AS(wire::encode_report(report), ProtocolError);
  for (std::size_t i = 0; i < ids->size(); ++i) report.devices[i].id = (*ids)[i];
  REQUIRE_THROWS_AS(wire::encode_report(report), ProtocolError);
  report.device_count = 129;
  REQUIRE_THROWS_AS(wire::encode_report(report), ProtocolError);
}
