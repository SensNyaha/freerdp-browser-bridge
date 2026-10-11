#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include "opus_audio.hpp"
#include "windows_pipe.hpp"
#include <catch2/catch_test_macros.hpp>
#include <thread>
#include <windows.h>
using namespace bridge::ipc;
using namespace std::chrono_literals;
namespace {
struct Pipe {
  HANDLE read = nullptr, write = nullptr;
  Pipe() {
    if (!CreatePipe(&read, &write, nullptr, 4096))
      throw ProtocolError();
  }
  void close_reader() {
    if (!CloseHandle(read))
      throw ProtocolError();
    read = nullptr;
  }
  ~Pipe() {
    if ((read && !CloseHandle(read)) || (write && !CloseHandle(write)))
      std::terminate();
  }
};
DispatchAdmission send(WindowsPipeOutput &output, const Packet &packet) {
  const auto deadline = std::chrono::steady_clock::now() + 1s;
  for (;;) {
    const auto result = output.try_send(packet.kind, packet.request_id, packet.payload);
    if (result != DispatchAdmission::busy || std::chrono::steady_clock::now() >= deadline)
      return result;
    std::this_thread::yield();
  }
}
std::optional<DispatcherStats> in_flight(WindowsPipeOutput &output) {
  const auto deadline = std::chrono::steady_clock::now() + 1s;
  while (std::chrono::steady_clock::now() < deadline) {
    if (const auto stats = output.try_stats(); stats && stats->in_flight_bytes)
      return stats;
    std::this_thread::yield();
  }
  return std::nullopt;
}
} // namespace
TEST_CASE(
    "Windows synchronous pipe writes exact bounded records and drains all accepted responses") {
  Pipe pipe;
  WindowsPipeOutput output(pipe.write);
  std::vector<std::uint8_t> expected;
  for (std::uint64_t i = 1; i <= 10; ++i) {
    const auto bytes =
        encode({Kind::hello_ack, i, std::vector<std::uint8_t>(4096, static_cast<std::uint8_t>(i))});
    expected.insert(expected.end(), bytes.begin(), bytes.end());
  }
  std::vector<std::uint8_t> received(expected.size());
  bool read_ok = true;
  std::atomic<bool> read_done{false}, read_stop{false};
  std::jthread reader([&] {
    std::size_t at = 0;
    while (!read_stop.load() && at < received.size()) {
      DWORD count = 0;
      if (!ReadFile(pipe.read, received.data() + at, static_cast<DWORD>(received.size() - at),
                    &count, nullptr) ||
          !count) {
        read_ok = false;
        break;
      }
      at += count;
    }
    read_done = true;
  });
  bool admitted = true;
  for (std::uint64_t i = 1; i <= 10; ++i)
    admitted = (send(output, {Kind::hello_ack, i,
                              std::vector<std::uint8_t>(4096, static_cast<std::uint8_t>(i))}) ==
                DispatchAdmission::accepted) &&
               admitted;
  const bool finished = output.finish();
  if (!finished) {
    read_stop = true;
    const auto limit = std::chrono::steady_clock::now() + 250ms;
    while (!read_done.load() && std::chrono::steady_clock::now() < limit) {
      if (!CancelSynchronousIo(reader.native_handle()) && GetLastError() != ERROR_NOT_FOUND)
        std::terminate();
      std::this_thread::sleep_for(1ms);
    }
    if (!read_done.load())
      std::terminate();
  }
  reader.join();
  REQUIRE(admitted);
  REQUIRE(finished);
  REQUIRE(read_ok);
  REQUIRE(received == expected);
  REQUIRE(output.try_stats()->sent_records == 10);
  REQUIRE(output.try_stats()->closed);
  REQUIRE_FALSE(output.timed_out());
  REQUIRE(output.finish());
  REQUIRE(send(output, {Kind::heartbeat_ack, 11, {}}) == DispatchAdmission::closed);
}
TEST_CASE("Windows pipe startup selects Opus once and writes its exact configuration") {
  Pipe pipe;
  WindowsPipeOutput output(pipe.write);
  REQUIRE(send(output, {Kind::heartbeat_ack, 17, {}}) == DispatchAdmission::accepted);
  const auto deadline = std::chrono::steady_clock::now() + 1s;
  DispatchAdmission selected = DispatchAdmission::busy;
  while (selected == DispatchAdmission::busy && std::chrono::steady_clock::now() < deadline) {
    selected = output.try_select_audio_codec(OutputAudioCodec::opus);
    std::this_thread::yield();
  }
  REQUIRE(selected == DispatchAdmission::accepted);
  const auto config = audio::opus::encode_config({1, 312});
  REQUIRE(send(output, {Kind::audio_config, 0, {config.begin(), config.end()}}) ==
          DispatchAdmission::accepted);
  REQUIRE(output.finish());
  REQUIRE(output.try_select_audio_codec(OutputAudioCodec::pcm) == DispatchAdmission::closed);
  auto expected = encode({Kind::heartbeat_ack, 17, {}});
  const auto audio = encode({Kind::audio_config, 0, {config.begin(), config.end()}});
  expected.insert(expected.end(), audio.begin(), audio.end());
  std::vector<std::uint8_t> received(expected.size());
  DWORD count = 0;
  REQUIRE(
      ReadFile(pipe.read, received.data(), static_cast<DWORD>(received.size()), &count, nullptr));
  REQUIRE(count == received.size());
  REQUIRE(received == expected);
  REQUIRE(output.try_stats()->sent_records == 2);
}
TEST_CASE("Windows pipe stalled reader triggers write watchdog while producers retain credit") {
  Pipe pipe;
  WindowsPipeOutput output(pipe.write, 500ms);
  REQUIRE(send(output, {Kind::frame, 1,
                        std::vector<std::uint8_t>(max_jpeg_bytes + frame_metadata_bytes)}) ==
          DispatchAdmission::accepted);
  const auto snapshot = in_flight(output);
  REQUIRE(snapshot);
  const auto start = std::chrono::steady_clock::now();
  REQUIRE(send(output, {Kind::heartbeat_ack, 2, {}}) == DispatchAdmission::accepted);
  REQUIRE(std::chrono::steady_clock::now() - start < 200ms);
  REQUIRE_FALSE(output.finish(1500ms));
  REQUIRE(output.timed_out());
  const auto stats = output.try_stats();
  REQUIRE(stats->failed);
  REQUIRE(stats->closed);
  REQUIRE(stats->in_flight_bytes == 0);
  REQUIRE(stats->queued.records == 0);
  REQUIRE(stats->sent_records == 0); // Partial bytes are never reported as a record.
  REQUIRE(send(output, {Kind::heartbeat_ack, 3, {}}) == DispatchAdmission::closed);
}
TEST_CASE(
    "Windows pipe graceful deadline cancels an in-flight record before its longer write timeout") {
  Pipe pipe;
  WindowsPipeOutput output(pipe.write, 5000ms);
  REQUIRE(send(output, {Kind::frame, 1,
                        std::vector<std::uint8_t>(max_jpeg_bytes + frame_metadata_bytes)}) ==
          DispatchAdmission::accepted);
  REQUIRE(in_flight(output));
  const auto start = std::chrono::steady_clock::now();
  REQUIRE_FALSE(output.finish(30ms));
  REQUIRE(std::chrono::steady_clock::now() - start < 1s);
  REQUIRE(output.timed_out());
  REQUIRE(output.try_stats()->closed);
}
TEST_CASE(
    "Windows pipe broken reader is fixed failure and handle/deadline/owner misuse is refused") {
  Pipe pipe;
  REQUIRE_THROWS_AS(WindowsPipeOutput(nullptr), ProtocolError);
  REQUIRE_THROWS_AS(WindowsPipeOutput(GetCurrentProcess()), ProtocolError);
  REQUIRE_THROWS_AS(WindowsPipeOutput(pipe.write, 0ms), ProtocolError);
  REQUIRE_THROWS_AS(WindowsPipeOutput(pipe.write, 5001ms), ProtocolError);
  WindowsPipeOutput output(pipe.write);
  REQUIRE_THROWS_AS(output.finish(0ms), ProtocolError);
  bool refused = false;
  std::jthread foreign([&] {
    try {
      (void)output.finish();
    } catch (const ProtocolError &) {
      refused = true;
    }
  });
  foreign.join();
  REQUIRE(refused);
  pipe.close_reader();
  REQUIRE(send(output, {Kind::heartbeat_ack, 1, {}}) == DispatchAdmission::accepted);
  REQUIRE_FALSE(output.finish());
  REQUIRE(output.try_stats()->failed);
  REQUIRE_FALSE(output.timed_out());
}
TEST_CASE("Windows pipe sequential idle drivers join both threads and release private handles") {
  {
    Pipe pipe;
    WindowsPipeOutput warmup(pipe.write);
    REQUIRE(warmup.finish());
  }
  DWORD before = 0, after = 0;
  REQUIRE(GetProcessHandleCount(GetCurrentProcess(), &before));
  for (unsigned i = 0; i < 20; ++i) {
    Pipe pipe;
    WindowsPipeOutput output(pipe.write);
    REQUIRE(output.finish());
  }
  REQUIRE(GetProcessHandleCount(GetCurrentProcess(), &after));
  REQUIRE(after == before);
}
