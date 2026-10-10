#include "dispatch_queue.hpp"
#include "touch_ipc.hpp"
#include <algorithm>
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <memory>
using namespace bridge::touch;
using bridge::ipc::ProtocolError;
namespace {
constexpr std::array<std::uint8_t, 16> canonical{0, 1, 1,    0,    1, 2, 3, 4,
                                                 0, 0, 0x12, 0x34, 0, 0, 5, 0x67};
}
TEST_CASE("Touch v2 generation token and availability records are independently bounded") {
  std::vector<std::uint8_t> p(canonical.begin(), canonical.end());
  p[1] = 2;
  p.insert(p.end(), {0, 0, 0, 0, 0, 0, 0, 3});
  REQUIRE(decode_request(p).generation == 3);
  REQUIRE(decode_request(p).event == Event{Action::begin, 0x01020304, 0x1234, 0x567});
  for (std::size_t n = 0; n < p.size(); ++n)
    REQUIRE_THROWS_AS(decode_request(std::span(p).first(n)), ProtocolError);
  p.back() = 0;
  REQUIRE_THROWS_AS(decode_request(p), ProtocolError);
  const Update u{1, 3, 1920, 1080, 10, true, Availability::ready};
  const auto bytes = encode_update(u);
  REQUIRE(bytes.size() == 32);
  REQUIRE(bridge::ipc::read_be(std::span(bytes).subspan(12, 8)) == 3);
  REQUIRE(bytes[24] == 0);
  REQUIRE(bytes[25] == 10);
  for (const auto invalid : {Update{0, 3, 1920, 1080, 10, true, Availability::ready},
                             Update{1, 0, 1920, 1080, 10, true, Availability::ready},
                             Update{1, 3, 7681, 1080, 10, true, Availability::ready},
                             Update{1, 3, 1920, 1080, 11, true, Availability::ready},
                             Update{1, 3, 1920, 1080, 0, true, Availability::ready},
                             Update{1, 3, 1920, 1080, 10, false, Availability::ready},
                             Update{1, 3, 1920, 1080, 10, true, Availability::suspended}})
    REQUIRE_THROWS_AS(encode_update(invalid), ProtocolError);
}
TEST_CASE(
    "Mixed input queue preserves touch, reset and key ordering across fixed-ring wrap/overflow") {
  auto queue = std::make_unique<bridge::input::Queue>();
  REQUIRE_FALSE(queue->pop());
  for (unsigned cycle = 0; cycle < 4; ++cycle) {
    for (unsigned i = 0; i < 64; ++i) {
      const bool touch = (i % 3) == 0;
      if (touch)
        REQUIRE(queue->push(i, Request{{Action::begin, i, 100, 200}, 9}));
      else
        REQUIRE(queue->push(i, bridge::input::Event{i % 3 == 1 ? bridge::input::Type::reset
                                                               : bridge::input::Type::key}));
    }
    REQUIRE_FALSE(queue->push(64, Request{{Action::begin, 64, 100, 200}, 9}));
    for (unsigned i = 0; i < 64; ++i) {
      const auto record = queue->pop();
      REQUIRE(record);
      REQUIRE(record->request == i);
      if (i % 3 == 0)
        REQUIRE(std::get<Request>(record->event).generation == 9);
      else
        REQUIRE(std::get<bridge::input::Event>(record->event).type ==
                (i % 3 == 1 ? bridge::input::Type::reset : bridge::input::Type::key));
    }
    REQUIRE_FALSE(queue->pop());
  }
}
TEST_CASE("Touch IPC v1 independent big-endian contact/action vectors") {
  REQUIRE(decode_ipc(canonical) == Event{Action::begin, 0x01020304, 0x1234, 0x567});
  const std::array actions{Action::begin, Action::update, Action::end, Action::cancel};
  for (std::size_t i = 0; i < actions.size(); ++i) {
    auto packet = canonical;
    packet[2] = static_cast<std::uint8_t>(i + 1);
    REQUIRE(decode_ipc(packet) == Event{actions[i], 0x01020304, 0x1234, 0x567});
  }
  auto low = canonical;
  std::fill(low.begin() + 4, low.end(), std::uint8_t{0});
  REQUIRE(decode_ipc(low) == Event{Action::begin, 0, 0, 0});
  const std::array<std::uint8_t, 16> high{0, 1, 4,    0,    0x7f, 0xff, 0xff, 0xff,
                                          0, 0, 0x1d, 0xff, 0,    0,    0x10, 0xdf};
  REQUIRE(decode_ipc(high) == Event{Action::cancel, 0x7fffffff, 7679, 4319});
}
TEST_CASE("Touch IPC rejects truncation and unknown version/action/reserved byte before decoding") {
  for (std::size_t length = 0; length < canonical.size(); ++length)
    REQUIRE_THROWS_AS(decode_ipc(std::span(canonical).first(length)), ProtocolError);
  std::array<std::uint8_t, 17> longer{};
  std::copy(canonical.begin(), canonical.end(), longer.begin());
  REQUIRE_THROWS_AS(decode_ipc(longer), ProtocolError);
  for (std::size_t offset = 0; offset < 4; ++offset) {
    for (unsigned byte = 0; byte <= 255; ++byte) {
      auto packet = canonical;
      packet[offset] = static_cast<std::uint8_t>(byte);
      const bool valid = offset == 2 ? byte >= 1 && byte <= 4 : byte == canonical[offset];
      if (valid)
        REQUIRE_NOTHROW(decode_ipc(packet));
      else
        REQUIRE_THROWS_AS(decode_ipc(packet), ProtocolError);
    }
  }
}
TEST_CASE("Touch IPC rejects signed IDs and coordinate overflow without coercion") {
  for (const auto sample : {std::array<std::uint32_t, 2>{4, 0x80000000},
                            {4, 0xffffffff},
                            {8, 7680},
                            {8, 0xffffffff},
                            {12, 4320},
                            {12, 0xffffffff}}) {
    auto packet = canonical;
    for (std::size_t i = 0; i < 4; ++i)
      packet[sample[0] + i] = static_cast<std::uint8_t>(sample[1] >> ((3 - i) * 8));
    REQUIRE_THROWS_AS(decode_ipc(packet), ProtocolError);
  }
}
TEST_CASE(
    "Touch IPC framing checks fixed length before body allocation and preserves request IDs") {
  using namespace bridge::ipc;
  const auto bytes = encode({Kind::input_touch, UINT64_MAX, {canonical.begin(), canonical.end()}});
  const auto header = decode_header(std::span(bytes).first(header_bytes));
  REQUIRE(header.kind == Kind::input_touch);
  REQUIRE(header.request_id == UINT64_MAX);
  REQUIRE(header.length == ipc_event_bytes);
  REQUIRE(decode_ipc(std::span(bytes).subspan(header_bytes)) ==
          Event{Action::begin, 0x01020304, 0x1234, 0x567});
  const std::array<std::uint32_t, 8> invalid{0, 1, 12, 15, 17, 4096, 0x80000000, 0xffffffff};
  for (const auto length : invalid) {
    auto header_bytes_only = std::vector<std::uint8_t>(bytes.begin(), bytes.begin() + header_bytes);
    for (std::size_t i = 0; i < 4; ++i)
      header_bytes_only[20 + i] = static_cast<std::uint8_t>(length >> ((3 - i) * 8));
    REQUIRE_THROWS_AS(decode_header(header_bytes_only), ProtocolError);
  }
  REQUIRE_THROWS_AS(encode({Kind::input_touch, 1, std::vector<std::uint8_t>(15)}), ProtocolError);
  REQUIRE_THROWS_AS(encode({Kind::input_touch, 1, std::vector<std::uint8_t>(17)}), ProtocolError);
}
