#include "../compat/span.hpp"
#include "../compat/thread.hpp"
#include "linux_stream.hpp"
#include "opus_audio.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <cerrno>
#include <csignal>
#include <fcntl.h>
#include <filesystem>
#include <poll.h>
#include <pthread.h>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>

using namespace bridge::ipc;
using namespace std::chrono_literals;
namespace {
struct Pair {
  int ends[2]{-1, -1};
  explicit Pair(bool socket = false) {
    if (socket ? ::socketpair(AF_UNIX, SOCK_STREAM | SOCK_NONBLOCK | SOCK_CLOEXEC, 0, ends) != 0
               : ::pipe2(ends, O_NONBLOCK | O_CLOEXEC) != 0)
      throw ProtocolError();
  }
  void close_reader() {
    if (::close(ends[0]) != 0)
      throw ProtocolError();
    ends[0] = -1;
  }
  ~Pair() {
    for (const auto fd : ends)
      if (fd >= 0 && ::close(fd) != 0 && errno != EINTR)
        std::terminate();
  }
};
template <class Admit> DispatchAdmission admit_until_ready(Admit admit) {
  const auto due = std::chrono::steady_clock::now() + 1s;
  for (;;) {
    const auto result = admit();
    if (result != DispatchAdmission::busy || std::chrono::steady_clock::now() >= due)
      return result;
    std::this_thread::yield();
  }
}
DispatchAdmission send(LinuxStreamOutput &output, const Packet &packet) {
  return admit_until_ready(
      [&] { return output.try_send(packet.kind, packet.request_id, packet.payload); });
}
bool read_exact(int fd, ::bridge::compat::span<std::uint8_t> bytes, ::bridge::compat::stop_token stop = {}) {
  const auto due = std::chrono::steady_clock::now() + 5s;
  std::size_t at = 0;
  while (at < bytes.size() && !stop.stop_requested() && std::chrono::steady_clock::now() < due) {
    pollfd event{fd, POLLIN, 0};
    if (::poll(&event, 1, 50) < 0 && errno != EINTR)
      return false;
    const auto count = ::read(fd, bytes.data() + at, std::min<std::size_t>(bytes.size() - at, 337));
    if (count > 0)
      at += static_cast<std::size_t>(count);
    else if (count == 0 || (errno != EAGAIN && errno != EINTR))
      return false;
  }
  return at == bytes.size();
}
bool in_flight(LinuxStreamOutput &output) {
  const auto due = std::chrono::steady_clock::now() + 1s;
  while (std::chrono::steady_clock::now() < due) {
    if (const auto stats = output.try_stats(); stats && stats->in_flight_bytes)
      return true;
    std::this_thread::yield();
  }
  return false;
}
std::size_t fd_count() {
  return static_cast<std::size_t>(std::distance(
      std::filesystem::directory_iterator("/proc/self/fd"), std::filesystem::directory_iterator{}));
}
} // namespace

TEST_CASE("Linux FIFO and Node-style Unix stream drain exact accepted records and restore flags") {
  for (const bool socket : {false, true}) {
    Pair pair(socket);
    const auto old_flags = ::fcntl(pair.ends[1], F_GETFL) & ~O_NONBLOCK;
    REQUIRE(::fcntl(pair.ends[1], F_SETFL, old_flags) == 0);
    LinuxStreamOutput output(pair.ends[1]);
    REQUIRE((::fcntl(pair.ends[1], F_GETFL) & O_NONBLOCK) != 0);
    std::vector<std::uint8_t> expected(10 * (header_bytes + 4096));
    for (std::uint64_t id = 1; id <= 10; ++id) {
      const auto wire = encode({Kind::hello_ack, id, std::vector<std::uint8_t>(4096, id)});
      std::copy(wire.begin(), wire.end(), expected.begin() + (id - 1) * wire.size());
    }
    std::vector<std::uint8_t> received(expected.size());
    bool read_ok = false;
    ::bridge::compat::jthread reader(
        [&](::bridge::compat::stop_token stop) { read_ok = read_exact(pair.ends[0], received, stop); });
    bool admitted = true;
    for (std::uint64_t id = 1; id <= 10; ++id)
      admitted = (send(output, {Kind::hello_ack, id, std::vector<std::uint8_t>(4096, id)}) ==
                  DispatchAdmission::accepted) &&
                 admitted;
    const bool finished = output.finish();
    reader.join();
    REQUIRE(admitted);
    REQUIRE(finished);
    REQUIRE(read_ok);
    REQUIRE(received == expected);
    REQUIRE(output.try_stats()->sent_records == 10);
    REQUIRE(output.try_stats()->closed);
    REQUIRE_FALSE(output.timed_out());
    REQUIRE(::fcntl(pair.ends[1], F_GETFL) == old_flags);
    REQUIRE(output.finish());
    REQUIRE(send(output, {Kind::heartbeat_ack, 11, {}}) == DispatchAdmission::closed);
  }
}

