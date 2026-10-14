#include "linux_seqpacket.hpp"
#include "linux_stream.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <cerrno>
#include <csignal>
#include <fcntl.h>
#include <filesystem>
#include <fstream>
#include <sys/socket.h>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>

using namespace bridge::ipc;
using namespace std::chrono_literals;
namespace {
struct Child {
  int socket = -1;
  pid_t pid = -1;
  std::filesystem::path runtime, root;
  Child() {
    std::array<char, 40> path{};
    const std::string pattern = "/tmp/bridge-seqpacket-XXXXXX";
    std::copy(pattern.begin(), pattern.end(), path.begin());
    if (!::mkdtemp(path.data()))
      throw ProtocolError();
    root = path.data();
    runtime = root / "session";
    std::filesystem::create_directory(runtime);
    std::ofstream(runtime / ".rdp-worker-owned", std::ios::binary) << "runtime-v1";
    int ends[2];
    if (::socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, ends) != 0)
      throw ProtocolError();
    pid = ::fork();
    if (pid == 0) {
      if (::dup2(ends[1], 3) < 0 || ::fcntl(3, F_SETFD, 0) != 0 || ::chdir(runtime.c_str()) != 0)
        ::_exit(127);
      for (int fd : ends)
        if (fd != 3 && ::close(fd) != 0)
          ::_exit(127);
      const int null = ::open("/dev/null", O_RDWR | O_CLOEXEC);
      if (null < 0)
        ::_exit(127);
      for (int fd = 0; fd < 3; ++fd)
        if (::dup2(null, fd) < 0)
          ::_exit(127);
      if (null > 3)
        (void)::close(null);
      ::execl(BRIDGE_WORKER_BINARY, BRIDGE_WORKER_BINARY, "--ipc-seqpacket-fd=3", nullptr);
      ::_exit(127);
    }
    if (pid < 0) {
      (void)::close(ends[0]);
      (void)::close(ends[1]);
      throw ProtocolError();
    }
    socket = ends[0];
    if (::close(ends[1]) != 0)
      throw ProtocolError();
  }
  int join() {
    const auto due = std::chrono::steady_clock::now() + 5s;
    int status = 0;
    while (std::chrono::steady_clock::now() < due) {
      const auto result = ::waitpid(pid, &status, WNOHANG);
      if (result == pid) {
        pid = -1;
        return WIFEXITED(status) ? WEXITSTATUS(status) : -1;
      }
      if (result < 0 && errno != EINTR)
        throw ProtocolError();
      std::this_thread::sleep_for(2ms);
    }
    throw ProtocolError();
  }
  ~Child() {
    if (pid > 0) {
      (void)::kill(pid, SIGKILL);
      int status;
      while (::waitpid(pid, &status, 0) < 0 && errno == EINTR) {
      }
    }
    if (socket >= 0)
      (void)::close(socket);
    // Only this test's known marker and empty directories; no recursive delete.
    std::error_code ec;
    std::filesystem::remove(runtime / ".rdp-worker-owned", ec);
    std::filesystem::remove(runtime, ec);
    std::filesystem::remove(root, ec);
  }
};
void send(LinuxSeqpacketEndpoint &endpoint, const Packet &packet) {
  const auto bytes = encode(packet);
  endpoint.send(std::span(bytes).first(header_bytes), std::span(bytes).subspan(header_bytes));
}
Packet receive(LinuxSeqpacketEndpoint &endpoint) {
  const auto bytes = endpoint.read();
  if (bytes.state != SeqpacketReadState::data || bytes.bytes.size() < header_bytes)
    throw ProtocolError();
  const auto header = decode_header(bytes.bytes.first(header_bytes));
  if (bytes.bytes.size() != header_bytes + header.length)
    throw ProtocolError(); // All lifecycle replies fit in one physical datagram.
  return {header.kind, header.request_id, {bytes.bytes.begin() + header_bytes, bytes.bytes.end()}};
}
void hello(LinuxSeqpacketEndpoint &endpoint) {
  send(endpoint, {Kind::hello, 1, {0, 1, 0, 1, 0, 0, 0, 0}});
  const auto reply = receive(endpoint);
  REQUIRE(reply.kind == Kind::hello_ack);
  REQUIRE(reply.request_id == 1);
  const std::string payload(reply.payload.begin(), reply.payload.end());
  REQUIRE(payload.find("unix-seqpacket-rws1") != std::string::npos);
}
} // namespace

