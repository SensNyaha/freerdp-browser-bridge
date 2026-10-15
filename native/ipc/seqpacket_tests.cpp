#include "seqpacket.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>

using namespace bridge::ipc;
namespace {
constexpr std::array<std::uint8_t, 48> hello{
    'R', 'W', 'S', '1', 0, 0, 0, 1, 0, 0, 0, 32, 0, 0, 0, 0, 'R', 'W', 'I', '1', 0, 1, 0, 1,
    0,   0,   0,   0,   0, 0, 0, 0, 0, 0, 0, 1,  0, 0, 0, 8, 0,   1,   0,   1,   0, 0, 0, 0};
std::vector<std::uint8_t> chunk(std::span<const std::uint8_t> record, std::uint32_t id,
                                std::size_t offset, std::size_t count) {
  const auto prefix = encode_seqpacket_prefix(id, static_cast<std::uint32_t>(record.size()),
                                              static_cast<std::uint32_t>(offset), count);
  std::vector<std::uint8_t> bytes(seqpacket_prefix_bytes + count);
  std::copy(prefix.begin(), prefix.end(), bytes.begin());
  std::copy_n(record.begin() + offset, count, bytes.begin() + seqpacket_prefix_bytes);
  return bytes;
}
} // namespace

TEST_CASE("RWS1 carrier independent vector preserves borrowed RWI1 bytes and advancing IDs") {
  const auto prefix = encode_seqpacket_prefix(1, 32, 0, 32);
  REQUIRE(std::equal(prefix.begin(), prefix.end(), hello.begin()));
  SeqpacketInspector inspector;
  REQUIRE(inspector.at_record_boundary());
  const auto data = inspector.inspect(hello);
  REQUIRE(data);
  REQUIRE(data->data() == hello.data() + seqpacket_prefix_bytes);
  REQUIRE(data->size() == 32);
  REQUIRE(inspector.at_record_boundary());
  const auto heartbeat = encode({Kind::heartbeat_ack, 2, {}});
  const auto next = chunk(heartbeat, 2, 0, heartbeat.size());
  REQUIRE(inspector.inspect(next));
  REQUIRE(inspector.at_record_boundary());
  REQUIRE_FALSE(inspector.inspect(hello));
  REQUIRE(inspector.failed());
  REQUIRE_FALSE(inspector.at_record_boundary());
  REQUIRE_FALSE(inspector.inspect(next));
}

TEST_CASE("RWS1 complete first header precedes payload progression and partial EOF stays visible") {
  for (std::size_t size = 0; size <= hello.size(); ++size) {
    SeqpacketInspector inspector;
    const auto data = inspector.inspect(std::span(hello).first(size));
    if (size < seqpacket_prefix_bytes + header_bytes) {
      REQUIRE_FALSE(data);
      REQUIRE(inspector.failed());
    } else {
      REQUIRE(data);
      REQUIRE_FALSE(inspector.failed());
      REQUIRE(inspector.at_record_boundary() == (size == hello.size()));
    }
  }
}

TEST_CASE("RWS1 maximum encoded frame crosses bounded chunks without retaining record storage") {
  const auto record =
      encode({Kind::frame, UINT64_MAX,
              std::vector<std::uint8_t>(max_jpeg_bytes + frame_metadata_bytes, 0xa5)});
  SeqpacketInspector inspector;
  std::size_t offset = 0, chunks = 0;
  while (offset < record.size()) {
    const auto count = std::min(seqpacket_chunk_bytes, record.size() - offset);
    const auto bytes = chunk(record, 1, offset, count);
    const auto data = inspector.inspect(bytes);
    REQUIRE(data);
    REQUIRE(data->size() == count);
    REQUIRE(std::equal(data->begin(), data->end(), record.begin() + offset));
    offset += count;
    ++chunks;
    REQUIRE(inspector.at_record_boundary() == (offset == record.size()));
  }
  REQUIRE(chunks == 513);
  REQUIRE(sizeof(SeqpacketInspector) <= 32);
}

