#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include "windows_pipe.hpp"
#include <algorithm>
#include <cstdlib>
#include <thread>
#include <windows.h>

namespace bridge::ipc {
namespace {
class Handle {
  HANDLE value_ = nullptr;

public:
  explicit Handle(HANDLE value) : value_(value) {
    if (!value || value == INVALID_HANDLE_VALUE)
      throw ProtocolError();
  }
  ~Handle() {
    if (!CloseHandle(value_))
      std::terminate();
  }
  HANDLE get() const noexcept { return value_; }
};
void signal(HANDLE event) {
  if (!SetEvent(event))
    throw ProtocolError();
}
bool valid_timeout(std::chrono::milliseconds timeout, std::int64_t maximum) noexcept {
  return timeout.count() >= 20 && timeout.count() <= maximum;
}
} // namespace
struct WindowsPipeOutput::Impl {
  HANDLE pipe;
  const DWORD write_timeout;
  Handle wake{CreateEventW(nullptr, FALSE, FALSE, nullptr)};
  Handle changed{CreateEventW(nullptr, FALSE, FALSE, nullptr)};
  Handle start{CreateEventW(nullptr, TRUE, FALSE, nullptr)};
  Handle done{CreateEventW(nullptr, TRUE, FALSE, nullptr)};
  OutputDispatcher dispatcher;
  std::atomic<bool> aborting{false}, writer_done{false}, timeout{false};
  std::atomic<ULONGLONG> deadline{0};
  std::thread writer, watchdog;
  const std::thread::id owner = std::this_thread::get_id();
  bool joined = false;

  Impl(HANDLE handle, std::chrono::milliseconds period)
      : pipe(handle), write_timeout(static_cast<DWORD>(period.count())) {
    if (!valid_timeout(period, 5000) || !pipe || pipe == INVALID_HANDLE_VALUE ||
        GetFileType(pipe) != FILE_TYPE_PIPE)
      throw ProtocolError();
    try {
      writer = std::thread([this] { run(); });
      watchdog = std::thread([this] { watch(); });
      signal(start.get());
    } catch (...) {
      aborting = true;
      signal(start.get());
      signal(wake.get());
      signal(changed.get());
      if (watchdog.joinable())
        watchdog.join();
      if (writer.joinable())
        writer.join();
      throw ProtocolError();
    }
  }
  bool write_bytes(std::span<const std::uint8_t> bytes) noexcept {
    std::size_t used = 0;
    while (used < bytes.size()) {
      if (aborting.load())
        return false;
      const auto count = static_cast<DWORD>(std::min<std::size_t>(bytes.size() - used, 65536));
      DWORD written = 0;
      if (!WriteFile(pipe, bytes.data() + used, count, &written, nullptr) || !written ||
          written > count)
        return false;
      used += written;
    }
    return true;
  }
  bool write(std::span<const std::uint8_t> header, std::span<const std::uint8_t> body) {
    if (aborting.load())
      return false;
    deadline.store(GetTickCount64() + write_timeout);
    signal(changed.get());
    const bool success = write_bytes(header) && write_bytes(body);
    deadline.store(0);
    signal(changed.get());
    return success && !aborting.load();
  }
  void cancel() noexcept {
    aborting = true;
    dispatcher.abort();
    if (!CancelSynchronousIo(writer.native_handle()) && GetLastError() != ERROR_NOT_FOUND)
      dispatcher.abort();
  }
  void run() noexcept {
    try {
      if (WaitForSingleObject(start.get(), INFINITE) != WAIT_OBJECT_0)
        throw ProtocolError();
      const OutputDispatcher::Write send = [this](auto header, auto body) {
        return write(header, body);
      };
      while (!aborting.load()) {
        const auto result = dispatcher.write_next(send);
        if (result == DispatchResult::sent)
          continue;
        if (result == DispatchResult::closed || result == DispatchResult::failed)
          break;
        if (result != DispatchResult::idle ||
            WaitForSingleObject(wake.get(), INFINITE) != WAIT_OBJECT_0)
          throw ProtocolError();
      }
    } catch (...) {
      dispatcher.abort();
      aborting = true;
    }
    deadline.store(0);
    writer_done = true;
    if (!SetEvent(changed.get()) || !SetEvent(done.get()))
      std::terminate();
  }
  void watch() noexcept {
    try {
      while (!writer_done.load()) {
        DWORD wait = INFINITE;
        const auto due = deadline.load();
        if (aborting.load() || (due && GetTickCount64() >= due)) {
          if (!aborting.load())
            timeout = true;
          cancel(); // Repeat to cover cancellation-before-WriteFile race.
          signal(wake.get());
          wait = 10;
        } else if (due) {
          const auto now = GetTickCount64();
          wait = static_cast<DWORD>(due > now ? std::min<ULONGLONG>(due - now, 100) : 0);
        }
        const auto result = WaitForSingleObject(changed.get(), wait);
        if (result != WAIT_OBJECT_0 && result != WAIT_TIMEOUT)
          throw ProtocolError();
      }
    } catch (...) {
      cancel();
      if (!SetEvent(wake.get()))
        std::terminate();
    }
  }
  bool stop(std::chrono::milliseconds period) {
    if (std::this_thread::get_id() != owner || !valid_timeout(period, 10000))
      throw ProtocolError();
    if (!joined) {
      dispatcher.finish();
      signal(wake.get());
      auto result = WaitForSingleObject(done.get(), static_cast<DWORD>(period.count()));
      if (result == WAIT_TIMEOUT) {
        timeout = true;
        cancel();
        signal(wake.get());
        signal(changed.get());
        result = WaitForSingleObject(done.get(), 250);
      }
      if (result != WAIT_OBJECT_0)
        return false; // Caller must not destroy live callback ownership.
      watchdog.join();
      writer.join();
      joined = true;
    }
    const auto stats = dispatcher.try_stats();
    return stats && !stats->failed && !timeout.load();
  }
  ~Impl() {
    if (std::this_thread::get_id() != owner)
      std::terminate();
    try {
      if (!joined)
        (void)stop(std::chrono::milliseconds(write_timeout + 500));
    } catch (...) {
    }
    if (!joined)
      std::terminate(); // Fail the owned process rather than release live spans/threads.
  }
};
WindowsPipeOutput::WindowsPipeOutput(void *write_handle, std::chrono::milliseconds timeout)
    : impl_(std::make_unique<Impl>(write_handle, timeout)) {}
WindowsPipeOutput::~WindowsPipeOutput() = default;
DispatchAdmission WindowsPipeOutput::try_send(Kind kind, std::uint64_t id,
                                              std::span<const std::uint8_t> bytes) {
  const auto result = impl_->dispatcher.try_send(kind, id, bytes);
  if (result == DispatchAdmission::accepted)
    signal(impl_->wake.get());
  return result;
}
std::optional<DispatcherStats> WindowsPipeOutput::try_stats() const {
  return impl_->dispatcher.try_stats();
}
bool WindowsPipeOutput::try_discard_audio() { return impl_->dispatcher.try_discard_audio(); }
bool WindowsPipeOutput::finish(std::chrono::milliseconds timeout) { return impl_->stop(timeout); }
bool WindowsPipeOutput::timed_out() const noexcept { return impl_->timeout.load(); }
} // namespace bridge::ipc
