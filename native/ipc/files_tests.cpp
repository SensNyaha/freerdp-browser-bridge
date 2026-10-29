#include "files.hpp"
#include <catch2/catch_test_macros.hpp>
#include <limits>

namespace wire = bridge::ipc::files;
using namespace bridge::ipc;
TEST_CASE("File IPC uses an independently specified binary vector and validates class limits before allocation") {
  const std::vector<std::uint8_t> golden{
    0,1,0,3,0,0,0,0, 0,0,0,0,0,0,0,1, 0,0,0,0,0,0,0,3,
    0,0,0,0,0,0,0,0, 0,0,0,3,0,0,0,0, 0,1,255};
  const std::array<std::uint8_t,3> data{0,1,255};
  REQUIRE(wire::encode({wire::Operation::write, bridge::files::StoreStatus::ok, 0, 1, 3, 0, data}, false) == golden);
  const auto decoded = wire::decode(golden, false);
  REQUIRE(decoded.operation == wire::Operation::write);
  REQUIRE(decoded.id == 1);
  REQUIRE(decoded.argument == 3);
  REQUIRE(decoded.data.data() == golden.data() + wire::metadata_bytes);
  for (const auto kind : {Kind::file_command, Kind::file_result}) {
    REQUIRE_NOTHROW(encode_header({kind, 1, static_cast<std::uint32_t>(wire::max_record_bytes)}));
    for (const std::uint32_t length : {0U, 39U, static_cast<std::uint32_t>(wire::max_record_bytes + 1), std::numeric_limits<std::uint32_t>::max()})
      REQUIRE_THROWS_AS(encode_header({kind, 1, length}), ProtocolError);
    REQUIRE_THROWS_AS(encode_header({kind, 0, 40}), ProtocolError);
  }
  for (const unsigned at : {0U, 3U, 4U, 6U, 32U, 36U}) {
    auto bad = golden;bad[at] = 255;
    REQUIRE_THROWS_AS(wire::decode(bad, false), ProtocolError);
  }
  for (std::size_t length = 0; length < golden.size(); ++length)
    REQUIRE_THROWS_AS(wire::decode(::bridge::compat::span(golden).first(length), false), ProtocolError);
}
TEST_CASE("File IPC refuses oversized requests arithmetic overflow and noncanonical metadata") {
  using Operation = wire::Operation;
  using Status = bridge::files::StoreStatus;
  for (const auto record : {
      wire::Record{Operation::initialize, Status::ok, 0, 1, 2, 0, {}},
      wire::Record{Operation::initialize, Status::ok, 0, 1, 1, 65537, {}},
      wire::Record{Operation::read, Status::ok, 0, 1, 0, 65537, {}},
      wire::Record{Operation::read, Status::ok, 0, 1, 0, 0, {}},
      wire::Record{Operation::list, Status::ok, 0, 0, 0, 65, {}},
      wire::Record{Operation::commit, Status::ok, 2, 1, 0, 0, {}},
      wire::Record{Operation::retire, Status::ok, 0, 1, 0, 0, {}},
      wire::Record{Operation::abort, Status::ok, 0, 1, 1, 0, {}}})
    REQUIRE_THROWS_AS(wire::encode(record, false), ProtocolError);
  const std::array<std::uint8_t,1> byte{1};
  REQUIRE_THROWS_AS(wire::encode({Operation::write, Status::ok, 0, 1,
      static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max()), 0, byte}, false), ProtocolError);
  const std::vector<std::uint8_t> large(65537);
  REQUIRE_THROWS_AS(wire::encode({Operation::write, Status::ok, 0, 1, 0, 0, large}, false), ProtocolError);
  REQUIRE_THROWS_AS(wire::encode({Operation::read, Status::denied, 0, 1, 0, 1, byte}, true), ProtocolError);
  REQUIRE_THROWS_AS(wire::encode({Operation::list, Status::ok, 0, 1, 0, 0, {}}, true), ProtocolError);
}
TEST_CASE("File initialization permits only the explicit XRDP policy bit and responses keep zero flags") {
  using Operation = wire::Operation;
  using Status = bridge::files::StoreStatus;
  wire::Record selected{Operation::initialize, Status::ok, 1, 128, 64, 4, {}};
  const auto bytes = wire::encode(selected, false);
  REQUIRE(bytes.size() == 40);REQUIRE(bytes[6] == 0);REQUIRE(bytes[7] == 1);
  REQUIRE(wire::decode(bytes, false).flags == 1);
  REQUIRE_THROWS_AS(wire::encode(selected, true), ProtocolError);
  for (const auto flag : {2U, 3U, 0xffffU}) {
    selected.flags = static_cast<std::uint16_t>(flag);
    REQUIRE_THROWS_AS(wire::encode(selected, false), ProtocolError);
  }
  selected.flags = 1;selected.operation = Operation::retire;
  REQUIRE_THROWS_AS(wire::encode(selected, false), ProtocolError);
}