TEST_CASE("Linux stalled FIFO preserves producer credit and fails partial records at whole-write "
          "deadline") {
  Pair pair;
  LinuxStreamOutput output(pair.ends[1], 500ms);
  REQUIRE(send(output, {Kind::frame, 1,
                        std::vector<std::uint8_t>(max_jpeg_bytes + frame_metadata_bytes)}) ==
          DispatchAdmission::accepted);
  REQUIRE(in_flight(output));
  const auto before = std::chrono::steady_clock::now();
  REQUIRE(send(output, {Kind::heartbeat_ack, 2, {}}) == DispatchAdmission::accepted);
  REQUIRE(std::chrono::steady_clock::now() - before < 200ms);
  REQUIRE_FALSE(output.finish(1500ms));
  REQUIRE(output.timed_out());
  const auto stats = output.try_stats();
  REQUIRE(stats->failed);
  REQUIRE(stats->closed);
  REQUIRE(stats->sent_records == 0);
  REQUIRE(stats->in_flight_bytes == 0);
  REQUIRE(stats->queued.records == 0);
}

TEST_CASE("Linux finish deadline wakes a writer before its longer record deadline") {
  Pair pair(true);
  LinuxStreamOutput output(pair.ends[1], 5000ms);
  REQUIRE(send(output, {Kind::frame, 1,
                        std::vector<std::uint8_t>(max_jpeg_bytes + frame_metadata_bytes)}) ==
          DispatchAdmission::accepted);
  REQUIRE(in_flight(output));
  const auto before = std::chrono::steady_clock::now();
  REQUIRE_FALSE(output.finish(30ms));
  REQUIRE(std::chrono::steady_clock::now() - before < 1s);
  REQUIRE(output.timed_out());
  REQUIRE(output.try_stats()->closed);
}

TEST_CASE("Linux broken FIFO and socket peers fail without changing caller SIGPIPE policy") {
  for (const bool socket : {false, true}) {
    Pair pair(socket);
    sigset_t before{}, after{};
    REQUIRE(::pthread_sigmask(SIG_SETMASK, nullptr, &before) == 0);
    LinuxStreamOutput output(pair.ends[1]);
    pair.close_reader();
    REQUIRE(send(output, {Kind::heartbeat_ack, 1, {}}) == DispatchAdmission::accepted);
    REQUIRE_FALSE(output.finish());
    REQUIRE(output.try_stats()->failed);
    REQUIRE_FALSE(output.timed_out());
    REQUIRE(::pthread_sigmask(SIG_SETMASK, nullptr, &after) == 0);
    REQUIRE(::sigismember(&before, SIGPIPE) == ::sigismember(&after, SIGPIPE));
  }
}

TEST_CASE("Linux stream owner refuses invalid handles timeouts and foreign finish without retiring "
          "live ownership") {
  Pair pair;
  REQUIRE_THROWS_AS(LinuxStreamOutput(-1), ProtocolError);
  REQUIRE_THROWS_AS(LinuxStreamOutput(pair.ends[0]), ProtocolError);
  REQUIRE_THROWS_AS(LinuxStreamOutput(pair.ends[1], 0ms), ProtocolError);
  REQUIRE_THROWS_AS(LinuxStreamOutput(pair.ends[1], 5001ms), ProtocolError);
  int datagram[2]{};
  REQUIRE(::socketpair(AF_UNIX, SOCK_DGRAM | SOCK_CLOEXEC, 0, datagram) == 0);
  REQUIRE_THROWS_AS(LinuxStreamOutput(datagram[1]), ProtocolError);
  REQUIRE(::close(datagram[0]) == 0);
  REQUIRE(::close(datagram[1]) == 0);
  const auto regular = ::open("/dev/null", O_WRONLY | O_CLOEXEC);
  REQUIRE(regular >= 0);
  REQUIRE_THROWS_AS(LinuxStreamOutput(regular), ProtocolError);
  REQUIRE(::close(regular) == 0);
  const auto network = ::socket(AF_INET, SOCK_STREAM | SOCK_CLOEXEC, 0);
  REQUIRE(network >= 0);
  REQUIRE_THROWS_AS(LinuxStreamOutput(network), ProtocolError);
  REQUIRE(::close(network) == 0);
  LinuxStreamOutput output(pair.ends[1]);
  REQUIRE_THROWS_AS(output.finish(0ms), ProtocolError);
  bool refused = false;
  ::bridge::compat::jthread foreign([&] {
    try {
      (void)output.finish();
    } catch (const ProtocolError &) {
      refused = true;
    }
  });
  foreign.join();
  REQUIRE(refused);
  REQUIRE(output.finish());
}

TEST_CASE(
    "Linux idle and Opus-selected owners join and reclaim descriptors across twenty lifetimes") {
  {
    Pair pair;
    LinuxStreamOutput output(pair.ends[1]);
    REQUIRE(output.finish());
  }
  const auto before = fd_count();
  for (unsigned i = 0; i < 20; ++i) {
    Pair pair(i % 2 != 0);
    LinuxStreamOutput output(pair.ends[1]);
    // The writer briefly shares the dispatcher lock during startup.
    REQUIRE(admit_until_ready([&] { return output.try_select_audio_codec(OutputAudioCodec::opus); }) ==
            DispatchAdmission::accepted);
    const auto config = audio::opus::encode_config({1, 312});
    REQUIRE(send(output, {Kind::audio_config, 0, {config.begin(), config.end()}}) ==
            DispatchAdmission::accepted);
    REQUIRE(output.finish());
    const auto expected = encode({Kind::audio_config, 0, {config.begin(), config.end()}});
    std::vector<std::uint8_t> received(expected.size());
    REQUIRE(read_exact(pair.ends[0], received));
    REQUIRE(received == expected);
  }
  REQUIRE(fd_count() == before);
}
