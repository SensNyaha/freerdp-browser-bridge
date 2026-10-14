#include "linux_stream.hpp"
#include "linux_seqpacket.hpp"
#include <algorithm>
#include <cerrno>
#include <climits>
#include <condition_variable>
#include <csignal>
#include <fcntl.h>
#include <poll.h>
#include <pthread.h>
#include <sys/eventfd.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <thread>
#include <unistd.h>

namespace bridge::ipc {
namespace {
using Clock = std::chrono::steady_clock;
class Descriptor {
  int value_;

public:
  explicit Descriptor(int value) : value_(value) {
    if (value < 0)
      throw ProtocolError();
  }
  ~Descriptor() {
    // Linux closes the descriptor even on EINTR; never retry a reused number.
    if (::close(value_) != 0 && errno != EINTR)
      std::terminate();
  }
  int get() const noexcept { return value_; }
};
bool valid_timeout(std::chrono::milliseconds period, std::int64_t maximum) noexcept {
  return period.count() >= 20 && period.count() <= maximum;
}
int checked_duplicate(int fd, std::chrono::milliseconds period, LinuxOutputTransport transport) {
  struct stat info{};
  const int flags = ::fcntl(fd, F_GETFL);
  if (!valid_timeout(period, 5000) || flags < 0 || (flags & O_ACCMODE) == O_RDONLY ||
      ::fstat(fd, &info) != 0 || (!S_ISFIFO(info.st_mode) && !S_ISSOCK(info.st_mode)) ||
      (transport != LinuxOutputTransport::framed_stream &&
       transport != LinuxOutputTransport::seqpacket) ||
      (transport == LinuxOutputTransport::seqpacket && !S_ISSOCK(info.st_mode)))
    throw ProtocolError();
  if (S_ISSOCK(info.st_mode)) {
    sockaddr_storage address{};
    socklen_t size = sizeof(address);
    int type = 0;
    socklen_t type_size = sizeof(type);
    if (::getsockname(fd, reinterpret_cast<sockaddr *>(&address), &size) != 0 ||
        address.ss_family != AF_UNIX ||
        ::getsockopt(fd, SOL_SOCKET, SO_TYPE, &type, &type_size) != 0 ||
        type != (transport == LinuxOutputTransport::seqpacket ? SOCK_SEQPACKET : SOCK_STREAM))
      throw ProtocolError();
  }
  return ::fcntl(fd, F_DUPFD_CLOEXEC, 0);
}
} // namespace
struct LinuxStreamOutput::Impl {
  Descriptor stream, wake{::eventfd(0, EFD_NONBLOCK | EFD_CLOEXEC)};
  const int old_flags;
  const std::chrono::milliseconds write_timeout;
  const LinuxOutputTransport transport;
  std::stop_source cancellation;
  OutputDispatcher dispatcher;
  std::atomic<bool> aborting{false}, timeout{false};
  std::thread writer;
  const std::thread::id owner = std::this_thread::get_id();
  std::mutex done_mutex;
  std::condition_variable done_changed;
  bool done = false, joined = false;

