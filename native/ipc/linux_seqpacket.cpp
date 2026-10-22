#include "../compat/span.hpp"
#include "../compat/thread.hpp"
#include "linux_seqpacket.hpp"
#include "connection_config.hpp"
#include <algorithm>
#include <cerrno>
#include <climits>
#include <fcntl.h>
#include <poll.h>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>

namespace bridge::ipc {
namespace {
using Clock = std::chrono::steady_clock;
int duplicate(int fd) {
  sockaddr_storage address{}, peer{};
  socklen_t size = sizeof(address), peer_size = sizeof(peer);
  int type = 0, buffer = 0;
  socklen_t type_size = sizeof(type), buffer_size = sizeof(buffer);
  if (::getsockname(fd, reinterpret_cast<sockaddr *>(&address), &size) != 0 ||
      address.ss_family != AF_UNIX ||
      ::getpeername(fd, reinterpret_cast<sockaddr *>(&peer), &peer_size) != 0 ||
      peer.ss_family != AF_UNIX || ::getsockopt(fd, SOL_SOCKET, SO_TYPE, &type, &type_size) != 0 ||
      type != SOCK_SEQPACKET ||
      ::getsockopt(fd, SOL_SOCKET, SO_SNDBUF, &buffer, &buffer_size) != 0 ||
      buffer < static_cast<int>(seqpacket_datagram_bytes + 32))
    throw ProtocolError();
  const auto result = ::fcntl(fd, F_DUPFD_CLOEXEC, 0);
  if (result < 0)
    throw ProtocolError();
  return result;
}
} // namespace
struct LinuxSeqpacketEndpoint::Impl {
  const int fd;
  const std::thread::id owner = std::this_thread::get_id();
  std::array<std::uint8_t, seqpacket_datagram_bytes> scratch{};
  SeqpacketInspector inspector;
  std::uint64_t next_message = 1;
  bool failed = false, closed = false;
  std::optional<Clock::time_point> read_due;

