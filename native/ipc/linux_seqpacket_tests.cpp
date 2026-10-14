#include "linux_seqpacket.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>

using namespace bridge::ipc;
using namespace std::chrono_literals;
namespace {
struct Pair {
  int ends[2]{-1, -1};
  explicit Pair(int type = SOCK_SEQPACKET) {
    if (::socketpair(AF_UNIX, type | SOCK_CLOEXEC, 0, ends) != 0)
      throw ProtocolError();
  }
  void close_peer() {
    if (::close(ends[1]) != 0)
      throw ProtocolError();
    ends[1] = -1;
  }
  ~Pair() {
    for (const auto fd : ends)
      if (fd >= 0 && ::close(fd) != 0 && errno != EINTR)
        std::terminate();
  }
};
void raw(int fd, std::span<const std::uint8_t> data) {
  if (::send(fd, data.data(), data.size(), MSG_NOSIGNAL) != static_cast<ssize_t>(data.size()))
    throw ProtocolError();
}
std::vector<std::uint8_t> first(std::span<const std::uint8_t> record, std::size_t count) {
  const auto prefix =
      encode_seqpacket_prefix(1, static_cast<std::uint32_t>(record.size()), 0, count);
  std::vector<std::uint8_t> bytes(prefix.size() + count);
  std::copy(prefix.begin(), prefix.end(), bytes.begin());
  std::copy_n(record.begin(), count, bytes.begin() + prefix.size());
  return bytes;
}
std::size_t fd_count() {
  return static_cast<std::size_t>(std::distance(
      std::filesystem::directory_iterator("/proc/self/fd"), std::filesystem::directory_iterator{}));
}
} // namespace
TEST_CASE("Linux seqpacket sends maximum frame as borrowed chunks and preserves descriptor flags") {
  Pair pair;
  const int flags = ::fcntl(pair.ends[0], F_GETFL);
  LinuxSeqpacketEndpoint receiver(pair.ends[0]);
  const auto record = encode(
      {Kind::frame, 2, std::vector<std::uint8_t>(max_jpeg_bytes + frame_metadata_bytes, 0xa5)});
  bool sent = false;
  std::jthread writer([&] {
    try {
      LinuxSeqpacketEndpoint sender(pair.ends[1]);
      sender.send(std::span(record).first(header_bytes), std::span(record).subspan(header_bytes),
                  5s);
      const auto next = encode({Kind::heartbeat_ack, 3, {}});
      sender.send(next, {});
      sent = true;
    } catch (...) {
    }
  });
  std::size_t offset = 0, chunks = 0;
  bool correct = true;
  while (offset < record.size()) {
    const auto result = receiver.read(5s);
    if (result.state != SeqpacketReadState::data || result.bytes.size() > record.size() - offset) {
      correct = false;
      break;
    }
    correct =
        std::equal(result.bytes.begin(), result.bytes.end(), record.begin() + offset) && correct;
    offset += result.bytes.size();
    ++chunks;
  }
  const auto next = receiver.read();
  const auto expected = encode({Kind::heartbeat_ack, 3, {}});
  REQUIRE(next.state == SeqpacketReadState::data);
  REQUIRE(std::equal(next.bytes.begin(), next.bytes.end(), expected.begin(), expected.end()));
  writer.join();
  REQUIRE(sent);
  REQUIRE(correct);
  REQUIRE(chunks == 513);
  REQUIRE(::fcntl(pair.ends[0], F_GETFL) == flags);
  REQUIRE_FALSE(receiver.failed());
}
TEST_CASE("Linux seqpacket distinguishes idle and clean EOF from partial EOF and empty datagram") {
  {
    Pair pair;
    LinuxSeqpacketEndpoint receiver(pair.ends[0]);
    REQUIRE(receiver.read(20ms).state == SeqpacketReadState::idle);
    REQUIRE_FALSE(receiver.failed());
    pair.close_peer();
    REQUIRE(receiver.read().state == SeqpacketReadState::closed);
    REQUIRE(receiver.read().state == SeqpacketReadState::closed);
  }
  const auto record = encode({Kind::hello, 1, std::vector<std::uint8_t>(8)});
  {
    Pair pair;
    LinuxSeqpacketEndpoint receiver(pair.ends[0]);
    raw(pair.ends[1], first(record, header_bytes));
    REQUIRE(receiver.read().state == SeqpacketReadState::data);
    pair.close_peer();
    REQUIRE_THROWS_AS(receiver.read(), ProtocolError);
    REQUIRE(receiver.failed());
  }
  {
    Pair pair;
    LinuxSeqpacketEndpoint receiver(pair.ends[0]);
    raw(pair.ends[1], {});
    REQUIRE_THROWS_AS(receiver.read(), ProtocolError);
    REQUIRE(receiver.failed());
  }
}
TEST_CASE("Linux seqpacket enforces original partial record and whole write deadlines") {
  {
    Pair pair;
    LinuxSeqpacketEndpoint receiver(pair.ends[0]);
    const auto record = encode({Kind::hello, 1, std::vector<std::uint8_t>(8)});
    raw(pair.ends[1], first(record, header_bytes));
    REQUIRE(receiver.read(20ms).state == SeqpacketReadState::data);
    std::this_thread::sleep_for(30ms);
    REQUIRE_THROWS_AS(receiver.read(5s), ProtocolError);
    REQUIRE(receiver.failed());
  }
  {
    Pair pair;
    LinuxSeqpacketEndpoint sender(pair.ends[0]);
    const auto record = encode({Kind::frame, 1, std::vector<std::uint8_t>(max_jpeg_bytes)});
    const auto started = std::chrono::steady_clock::now();
    REQUIRE_THROWS_AS(sender.send(std::span(record).first(header_bytes),
                                  std::span(record).subspan(header_bytes), 30ms),
                      ProtocolError);
    REQUIRE(std::chrono::steady_clock::now() - started < 1s);
    REQUIRE(sender.failed());
    REQUIRE_THROWS_AS(sender.send(std::span(record).first(header_bytes), {}, 1s), ProtocolError);
  }
}
TEST_CASE("Linux seqpacket cancels blocked writes without extending their whole record deadline") {
  Pair pair;
  LinuxSeqpacketEndpoint sender(pair.ends[0]);
  const auto record = encode({Kind::frame, 1, std::vector<std::uint8_t>(max_jpeg_bytes)});
  std::stop_source stop;
  std::jthread cancellation([&] {
    std::this_thread::sleep_for(30ms);
    stop.request_stop();
  });
  const auto started = std::chrono::steady_clock::now();
  REQUIRE_THROWS_AS(sender.send(std::span(record).first(header_bytes),
                                std::span(record).subspan(header_bytes), 5s, stop.get_token()),
                    ProtocolError);
  REQUIRE(std::chrono::steady_clock::now() - started < 1s);
  REQUIRE(sender.failed());
}

