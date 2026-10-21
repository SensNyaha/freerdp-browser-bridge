#include "../compat/span.hpp"
#include "cursor.hpp"
#include <catch2/catch_test_macros.hpp>
using namespace bridge::ipc;
TEST_CASE("Cursor updates retain one shape and separate visibility/position from pixels") {
  std::vector<Packet> packets;
  bridge::cursor::State state([&](const Packet &p) { packets.push_back(p); });
  state.initialize();
  REQUIRE(packets.back().request_id == 0);
  REQUIRE(packets.back().kind == Kind::cursor_update);
  REQUIRE(packets.back().payload.size() == 40);
  REQUIRE(read_be(::bridge::compat::span(packets.back().payload).subspan(2, 2)) == 3);
  state.shape({7, 2, 1, 1, 0, {255, 0, 0, 255, 0, 0, 255, 0}});
  REQUIRE(packets.back().payload.size() == 48);
  REQUIRE(read_be(::bridge::compat::span(packets.back().payload).subspan(12, 8)) == 7);
  state.position(500, 300);
  REQUIRE(packets.back().payload.size() == 40);
  REQUIRE(read_be(::bridge::compat::span(packets.back().payload).subspan(28, 2)) == 500);
  const auto count = packets.size();
  state.position(500, 300);
  REQUIRE(packets.size() == count);
  state.visibility(false);
  REQUIRE(read_be(::bridge::compat::span(packets.back().payload).subspan(2, 2)) == 4);
  state.visibility(true);
  REQUIRE(packets.back().payload.size() == 40);
  REQUIRE(state.shape_id() == 7);
  state.default_shape();
  REQUIRE(state.shape_id() == 0);
  REQUIRE(read_be(::bridge::compat::span(packets.back().payload).subspan(2, 2)) == 7);
  REQUIRE_THROWS_AS(state.position(65536, 0), ProtocolError);
  REQUIRE_THROWS_AS(state.shape({1, 2, 1, 2, 0, std::vector<std::uint8_t>(8)}), ProtocolError);
  REQUIRE_THROWS_AS(state.shape({1, 385, 1, 0, 0, {}}), ProtocolError);
  REQUIRE_THROWS_AS(state.shape({1, 2, 1, 0, 0, {}}), ProtocolError);
}
TEST_CASE("Cursor IPC checks class limits before allocation") {
  REQUIRE_THROWS_AS(encode({Kind::cursor_update, 0, std::vector<std::uint8_t>(39)}), ProtocolError);
  REQUIRE_THROWS_AS(encode({Kind::cursor_update, 0,
                            std::vector<std::uint8_t>(40 + bridge::cursor::max_rgba_bytes + 1)}),
                    ProtocolError);
  const auto record = encode(
      {Kind::cursor_update, 0, std::vector<std::uint8_t>(40 + bridge::cursor::max_rgba_bytes)});
  REQUIRE(decode_header(::bridge::compat::span(record).first(header_bytes)).length ==
          40 + bridge::cursor::max_rgba_bytes);
}