  explicit Impl(int descriptor) : fd(duplicate(descriptor)) {}
  ~Impl() {
    wipe(scratch);
    if (::close(fd) != 0 && errno != EINTR)
      std::terminate();
  }
  [[noreturn]] void refuse() {
    failed = true;
    wipe(scratch);
    throw ProtocolError();
  }
  void check(std::chrono::milliseconds timeout) {
    if (std::this_thread::get_id() != owner)
      throw ProtocolError();
    if (failed || closed || timeout.count() < 20 || timeout.count() > 5000)
      refuse();
  }
  bool wait(short events, Clock::time_point due, ::bridge::compat::stop_token cancellation = {}) {
    for (;;) {
      if (cancellation.stop_requested())
        refuse();
      const auto remaining =
          std::chrono::duration_cast<std::chrono::milliseconds>(due - Clock::now());
      if (Clock::now() >= due)
        return false;
      pollfd event{fd, events, 0};
      const auto period =
          static_cast<int>(std::clamp<std::int64_t>(remaining.count() + 1, 1, INT_MAX));
      const auto result =
          ::poll(&event, 1, cancellation.stop_possible() ? std::min(period, 20) : period);
      if (result < 0 && errno == EINTR)
        continue;
      if (result < 0 || (event.revents & POLLNVAL))
        refuse();
      if (result == 0) {
        if (cancellation.stop_possible())
          continue;
        return false;
      }
      return true; // recv/send obtains the precise EOF/error outcome.
    }
  }
  void send(::bridge::compat::span<const std::uint8_t> header, ::bridge::compat::span<const std::uint8_t> body,
            std::chrono::milliseconds timeout, ::bridge::compat::stop_token cancellation) {
    check(timeout);
    try {
      if (header.size() != header_bytes || next_message > UINT32_MAX ||
          body.size() > max_seqpacket_record_bytes - header_bytes ||
          decode_header(header).length != body.size())
        refuse();
      const auto total = static_cast<std::uint32_t>(header_bytes + body.size());
      const auto due = Clock::now() + timeout;
      std::uint32_t offset = 0;
      while (offset < total) {
        const auto count = std::min<std::size_t>(seqpacket_chunk_bytes, total - offset);
        const auto prefix =
            encode_seqpacket_prefix(static_cast<std::uint32_t>(next_message), total, offset, count);
        // sendmsg borrows the caller's header/body and fixed prefix, no record copy.
        iovec parts[3]{{const_cast<std::uint8_t *>(prefix.data()), prefix.size()}, {}, {}};
        std::size_t part_count = 1;
        if (offset == 0) {
          parts[part_count++] = {const_cast<std::uint8_t *>(header.data()), header.size()};
          if (count > header.size())
            parts[part_count++] = {const_cast<std::uint8_t *>(body.data()), count - header.size()};
        } else
          parts[part_count++] = {const_cast<std::uint8_t *>(body.data() + offset - header_bytes),
                                 count};
        msghdr message{};
        message.msg_iov = parts;
        message.msg_iovlen = part_count;
        for (;;) {
          if (Clock::now() >= due || cancellation.stop_requested())
            refuse();
          const auto sent = ::sendmsg(fd, &message, MSG_DONTWAIT | MSG_NOSIGNAL);
          if (sent == static_cast<ssize_t>(prefix.size() + count))
            break;
          if (sent >= 0 || (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR))
            refuse();
          if (errno == EINTR)
            continue;
          if (!wait(POLLOUT, due, cancellation))
            refuse();
        }
        offset += static_cast<std::uint32_t>(count);
      }
      if (Clock::now() >= due)
        refuse();
      ++next_message;
    } catch (...) {
      failed = true;
      throw;
    }
  }
  SeqpacketRead read(std::chrono::milliseconds timeout) {
    if (std::this_thread::get_id() != owner)
      throw ProtocolError();
    if (closed && !failed)
      return {SeqpacketReadState::closed, {}};
    check(timeout);
    // Once a first chunk arrives, its original whole-record deadline never extends.
    const auto due = read_due.value_or(Clock::now() + timeout);
    wipe(scratch);
    for (;;) {
      if (Clock::now() >= due) {
        if (read_due)
          refuse();
        return {SeqpacketReadState::idle, {}};
      }
      iovec part{scratch.data(), scratch.size()};
      msghdr message{};
      message.msg_iov = &part;
      message.msg_iovlen = 1; // Never accept/import ancillary descriptors.
      const auto received = ::recvmsg(fd, &message, MSG_DONTWAIT);
      if (received < 0) {
        if (errno == EINTR)
          continue;
        if (errno != EAGAIN && errno != EWOULDBLOCK)
          refuse();
        if (!wait(POLLIN, due)) {
          if (read_due)
            refuse();
          return {SeqpacketReadState::idle, {}};
        }
        continue;
      }
      if (message.msg_flags & (MSG_TRUNC | MSG_CTRUNC))
        refuse();
      if (received == 0) {
        pollfd event{fd, POLLRDHUP, 0};
        if (::poll(&event, 1, 0) != 1 || !(event.revents & (POLLRDHUP | POLLHUP)) ||
            !inspector.at_record_boundary())
          refuse();
        closed = true;
        return {SeqpacketReadState::closed, {}};
      }
      // Idle waiting is not assembly time. A first datagram starts the whole-record
      // deadline when received, even if it arrives near the idle poll deadline.
      const auto arrived = Clock::now();
      const auto bytes =
          inspector.inspect(::bridge::compat::span(scratch).first(static_cast<std::size_t>(received)));
      if (!bytes || (read_due && Clock::now() >= *read_due))
        refuse();
      if (inspector.at_record_boundary())
        read_due.reset();
      else if (!read_due)
        read_due = arrived + timeout;
      return {SeqpacketReadState::data, *bytes};
    }
  }
};
LinuxSeqpacketEndpoint::LinuxSeqpacketEndpoint(int fd) : impl_(std::make_unique<Impl>(fd)) {}
LinuxSeqpacketEndpoint::~LinuxSeqpacketEndpoint() = default;
void LinuxSeqpacketEndpoint::send(::bridge::compat::span<const std::uint8_t> header,
                                  ::bridge::compat::span<const std::uint8_t> body,
                                  std::chrono::milliseconds timeout, ::bridge::compat::stop_token cancellation) {
  impl_->send(header, body, timeout, cancellation);
}
SeqpacketRead LinuxSeqpacketEndpoint::read(std::chrono::milliseconds timeout) {
  return impl_->read(timeout);
}
bool LinuxSeqpacketEndpoint::failed() const noexcept { return impl_->failed; }
} // namespace bridge::ipc
