#pragma once
#include "../compat/span.hpp"
#include "../compat/thread.hpp"
#include "seqpacket.hpp"
#include <chrono>
#include <memory>

namespace bridge::ipc {
enum class SeqpacketReadState { data, idle, closed };
struct SeqpacketRead {
  SeqpacketReadState state;
  ::bridge::compat::span<const std::uint8_t> bytes;
};
// Duplicates a connected AF_UNIX SOCK_SEQPACKET descriptor. One owner thread
// per endpoint instance; separate read/write instances may share the socket.
// read() borrows fixed scratch until the next read. No descriptor flags change.
class LinuxSeqpacketEndpoint {
public:
  explicit LinuxSeqpacketEndpoint(int fd);
  ~LinuxSeqpacketEndpoint();
  LinuxSeqpacketEndpoint(const LinuxSeqpacketEndpoint &) = delete;
  LinuxSeqpacketEndpoint &operator=(const LinuxSeqpacketEndpoint &) = delete;
  void send(::bridge::compat::span<const std::uint8_t> header, ::bridge::compat::span<const std::uint8_t> body,
            std::chrono::milliseconds timeout = std::chrono::milliseconds(1000),
            ::bridge::compat::stop_token cancellation = {});
  SeqpacketRead read(std::chrono::milliseconds timeout = std::chrono::milliseconds(1000));
  bool failed() const noexcept;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
} // namespace bridge::ipc
