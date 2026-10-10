#include "audio.hpp"
#include "output_dispatcher.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <condition_variable>
#include <thread>
using namespace bridge::ipc;
namespace {
using namespace std::chrono_literals;
struct BlockedWrite {
  std::mutex mutex;
  std::condition_variable cv;
  bool entered = false, released = false;
  Header header{};
  std::vector<std::uint8_t> body;
  bool operator()(std::span<const std::uint8_t> bytes, std::span<const std::uint8_t> payload) {
    std::unique_lock lock(mutex);
    header = decode_header(bytes);
    body.assign(payload.begin(), payload.end());
    entered = true;
    cv.notify_all();
    return cv.wait_for(lock, 1s, [this] { return released; });
  }
  bool wait() {
    std::unique_lock lock(mutex);
    return cv.wait_for(lock, 1s, [this] { return entered; });
  }
  void unblock() {
    const std::lock_guard lock(mutex);
    released = true;
    cv.notify_all();
  }
};
DispatchAdmission config(OutputDispatcher &owner, std::uint64_t epoch) {
  return owner.try_send(Kind::audio_config, 0, audio::encode_config({epoch}));
}
DispatchAdmission pcm(OutputDispatcher &owner, std::uint64_t epoch, std::uint64_t pts) {
  std::array<std::uint8_t, audio::pcm_bytes> samples{};
  return owner.try_send(Kind::audio_pcm, 0,
                        audio::encode_packet({epoch, pts, 960, 0, true, samples}));
}
} // namespace
TEST_CASE(
    "Fixed IPC header matches complete encoding and rejects boundaries without body allocation") {
  Packet packet{Kind::frame_avc, UINT64_MAX, std::vector<std::uint8_t>(28)};
  const auto header = encode_header({packet.kind, packet.request_id, 28});
  const auto complete = encode(packet);
  REQUIRE(std::equal(header.begin(), header.end(), complete.begin()));
  REQUIRE(header[6] == 0);
  REQUIRE(header[7] == 21);
  REQUIRE(header[12] == 255);
  REQUIRE(header[19] == 255);
  REQUIRE(header[23] == 28);
  REQUIRE_THROWS_AS(encode_header({Kind::frame_avc, 1, 27}), ProtocolError);
  REQUIRE_THROWS_AS(encode_header({Kind::frame_avc, 1, UINT32_MAX}), ProtocolError);
  REQUIRE_THROWS_AS(encode_header({static_cast<Kind>(999), 1, 0}), ProtocolError);
}
TEST_CASE("Stalled external write leaves producer admission free and drains control before audio") {
  OutputDispatcher owner;
  std::array<std::uint8_t, 24> pixels{};
  REQUIRE(owner.try_send(Kind::frame, 100, pixels) == DispatchAdmission::accepted);
  BlockedWrite blocked;
  DispatchResult result = DispatchResult::idle;
  std::jthread writer([&] { result = owner.write_next(std::ref(blocked)); });
  const bool entered = blocked.wait();
  // The callback has a finite deadline so a regression cannot deadlock this test.
  const auto start = std::chrono::steady_clock::now();
  const auto admitted = owner.try_send(Kind::heartbeat_ack, 1, {});
  const auto elapsed = std::chrono::steady_clock::now() - start;
  const auto busy = owner.write_next([](auto, auto) { return true; });
  const auto audio_config = config(owner, 1);
  const auto audio_packet = pcm(owner, 1, 0);
  const auto snapshot = owner.try_stats();
  owner.finish();
  const auto refused = owner.try_send(Kind::heartbeat_ack, 2, {});
  pixels[0] = 77;
  blocked.unblock();
  writer.join();
  REQUIRE(entered);
  REQUIRE(admitted == DispatchAdmission::accepted);
  REQUIRE(elapsed < 200ms);
  REQUIRE(busy == DispatchResult::busy);
  REQUIRE(audio_config == DispatchAdmission::accepted);
  REQUIRE(audio_packet == DispatchAdmission::accepted);
  REQUIRE(snapshot);
  REQUIRE(snapshot->in_flight_bytes == 48);
  REQUIRE(snapshot->queued.records == 3);
  REQUIRE(refused == DispatchAdmission::closed);
  REQUIRE(result == DispatchResult::sent);
  REQUIRE(blocked.header.request_id == 100);
  REQUIRE(blocked.body[0] == 0);
  std::vector<Kind> order;
  const auto write = [&](auto header, auto body) {
    const auto decoded = decode_header(header);
    order.push_back(decoded.kind);
    REQUIRE(decoded.length == body.size());
    return true;
  };
  REQUIRE(owner.write_next(write) == DispatchResult::sent);
  REQUIRE(owner.write_next(write) == DispatchResult::sent);
  REQUIRE(owner.write_next(write) == DispatchResult::sent);
  REQUIRE(order == std::vector<Kind>{Kind::heartbeat_ack, Kind::audio_config, Kind::audio_pcm});
  REQUIRE(owner.write_next(write) == DispatchResult::closed);
  REQUIRE(owner.try_stats()->sent_records == 4);
  REQUIRE(owner.try_stats()->in_flight_bytes == 0);
}
TEST_CASE("Writer callback reentry cannot start a second record and may enqueue future control") {
  OutputDispatcher owner;
  REQUIRE(owner.write_next([](auto, auto) { return true; }) == DispatchResult::idle);
  REQUIRE(owner.try_send(Kind::heartbeat_ack, 1, {}) == DispatchAdmission::accepted);
  DispatchResult nested = DispatchResult::idle;
  DispatchAdmission admitted = DispatchAdmission::closed;
  REQUIRE(owner.write_next([&](auto, auto) {
    nested = owner.write_next([](auto, auto) { return true; });
    admitted = owner.try_send(Kind::heartbeat_ack, 2, {});
    return true;
  }) == DispatchResult::sent);
  REQUIRE(nested == DispatchResult::busy);
  REQUIRE(admitted == DispatchAdmission::accepted);
  REQUIRE(owner.try_stats()->queued.records == 1);
  REQUIRE(owner.write_next([](auto header, auto) {
    return decode_header(header).request_id == 2;
  }) == DispatchResult::sent);
  owner.finish();
  REQUIRE(owner.try_stats()->closed);
}
TEST_CASE(
    "Write failure and exceptions discard bounded pending records and refuse later producers") {
  for (unsigned mode = 0; mode < 3; ++mode) {
    OutputDispatcher owner;
    REQUIRE(owner.try_send(Kind::heartbeat_ack, 1, {}) == DispatchAdmission::accepted);
    REQUIRE(config(owner, 1) == DispatchAdmission::accepted);
    REQUIRE(pcm(owner, 1, 0) == DispatchAdmission::accepted);
    OutputDispatcher::Write write;
    if (mode != 2)
      write = [mode](auto, auto) -> bool {
        if (mode == 1)
          throw std::runtime_error("synthetic writer failure");
        return false;
      };
    REQUIRE(owner.write_next(write) == DispatchResult::failed);
    const auto stats = owner.try_stats();
    REQUIRE(stats->failed);
    REQUIRE(stats->closed);
    REQUIRE_FALSE(stats->accepting);
    REQUIRE(stats->queued.records == 0);
    REQUIRE(stats->queued.high_water_bytes > 0);
    REQUIRE(stats->in_flight_bytes == 0);
    REQUIRE(owner.try_send(Kind::heartbeat_ack, 2, {}) == DispatchAdmission::closed);
    REQUIRE(owner.write_next([](auto, auto) { return true; }) == DispatchResult::failed);
  }
}
TEST_CASE("Dispatcher reset clears unsent audio and abort waits for the externally owned in-flight "
          "write") {
  OutputDispatcher owner;
  REQUIRE(config(owner, 1) == DispatchAdmission::accepted);
  REQUIRE(pcm(owner, 1, 0) == DispatchAdmission::accepted);
  REQUIRE(owner.try_discard_audio());
  REQUIRE(owner.try_stats()->queued.records == 0);
  REQUIRE(owner.try_stats()->queued.discarded_audio == 1);
  REQUIRE(config(owner, 2) == DispatchAdmission::accepted);
  REQUIRE(pcm(owner, 2, 20000) == DispatchAdmission::accepted);
  BlockedWrite blocked;
  DispatchResult result = DispatchResult::idle;
  std::jthread writer([&] { result = owner.write_next(std::ref(blocked)); });
  const bool entered = blocked.wait();
  owner.abort();
  const auto snapshot = owner.try_stats();
  const auto refused = owner.try_send(Kind::heartbeat_ack, 1, {});
  blocked.unblock();
  writer.join();
  REQUIRE(entered);
  REQUIRE(snapshot->failed);
  REQUIRE_FALSE(snapshot->closed);
  REQUIRE(snapshot->queued.records == 0);
  REQUIRE(snapshot->in_flight_bytes == 44);
  REQUIRE(refused == DispatchAdmission::closed);
  REQUIRE(result == DispatchResult::failed);
  REQUIRE(owner.try_stats()->closed);
  REQUIRE(owner.try_stats()->in_flight_bytes == 0);
  REQUIRE_FALSE(owner.try_discard_audio());
}
