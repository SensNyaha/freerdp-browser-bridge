#include "input.hpp"
#include <catch2/catch_test_macros.hpp>
using namespace bridge;
TEST_CASE("Input records are bounded and validate flags before dispatch") {
  std::vector<std::uint8_t> p{1, 1, 1, 0x1d, 0, 0, 0, 0, 0, 0, 0, 0};
  REQUIRE(input::decode(p).a == 0x11d);
  auto record = ipc::encode({ipc::Kind::input, 1, p});
  REQUIRE(ipc::decode_header(std::span(record).first(ipc::header_bytes)).length == 12);
  record[23] = 13;
  REQUIRE_THROWS_AS(ipc::decode_header(std::span(record).first(ipc::header_bytes)),
                    ipc::ProtocolError);
  p[1] = 2;
  REQUIRE_THROWS_AS(input::decode(p), ipc::ProtocolError);
  p[1] = 1;
  p[11] = 1;
  REQUIRE_THROWS_AS(input::decode(p), ipc::ProtocolError);
  p[11] = 0;
  p[0] = 7;
  REQUIRE_THROWS_AS(input::decode(p), ipc::ProtocolError);
  p.pop_back();
  REQUIRE_THROWS_AS(input::decode(p), ipc::ProtocolError);
}
TEST_CASE("Pressed input deduplicates, repeats and releases including extra mouse buttons") {
  input::State state;
  std::vector<input::Event> sent;
  const input::State::Sink sink = [&](const auto &e) {
    sent.push_back(e);
    return true;
  };
  REQUIRE(state.apply({input::Type::key, 1, 0x1d}, sink, 1920, 1080));
  REQUIRE(state.apply({input::Type::key, 1, 0x1d}, sink, 1920, 1080));
  REQUIRE(sent.size() == 1);
  REQUIRE(state.apply({input::Type::key, 3, 0x1d}, sink, 1920, 1080));
  REQUIRE(sent.back().flags == 3);
  REQUIRE(state.apply({input::Type::key, 1, 0x11d}, sink, 1920, 1080));
  REQUIRE(state.apply({input::Type::button, 1, 2000, 1100, 4}, sink, 1920, 1080));
  REQUIRE(sent.back().a == 1919);
  REQUIRE(sent.back().b == 1079);
  REQUIRE(state.release(sink));
  REQUIRE(sent.size() == 7);
  REQUIRE(sent[4].a == 0x1d);
  REQUIRE(sent[5].a == 0x11d);
  REQUIRE(sent[6].c == 4);
  REQUIRE(sent[6].flags == 0);
  REQUIRE(state.release(sink));
  REQUIRE(sent.size() == 7);
  REQUIRE(state.apply({input::Type::key, 0, 0x20}, sink, 1920, 1080));
  REQUIRE(sent.size() == 7);
}
TEST_CASE("Failed releases are retried without skipping other pressed keys") {
  input::State state;
  const input::State::Sink yes = [](const auto &) { return true; };
  REQUIRE(state.apply({input::Type::key, 1, 30}, yes, 1, 1));
  REQUIRE(state.apply({input::Type::key, 1, 31}, yes, 1, 1));
  unsigned attempts = 0;
  REQUIRE_FALSE(state.release([&](const auto &e) {
    ++attempts;
    return e.a != 30;
  }));
  REQUIRE(attempts == 2);
  REQUIRE(state.release([&](const auto &e) {
    REQUIRE(e.a == 30);
    ++attempts;
    return true;
  }));
  REQUIRE(attempts == 3);
}