TEST_CASE("Actual Linux worker packet descriptor lifecycle repeats 100 times with owned cleanup") {
  for (unsigned i = 0; i < 100; ++i) {
    Child child;
    LinuxSeqpacketEndpoint endpoint(child.socket);
    hello(endpoint);
    send(endpoint, {Kind::heartbeat, 2, {}});
    const auto beat = receive(endpoint);
    REQUIRE(beat.kind == Kind::heartbeat_ack);
    REQUIRE(beat.request_id == 2);
    send(endpoint, {Kind::shutdown, 3, {}});
    const auto stop = receive(endpoint);
    REQUIRE(stop.kind == Kind::shutdown_ack);
    REQUIRE(stop.request_id == 3);
    REQUIRE(child.join() == 0);
    REQUIRE_FALSE(std::filesystem::exists(child.runtime));
  }
}
TEST_CASE("Actual Linux packet worker rejects partial EOF and malformed carrier without leaking "
          "runtime") {
  for (bool partial : {false, true}) {
    Child child;
    const auto wire = encode({Kind::hello, 1, std::vector<std::uint8_t>(8)});
    const auto prefix =
        encode_seqpacket_prefix(1, static_cast<std::uint32_t>(wire.size()), 0, header_bytes);
    std::array<std::uint8_t, seqpacket_prefix_bytes + header_bytes> bytes{};
    std::copy(prefix.begin(), prefix.end(), bytes.begin());
    std::copy_n(wire.begin(), header_bytes, bytes.begin() + prefix.size());
    if (!partial)
      bytes[0] = 0;
    REQUIRE(::send(child.socket, bytes.data(), bytes.size(), MSG_NOSIGNAL) ==
            static_cast<ssize_t>(bytes.size()));
    REQUIRE(::shutdown(child.socket, SHUT_WR) == 0);
    REQUIRE(child.join() == 2);
    REQUIRE_FALSE(std::filesystem::exists(child.runtime));
  }
}
TEST_CASE("Actual Linux packet worker observes cancellation while idle without incoming data") {
  Child child;
  LinuxSeqpacketEndpoint endpoint(child.socket);
  hello(endpoint);
  REQUIRE(::kill(child.pid, SIGTERM) == 0);
  REQUIRE(child.join() == 2);
  REQUIRE_FALSE(std::filesystem::exists(child.runtime));
}
TEST_CASE(
    "Actual Linux packet worker bounds paused-output parent flood and exits before forced kill") {
  Child child;
  LinuxSeqpacketEndpoint endpoint(child.socket);
  hello(endpoint);
  const auto started = std::chrono::steady_clock::now();
  unsigned submitted = 0;
  try {
    for (unsigned i = 0; i < 12000; ++i) {
      send(endpoint, {Kind::heartbeat, i + 2, {}});
      ++submitted;
    }
  } catch (const ProtocolError &) {
    // A full/broken socket is an expected terminal parent-side refusal.
  }
  REQUIRE(submitted > 0);
  REQUIRE(child.join() == 2);
  REQUIRE(std::chrono::steady_clock::now() - started < 5s);
  REQUIRE_FALSE(std::filesystem::exists(child.runtime));
}
TEST_CASE("Linux priority packet writer bounds stalled output and cancels before owner teardown") {
  int ends[2];
  REQUIRE(::socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, ends) == 0);
  {
    LinuxStreamOutput output(ends[0], 5s, LinuxOutputTransport::seqpacket);
    std::vector<std::uint8_t> frame(max_jpeg_bytes + frame_metadata_bytes);
    REQUIRE(output.try_send(Kind::frame, 1, frame) == DispatchAdmission::accepted);
    const auto due = std::chrono::steady_clock::now() + 1s;
    bool writing = false;
    while (std::chrono::steady_clock::now() < due) {
      const auto stats = output.try_stats();
      if (stats && stats->in_flight_bytes) {
        writing = true;
        break;
      }
      std::this_thread::yield();
    }
    REQUIRE(writing);
    const auto started = std::chrono::steady_clock::now();
    REQUIRE_FALSE(output.finish(20ms));
    REQUIRE(std::chrono::steady_clock::now() - started < 1s);
    REQUIRE(output.timed_out());
  }
  REQUIRE(::close(ends[0]) == 0);
  REQUIRE(::close(ends[1]) == 0);
}