  Impl(int fd, std::chrono::milliseconds period, LinuxOutputTransport mode)
      : stream(checked_duplicate(fd, period, mode)), old_flags(::fcntl(stream.get(), F_GETFL)),
        write_timeout(period), transport(mode) {
    if (old_flags < 0 || (transport == LinuxOutputTransport::framed_stream &&
                          ::fcntl(stream.get(), F_SETFL, old_flags | O_NONBLOCK) != 0))
      throw ProtocolError();
    try {
      writer = std::thread([this] { run(); });
    } catch (...) {
      if (transport == LinuxOutputTransport::framed_stream &&
          ::fcntl(stream.get(), F_SETFL, old_flags) != 0)
        std::terminate();
      throw ProtocolError();
    }
  }
  void signal() {
    const std::uint64_t value = 1;
    for (unsigned attempt = 0; attempt < 4; ++attempt) {
      const auto count = ::write(wake.get(), &value, sizeof(value));
      if (count == static_cast<ssize_t>(sizeof(value)) || (count < 0 && errno == EAGAIN))
        return;
      if (count >= 0 || errno != EINTR)
        break;
    }
    throw ProtocolError();
  }
  void consume_wake() {
    std::uint64_t value = 0;
    // One eventfd read consumes its complete accumulated count. A racing producer
    // leaves a new readable count; no unbounded drain loop is needed.
    const auto count = ::read(wake.get(), &value, sizeof(value));
    if (count != static_cast<ssize_t>(sizeof(value)) &&
        !(count < 0 && (errno == EAGAIN || errno == EINTR)))
      throw ProtocolError();
  }
  bool write_bytes(std::span<const std::uint8_t> bytes, Clock::time_point due) {
    std::size_t used = 0;
    while (used < bytes.size()) {
      if (aborting.load())
        return false;
      const auto now = Clock::now();
      if (now >= due) {
        timeout = true;
        return false;
      }
      const auto count = ::write(stream.get(), bytes.data() + used,
                                 std::min<std::size_t>(bytes.size() - used, 65536));
      if (count > 0) {
        used += static_cast<std::size_t>(count);
        continue;
      }
      if (count == 0 || (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR))
        return false;
      if (errno == EINTR)
        continue;
      pollfd events[2]{{stream.get(), POLLOUT, 0}, {wake.get(), POLLIN, 0}};
      const auto remaining =
          std::chrono::duration_cast<std::chrono::milliseconds>(due - Clock::now());
      const int wait =
          static_cast<int>(std::clamp<std::int64_t>(remaining.count() + 1, 1, INT_MAX));
      const auto result = ::poll(events, 2, wait);
      if (result < 0) {
        if (errno == EINTR)
          continue;
        return false;
      }
      if (events[1].revents & POLLIN)
        consume_wake();
      if ((events[0].revents | events[1].revents) & (POLLERR | POLLHUP | POLLNVAL))
        return false;
    }
    if (Clock::now() >= due) {
      timeout = true;
      return false;
    }
    return !aborting.load();
  }
  void run() noexcept {
    try {
      sigset_t blocked{};
      if (::sigemptyset(&blocked) != 0 || ::sigaddset(&blocked, SIGPIPE) != 0 ||
          ::pthread_sigmask(SIG_BLOCK, &blocked, nullptr) != 0)
        throw ProtocolError();
      // SIGPIPE is blocked only in this private writer thread and disappears
      // with that thread; neither global disposition nor caller mask changes.
      std::unique_ptr<LinuxSeqpacketEndpoint> packet;
      if (transport == LinuxOutputTransport::seqpacket)
        packet = std::make_unique<LinuxSeqpacketEndpoint>(stream.get());
      const OutputDispatcher::Write send = [this, &packet](auto header, auto body) {
        if (packet) {
          const auto due = Clock::now() + write_timeout;
          try {
            packet->send(header, body, write_timeout, cancellation.get_token());
          } catch (...) {
            if (Clock::now() >= due)
              timeout = true;
            throw;
          }
          return true;
        }
        const auto due = Clock::now() + write_timeout;
        return write_bytes(header, due) && write_bytes(body, due);
      };
      while (!aborting.load()) {
        const auto result = dispatcher.write_next(send);
        if (result == DispatchResult::sent)
          continue;
        if (result == DispatchResult::closed || result == DispatchResult::failed)
          break;
        if (result != DispatchResult::idle)
          throw ProtocolError();
        pollfd event{wake.get(), POLLIN, 0};
        const auto ready = ::poll(&event, 1, -1);
        if (ready < 0 && errno == EINTR)
          continue;
        if (ready <= 0 || event.revents != POLLIN)
          throw ProtocolError();
        consume_wake();
      }
    } catch (...) {
      dispatcher.abort();
      aborting = true;
    }
    {
      const std::lock_guard lock(done_mutex);
      done = true;
    }
    done_changed.notify_all();
  }
  bool stop(std::chrono::milliseconds period) {
    if (std::this_thread::get_id() != owner || !valid_timeout(period, 10000))
      throw ProtocolError();
    if (!joined) {
      dispatcher.finish();
      signal();
      std::unique_lock lock(done_mutex);
      if (!done_changed.wait_for(lock, period, [this] { return done; })) {
        timeout = true;
        aborting = true;
        cancellation.request_stop();
        dispatcher.abort();
        signal();
        if (!done_changed.wait_for(lock, std::chrono::milliseconds(250), [this] { return done; }))
          return false;
      }
      lock.unlock();
      writer.join();
      joined = true;
      if (transport == LinuxOutputTransport::framed_stream &&
          ::fcntl(stream.get(), F_SETFL, old_flags) != 0) {
        dispatcher.abort();
        return false;
      }
    }
    const auto stats = dispatcher.try_stats();
    return stats && !stats->failed && !timeout.load();
  }
  ~Impl() {
    if (std::this_thread::get_id() != owner)
      std::terminate();
    try {
      if (!joined)
        (void)stop(write_timeout + std::chrono::milliseconds(500));
    } catch (...) {
    }
    if (!joined)
      std::terminate();
  }
};
LinuxStreamOutput::LinuxStreamOutput(int fd, std::chrono::milliseconds period,
                                     LinuxOutputTransport mode)
    : impl_(std::make_unique<Impl>(fd, period, mode)) {}
LinuxStreamOutput::~LinuxStreamOutput() = default;
DispatchAdmission LinuxStreamOutput::try_send(Kind kind, std::uint64_t id,
                                              std::span<const std::uint8_t> bytes) {
  const auto result = impl_->dispatcher.try_send(kind, id, bytes);
  if (result == DispatchAdmission::accepted)
    impl_->signal();
  return result;
}
DispatchAdmission LinuxStreamOutput::try_select_audio_codec(OutputAudioCodec codec) {
  return impl_->dispatcher.try_select_audio_codec(codec);
}
bool LinuxStreamOutput::try_discard_audio() { return impl_->dispatcher.try_discard_audio(); }
std::optional<DispatcherStats> LinuxStreamOutput::try_stats() const {
  return impl_->dispatcher.try_stats();
}
bool LinuxStreamOutput::finish(std::chrono::milliseconds period) { return impl_->stop(period); }
bool LinuxStreamOutput::timed_out() const noexcept { return impl_->timeout.load(); }
} // namespace bridge::ipc
