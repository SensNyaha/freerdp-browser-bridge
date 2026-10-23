#include "../compat/span.hpp"
#include "clipboard.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <limits>
using namespace bridge::ipc::clipboard;
using bridge::ipc::ProtocolError;
namespace {
const std::vector<std::uint8_t> state_vector{0, 1, 0, 15, 0, 16, 0, 0, 0, 0, 0, 0,
                                             0, 0, 0, 1,  0, 0,  0, 0, 0, 0, 0, 2};
const std::vector<std::uint8_t> read_vector{0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0,
                                            0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2};
const std::vector<std::uint8_t> unicode{0xd0, 0x96, 0xf0, 0x9f, 0x98, 0x80, 10};
} // namespace
TEST_CASE("Clipboard private state uses an independent versioned scalar vector") {
  const auto s = decode_state(state_vector);
  REQUIRE(s.generation == 1);
  REQUIRE(s.revision == 2);
  REQUIRE(s.maximum == 1048576);
  REQUIRE(s.ready);
  REQUIRE(s.to_server);
  REQUIRE(s.from_server);
  REQUIRE(s.remote_text);
  REQUIRE_FALSE(s.local_accepted);
  REQUIRE_FALSE(s.local_pending);
  REQUIRE_FALSE(s.remote_pending);
  const auto encoded = encode_state(s);
  REQUIRE(std::equal(encoded.begin(), encoded.end(), state_vector.begin(), state_vector.end()));
  for (std::size_t n = 0; n < state_vector.size(); ++n)
    REQUIRE_THROWS_AS(decode_state(::bridge::compat::span(state_vector).first(n)), ProtocolError);
  for (const auto at : {1U, 2U, 3U, 5U, 15U, 23U}) {
    auto bad = state_vector;
    bad[at] = at == 2 ? 1 : 0;
    REQUIRE_THROWS_AS(decode_state(bad), ProtocolError);
  }
  for (const auto flags : {0U, 8U, 15U | 16U | 32U, 1U | 2U | 8U, 2U | 16U}) {
    auto bad = state_vector;
    bad[3] = static_cast<std::uint8_t>(flags);
    REQUIRE_THROWS_AS(decode_state(bad), ProtocolError);
  }
}
TEST_CASE("Clipboard private commands and results borrow UTF8 after exact metadata validation") {
  const auto read = decode_command(read_vector);
  REQUIRE(read.operation == Operation::read);
  REQUIRE(read.generation == 1);
  REQUIRE(read.revision == 2);
  REQUIRE(read.text.empty());
  REQUIRE(encode_command(read) == read_vector);
  auto set = read_vector;
  set[3] = 2;
  set[23] = 0;
  set.insert(set.end(), unicode.begin(), unicode.end());
  const auto command = decode_command(set);
  REQUIRE(command.operation == Operation::set);
  REQUIRE(command.text.data() == set.data() + metadata_bytes);
  REQUIRE(std::equal(command.text.begin(), command.text.end(), unicode.begin(), unicode.end()));
  REQUIRE(encode_command(command) == set);
  auto reply = read_vector;
  reply.insert(reply.end(), unicode.begin(), unicode.end());
  const auto result = decode_result(reply);
  REQUIRE(result.status == Status::accepted);
  REQUIRE(result.text.data() == reply.data() + metadata_bytes);
  REQUIRE(encode_result(result) == reply);
  for (unsigned status = 1; status <= 7; ++status) {
    auto refused = read_vector;
    refused[5] = static_cast<std::uint8_t>(status);
    REQUIRE(encode_result(decode_result(refused)) == refused);
    REQUIRE_THROWS_AS(decode_command(refused), ProtocolError);
    refused.push_back(65);
    REQUIRE_THROWS_AS(decode_result(refused), ProtocolError);
  }
  auto local_result = set;
  local_result.resize(metadata_bytes);
  REQUIRE(decode_result(local_result).operation == Operation::set);
}
TEST_CASE("Clipboard private malformed metadata and text never disclose their input") {
  for (std::size_t n = 0; n < read_vector.size(); ++n) {
    REQUIRE_THROWS_AS(decode_command(::bridge::compat::span(read_vector).first(n)), ProtocolError);
    REQUIRE_THROWS_AS(decode_result(::bridge::compat::span(read_vector).first(n)), ProtocolError);
  }
  for (const auto at : {0U, 1U, 2U, 3U, 4U, 5U, 6U, 7U, 15U, 23U}) {
    auto bad = read_vector;
    bad[at] = at == 1 || at == 3 || at == 15 || at == 23 ? 0 : 255;
    REQUIRE_THROWS_AS(decode_command(bad), ProtocolError);
  }
  const std::vector<std::vector<std::uint8_t>> invalid{
      {0},         {65, 0}, {0x80}, {0xc0, 0xaf}, {0xed, 0xa0, 0x80}, {0xf4, 0x90, 0x80, 0x80},
      {0xf0, 0x9f}};
  for (const auto &text : invalid) {
    REQUIRE_THROWS_AS(encode_command({Operation::set, 1, 0, text}), ProtocolError);
    REQUIRE_THROWS_AS(encode_result({Operation::read, Status::accepted, 1, 2, text}),
                      ProtocolError);
  }
  REQUIRE_THROWS_AS(encode_command({Operation::read, 1, 2, unicode}), ProtocolError);
  REQUIRE_THROWS_AS(encode_result({Operation::set, Status::accepted, 1, 0, unicode}),
                    ProtocolError);
  REQUIRE_THROWS_AS(encode_result({Operation::read, static_cast<Status>(8), 1, 2, {}}),
                    ProtocolError);
  REQUIRE_THROWS_AS(encode_command({static_cast<Operation>(4), 1, 0, {}}), ProtocolError);
}
TEST_CASE("Clipboard revoke is an exact schema-2 content-free command and result") {
  const std::vector<std::uint8_t> golden{0, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0,
                                         0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0};
  REQUIRE(encode_command({Operation::revoke, 1, 0, {}}) == golden);
  REQUIRE(decode_command(golden).operation == Operation::revoke);
  REQUIRE(encode_result({Operation::revoke, Status::accepted, 1, 0, {}}) == golden);
  REQUIRE(decode_result(golden).operation == Operation::revoke);
  for (std::size_t n = 0; n < golden.size(); ++n)
    REQUIRE_THROWS_AS(decode_command(::bridge::compat::span(golden).first(n)), ProtocolError);
  for (unsigned status = 0; status <= 7; ++status) {
    auto bytes = golden;
    bytes[5] = static_cast<std::uint8_t>(status);
    REQUIRE(encode_result(decode_result(bytes)) == bytes);
    bytes.push_back(65);
    REQUIRE_THROWS_AS(decode_result(bytes), ProtocolError);
    REQUIRE_THROWS_AS(decode_command(bytes), ProtocolError);
  }
  for (const auto schema : {0U, 1U, 3U}) {
    auto bytes = golden;
    bytes[1] = static_cast<std::uint8_t>(schema);
    REQUIRE_THROWS_AS(decode_command(bytes), ProtocolError);
    REQUIRE_THROWS_AS(decode_result(bytes), ProtocolError);
  }
  auto old = read_vector;
  old[1] = 2;
  REQUIRE_THROWS_AS(decode_command(old), ProtocolError);
  REQUIRE_THROWS_AS(decode_result(old), ProtocolError);
  REQUIRE_THROWS_AS(encode_command({Operation::revoke, 1, 1, {}}), ProtocolError);
  REQUIRE_THROWS_AS(encode_command({Operation::revoke, 1, 0, unicode}), ProtocolError);
}
TEST_CASE(
    "Clipboard private text boundaries include normalized UTF16 terminator and full u64 identity") {
  const auto largest = (std::numeric_limits<std::uint64_t>::max)();
  REQUIRE(decode_command(encode_command({Operation::read, largest, largest, {}})).revision ==
          largest);
  std::vector<std::uint8_t> text(max_text_bytes / 2 - 1, 65);
  const auto payload = encode_command({Operation::set, 1, 0, text});
  REQUIRE(payload.size() == metadata_bytes + text.size());
  REQUIRE(decode_command(payload).text.size() == text.size());
  text.push_back(65);
  REQUIRE_THROWS_AS(encode_command({Operation::set, 1, 0, text}), ProtocolError);
  text.resize(max_text_bytes + 1);
  REQUIRE_THROWS_AS(encode_command({Operation::set, 1, 0, text}), ProtocolError);
  REQUIRE_THROWS_AS(decode_command(text), ProtocolError);
  REQUIRE(encode_command({Operation::set, 1, 0, {}}).size() == metadata_bytes);
}
TEST_CASE("Clipboard RWI1 header limits and correlation precede payload allocation") {
  using namespace bridge::ipc;
  for (const auto kind : {Kind::clipboard_command, Kind::clipboard_result}) {
    for (const auto size : {metadata_bytes, max_record_bytes}) {
      const auto h = decode_header(encode_header({kind, 1, static_cast<std::uint32_t>(size)}));
      REQUIRE(h.length == size);
    }
    for (const auto size : {std::size_t{0}, metadata_bytes - 1, max_record_bytes + 1})
      REQUIRE_THROWS_AS(validate_header({kind, 1, static_cast<std::uint32_t>(size)}),
                        ProtocolError);
    REQUIRE_THROWS_AS(validate_header({kind, 0, metadata_bytes}), ProtocolError);
  }
  REQUIRE_NOTHROW(validate_header({Kind::clipboard_state, 0, metadata_bytes}));
  REQUIRE_THROWS_AS(validate_header({Kind::clipboard_state, 1, metadata_bytes}), ProtocolError);
  REQUIRE_THROWS_AS(validate_header({Kind::clipboard_state, 0, metadata_bytes + 1}), ProtocolError);
  REQUIRE_THROWS_AS(validate_header({Kind::frame, 1, static_cast<std::uint32_t>(max_record_bytes)}),
                    ProtocolError);
}
