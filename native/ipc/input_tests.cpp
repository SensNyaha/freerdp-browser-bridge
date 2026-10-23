#include "../compat/span.hpp"
#include "input.hpp"
#include <catch2/catch_test_macros.hpp>
using namespace bridge;
TEST_CASE("A new RDP pointer starts with three standard releases without local pressed ownership") {
  std::vector<input::Event> sent;
  REQUIRE(input::initialize_pointer([&](const auto &event) {
    sent.push_back(event);
    return true;
  }));
  REQUIRE(sent.size() == 3);
  for (std::size_t i = 0; i < sent.size(); ++i) {
    REQUIRE(sent[i].type == input::Type::button);
    REQUIRE(sent[i].flags == 0);
    REQUIRE(sent[i].a == 0);
    REQUIRE(sent[i].b == 0);
    REQUIRE(sent[i].c == i);
  }
  input::State state;
  REQUIRE(state.release([&](const auto &) {
    FAIL("Initial remote releases must not create local held ownership");
    return false;
  }));
}
TEST_CASE(
    "Initial remote button failure prevents later releases and never retries an uncertain write") {
  for (std::uint16_t failed = 0; failed < 3; ++failed) {
    unsigned calls = 0;
    const auto fail_release = [&](const input::Event &event) {
      ++calls;
      REQUIRE(event.type == input::Type::button);
      REQUIRE(event.flags == 0);
      return event.c != failed;
    };
    REQUIRE_FALSE(input::initialize_pointer(fail_release));
    REQUIRE(calls == failed + 1U);
  }
}
TEST_CASE(
    "International set-1 key records retain physical positions and reset releases every held key") {
  constexpr std::array<std::uint8_t, 8> scans{0x70, 0x71, 0x72, 0x73, 0x79, 0x7b, 0x7d, 0x7e};
  input::State state;
  std::vector<input::Event> sent;
  const input::State::Sink sink = [&](const auto &event) {
    sent.push_back(event);
    return true;
  };
  for (const auto scan : scans) {
    const std::array<std::uint8_t, 12> bytes{1, 1, 0, scan, 0, 0, 0, 0, 0, 0, 0, 0};
    const auto event = input::decode(bytes);
    REQUIRE(event.type == input::Type::key);
    REQUIRE(event.a == scan);
    REQUIRE(state.apply(event, sink, 1920, 1080));
  }
  REQUIRE(sent.size() == scans.size());
  REQUIRE(state.apply({input::Type::reset}, sink, 1920, 1080));
  REQUIRE(sent.size() == scans.size() * 2 + 3);
  for (std::size_t i = 0; i < scans.size(); ++i) {
    REQUIRE(sent[scans.size() + i].type == input::Type::key);
    REQUIRE(sent[scans.size() + i].a == scans[i]);
    REQUIRE(sent[scans.size() + i].flags == 0);
  }
  REQUIRE(state.release(sink));
  REQUIRE(sent.size() == scans.size() * 2 + 3);
}
TEST_CASE("Unicode text has independent UTF16BE vectors and rejects malformed bodies and lengths") {
  const std::vector<std::uint8_t> bytes{0x04, 0x16, 0x4e, 0x2d, 0xd8, 0x3d, 0xde, 0x00};
  const auto text = input::decode_text(bytes);
  REQUIRE(text.type == input::Type::text);
  REQUIRE(text.a == 4);
  REQUIRE(text.text[0] == 0x0416);
  REQUIRE(text.text[1] == 0x4e2d);
  REQUIRE(text.text[2] == 0xd83d);
  REQUIRE(text.text[3] == 0xde00);
  const auto record = ipc::encode({ipc::Kind::input_text, 42, bytes});
  REQUIRE(record[7] == 30);
  REQUIRE(ipc::decode_header(::bridge::compat::span(record).first(24)).length == 8);
  for (const auto &bad : std::vector<std::vector<std::uint8_t>>{{},
                                                                {0},
                                                                {0, 0},
                                                                {0, 0x1b},
                                                                {0, 0x7f},
                                                                {0, 0x85},
                                                                {0xd8, 0},
                                                                {0xdc, 0},
                                                                {0xd8, 0, 0, 65},
                                                                {0xdc, 0, 0xd8, 0}})
    REQUIRE_THROWS_AS(input::decode_text(bad), ipc::ProtocolError);
  std::vector<std::uint8_t> maximum;
  for (std::size_t i = 0; i < input::max_text_units; ++i)
    maximum.insert(maximum.end(), {0, 65});
  REQUIRE(input::decode_text(maximum).a == 256);
  REQUIRE_NOTHROW(ipc::encode({ipc::Kind::input_text, 1, maximum}));
  maximum.insert(maximum.end(), {0, 65});
  REQUIRE_THROWS_AS(input::decode_text(maximum), ipc::ProtocolError);
  REQUIRE_THROWS_AS(ipc::encode({ipc::Kind::input_text, 1, maximum}), ipc::ProtocolError);
  for (const auto length : {0U, 1U, 3U, 511U, 513U}) {
    auto header = record;
    header.resize(24);
    header[20] = header[21] = 0;
    header[22] = static_cast<std::uint8_t>(length >> 8);
    header[23] = static_cast<std::uint8_t>(length);
    REQUIRE_THROWS_AS(ipc::decode_header(header), ipc::ProtocolError);
  }
  REQUIRE_NOTHROW(input::decode_text(std::vector<std::uint8_t>{0, 9, 0, 10, 0, 13}));
}
TEST_CASE("Unicode text releases physical input then emits ordered paired units including "
          "supplementary text") {
  input::State state;
  std::vector<input::Event> sent;
  const input::State::Sink sink = [&](const auto &e) {
    sent.push_back(e);
    return true;
  };
  REQUIRE(state.apply({input::Type::key, 1, 0x1d}, sink, 100, 100));
  REQUIRE(state.apply({input::Type::button, 1, 1, 2, 0}, sink, 100, 100));
  const auto text = input::decode_text(std::vector<std::uint8_t>{0x04, 0x16, 0xd8, 0x3d, 0xde, 0});
  REQUIRE(state.apply(text, sink, 100, 100));
  REQUIRE(sent.size() == 10);
  REQUIRE(sent[2].type == input::Type::key);
  REQUIRE(sent[2].flags == 0);
  REQUIRE(sent[3].type == input::Type::button);
  REQUIRE(sent[3].flags == 0);
  for (std::size_t i = 0; i < 3; ++i) {
    REQUIRE(sent[4 + i * 2].type == input::Type::unicode);
    REQUIRE(sent[4 + i * 2].flags == 1);
    REQUIRE(sent[4 + i * 2].a == text.text[i]);
    REQUIRE(sent[5 + i * 2].type == input::Type::unicode);
    REQUIRE(sent[5 + i * 2].flags == 0);
    REQUIRE(sent[5 + i * 2].a == text.text[i]);
  }
  REQUIRE(state.release(sink));
  REQUIRE(sent.size() == 10);
}
TEST_CASE("Unicode send failure stops text and retains only an accepted down for release retry") {
  input::State state;
  const auto text = input::decode_text(std::vector<std::uint8_t>{0, 65, 0, 66});
  unsigned calls = 0;
  REQUIRE_FALSE(state.apply(
      text,
      [&](const auto &) {
        ++calls;
        return false;
      },
      1, 1));
  REQUIRE(calls == 1);
  REQUIRE(state.release([&](const auto &) {
    ++calls;
    return true;
  }));
  REQUIRE(calls == 1);
  REQUIRE_FALSE(state.apply(text, [&](const auto &) { return ++calls == 2; }, 1, 1));
  REQUIRE(calls == 3);
  const auto fail_unicode_release = [&](const input::Event &e) {
    REQUIRE(e.type == input::Type::unicode);
    REQUIRE(e.flags == 0);
    REQUIRE(e.a == 65);
    ++calls;
    return false;
  };
  REQUIRE_FALSE(state.release(fail_unicode_release));
  REQUIRE_FALSE(state.apply(text, [](const auto &) { return true; }, 1, 1));
  const auto accept_unicode_release = [&](const input::Event &e) {
    REQUIRE(e.type == input::Type::unicode);
    REQUIRE(e.flags == 0);
    REQUIRE(e.a == 65);
    ++calls;
    return true;
  };
  REQUIRE(state.release(accept_unicode_release));
  REQUIRE(calls == 5);
  REQUIRE(state.release([](const auto &) { return false; }));
}
TEST_CASE("Input records are bounded and validate flags before dispatch") {
  std::vector<std::uint8_t> p{1, 1, 1, 0x1d, 0, 0, 0, 0, 0, 0, 0, 0};
  REQUIRE(input::decode(p).a == 0x11d);
  auto record = ipc::encode({ipc::Kind::input, 1, p});
  REQUIRE(ipc::decode_header(::bridge::compat::span(record).first(ipc::header_bytes)).length == 12);
  record[23] = 13;
  REQUIRE_THROWS_AS(ipc::decode_header(::bridge::compat::span(record).first(ipc::header_bytes)),
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
  const auto accept_key_release = [&](const input::Event &e) {
    REQUIRE(e.a == 30);
    ++attempts;
    return true;
  };
  REQUIRE(state.release(accept_key_release));
  REQUIRE(attempts == 3);
}
TEST_CASE("Toggle synchronization preserves tracked physical modifier sides and release retry") {
  input::State state;
  std::vector<input::Event> sent;
  const input::State::Sink sink = [&](const auto &event) {
    sent.push_back(event);
    return true;
  };
  REQUIRE(state.apply({input::Type::key, 1, 0x1d}, sink, 1920, 1080));
  REQUIRE(state.apply({input::Type::key, 1, 0x11d}, sink, 1920, 1080));
  for (std::uint16_t mask = 0; mask <= 7; ++mask) {
    REQUIRE(state.apply({input::Type::sync, 0, mask}, sink, 1920, 1080));
    REQUIRE(sent.back().type == input::Type::sync);
    REQUIRE(sent.back().a == mask);
    REQUIRE(sent.back().flags == 0);
  }
  REQUIRE_FALSE(state.apply({input::Type::sync, 0, 7}, [](const auto &) { return false; }, 1, 1));
  REQUIRE(state.release(sink));
  REQUIRE(sent.size() == 12);
  REQUIRE(sent[10].a == 0x1d);
  REQUIRE(sent[11].a == 0x11d);
  REQUIRE(sent[10].flags == 0);
  REQUIRE(sent[11].flags == 0);
  REQUIRE(state.release(sink));
  REQUIRE(sent.size() == 12);
}