TEST_CASE("RWS1 refuses prefix and inner length claims before exposing data") {
  for (const unsigned at : {0U, 3U, 7U, 11U, 15U, 16U, 21U, 23U, 24U, 39U}) {
    auto bad = hello;
    bad[at] ^= 0xff;
    SeqpacketInspector inspector;
    REQUIRE_FALSE(inspector.inspect(bad));
    REQUIRE(inspector.failed());
    REQUIRE_FALSE(inspector.inspect(hello));
  }
  auto bad = hello;
  std::fill(bad.begin() + 4, bad.begin() + 8, 0);
  SeqpacketInspector zero;
  REQUIRE_FALSE(zero.inspect(bad));
  std::vector<std::uint8_t> oversized(seqpacket_datagram_bytes + 1);
  SeqpacketInspector large;
  REQUIRE_FALSE(large.inspect(oversized));
  for (const auto total :
       {0U, 23U, static_cast<unsigned>(max_seqpacket_record_bytes + 1), UINT32_MAX})
    REQUIRE_THROWS_AS(encode_seqpacket_prefix(1, total, 0, 24), ProtocolError);
  REQUIRE_THROWS_AS(encode_seqpacket_prefix(0, 32, 0, 32), ProtocolError);
  REQUIRE_THROWS_AS(encode_seqpacket_prefix(1, 32, 0, 23), ProtocolError);
  REQUIRE_THROWS_AS(encode_seqpacket_prefix(1, 32, 32, 1), ProtocolError);
  REQUIRE_THROWS_AS(encode_seqpacket_prefix(1, 32, 31, 2), ProtocolError);
  REQUIRE_THROWS_AS(encode_seqpacket_prefix(1, UINT32_MAX, UINT32_MAX - 1, 2), ProtocolError);
}

TEST_CASE("RWS1 rejects reordered interleaved replaced and repeated partial records") {
  const auto record = encode({Kind::hello, 1, {0, 1, 0, 1, 0, 0, 0, 0}});
  for (unsigned fault = 0; fault < 5; ++fault) {
    SeqpacketInspector inspector;
    const auto first = chunk(record, 1, 0, 24);
    REQUIRE(inspector.inspect(first));
    REQUIRE_FALSE(inspector.at_record_boundary());
    auto next = chunk(record, 1, 24, 8);
    if (fault == 0)
      next[7] = 2; // Interleaved new record.
    if (fault == 1)
      next[11] = 33; // Replaced total.
    if (fault == 2)
      next[15] = 25; // Missing byte.
    if (fault == 3)
      next[15] = 23; // Repeated byte.
    if (fault == 4)
      next = first; // Restart during a partial record.
    REQUIRE_FALSE(inspector.inspect(next));
    REQUIRE(inspector.failed());
    REQUIRE_FALSE(inspector.inspect(chunk(record, 1, 24, 8)));
  }
  SeqpacketInspector inspector;
  REQUIRE(inspector.inspect(chunk(record, 1, 0, 24)));
  REQUIRE(inspector.inspect(chunk(record, 1, 24, 8)));
  REQUIRE(inspector.at_record_boundary());
}
TEST_CASE("RWS1 admits clipboard logical maxima only after the kind-specific RWI1 header") {
  const auto total = static_cast<std::uint32_t>(max_seqpacket_record_bytes);
  const auto prefix = encode_seqpacket_prefix(1, total, 0, header_bytes);
  for (const auto kind : {Kind::clipboard_command, Kind::clipboard_result, Kind::frame}) {
    std::array<std::uint8_t, seqpacket_prefix_bytes + header_bytes> first{};
    std::copy(prefix.begin(), prefix.end(), first.begin());
    // Independent raw RWI1 header, including a class that must remain too large.
    std::array<std::uint8_t, header_bytes> header{'R', 'W', 'I', '1', 0, 1};
    header[7] = static_cast<std::uint8_t>(kind);
    header[19] = 1;
    const auto size = total - header_bytes;
    for (unsigned i = 0; i < 4; ++i)
      header[20 + i] = static_cast<std::uint8_t>(size >> ((3 - i) * 8));
    std::copy(header.begin(), header.end(), first.begin() + seqpacket_prefix_bytes);
    SeqpacketInspector inspector;
    REQUIRE(inspector.inspect(first).has_value() == (kind != Kind::frame));
    REQUIRE(inspector.failed() == (kind == Kind::frame));
  }
}