TEST_CASE("Linux seqpacket refuses truncated oversized ancillary and malformed datagrams") {
  const auto record = encode({Kind::heartbeat_ack, 1, {}});
  for (unsigned fault = 0; fault < 3; ++fault) {
    Pair pair;
    LinuxSeqpacketEndpoint receiver(pair.ends[0]);
    auto bytes = first(record, record.size());
    if (fault == 0)
      bytes.resize(seqpacket_datagram_bytes + 1, 0);
    if (fault == 1)
      bytes[0] = 0;
    if (fault == 2)
      bytes.resize(seqpacket_prefix_bytes + header_bytes - 1);
    raw(pair.ends[1], bytes);
    REQUIRE_THROWS_AS(receiver.read(), ProtocolError);
    REQUIRE(receiver.failed());
  }
  Pair pair;
  LinuxSeqpacketEndpoint receiver(pair.ends[0]);
  auto bytes = first(record, record.size());
  const auto before = fd_count();
  alignas(cmsghdr) std::array<std::uint8_t, CMSG_SPACE(sizeof(int))> control{};
  iovec part{bytes.data(), bytes.size()};
  msghdr message{};
  message.msg_iov = &part;
  message.msg_iovlen = 1;
  message.msg_control = control.data();
  message.msg_controllen = control.size();
  auto *cmsg = CMSG_FIRSTHDR(&message);
  REQUIRE(cmsg != nullptr);
  cmsg->cmsg_level = SOL_SOCKET;
  cmsg->cmsg_type = SCM_RIGHTS;
  cmsg->cmsg_len = CMSG_LEN(sizeof(int));
  std::memcpy(CMSG_DATA(cmsg), &pair.ends[1], sizeof(int));
  REQUIRE(::sendmsg(pair.ends[1], &message, MSG_NOSIGNAL) == static_cast<ssize_t>(bytes.size()));
  REQUIRE_THROWS_AS(receiver.read(), ProtocolError);
  REQUIRE(receiver.failed());
  REQUIRE(fd_count() == before); // Discarded ancillary FD is not imported/leaked.
}
TEST_CASE(
    "Linux seqpacket checks socket identity owner and failure without changing SIGPIPE policy") {
  REQUIRE_THROWS_AS(LinuxSeqpacketEndpoint(-1), ProtocolError);
  for (int type : {SOCK_STREAM, SOCK_DGRAM}) {
    Pair pair(type);
    REQUIRE_THROWS_AS(LinuxSeqpacketEndpoint(pair.ends[0]), ProtocolError);
  }
  Pair pair;
  LinuxSeqpacketEndpoint sender(pair.ends[0]);
  bool refused = false;
  std::jthread foreign([&] {
    try {
      (void)sender.read(20ms);
    } catch (const ProtocolError &) {
      refused = true;
    }
  });
  foreign.join();
  REQUIRE(refused);
  REQUIRE_FALSE(sender.failed());
  pair.close_peer();
  const auto header = encode({Kind::heartbeat_ack, 1, {}});
  REQUIRE_THROWS_AS(sender.send(header, {}), ProtocolError);
  REQUIRE(sender.failed()); // MSG_NOSIGNAL survives a broken peer without global signal changes.
}
TEST_CASE("Linux seqpacket twenty endpoint lifetimes retain no descriptors and reject undersized "
          "buffers") {
  const auto before = fd_count();
  for (unsigned i = 0; i < 20; ++i) {
    Pair pair;
    const auto original = ::fcntl(pair.ends[0], F_GETFL);
    {
      LinuxSeqpacketEndpoint endpoint(pair.ends[0]);
      REQUIRE_FALSE(endpoint.failed());
    }
    REQUIRE(::fcntl(pair.ends[0], F_GETFL) == original);
  }
  REQUIRE(fd_count() == before);
  Pair pair;
  const int size = 4096;
  REQUIRE(::setsockopt(pair.ends[0], SOL_SOCKET, SO_SNDBUF, &size, sizeof(size)) == 0);
  REQUIRE_THROWS_AS(LinuxSeqpacketEndpoint(pair.ends[0]), ProtocolError);
}
