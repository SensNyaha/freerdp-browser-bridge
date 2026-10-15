#pragma once
#include "../ipc/clipboard.hpp"
#include "text_session.hpp"
#include <memory>
#include <mutex>

namespace bridge::clipboard {
// One IPC producer and one synchronous RDP owner. Construct anywhere, start /
// bind / pump / retire on one RDP thread. Retire before destroying that thread
// or the SDK context. No callback/transport call runs under the producer mutex.
class WorkerSession final {
public:
  using Send = std::function<bool(ipc::Kind, std::uint64_t, std::span<const std::uint8_t>)>;
  using Clock = TextSession::Clock;
  WorkerSession(TextPolicy, Send, Clock, TextSession::Resolve = TextSession::resolve_channel);
  ~WorkerSession();
  WorkerSession(const WorkerSession &) = delete;
  WorkerSession &operator=(const WorkerSession &) = delete;
  bool start(std::uint64_t generation) noexcept;
  UINT bind(CliprdrClientContext &) noexcept;
  // nullopt means scheduled, otherwise the caller retains/wipes the payload
  // and sends the typed refusal. A successful admission moves, never copies it.
  std::optional<ipc::clipboard::Status> submit(std::uint64_t correlation,
                                               std::vector<std::uint8_t> &) noexcept;
  bool pump() noexcept;
  void retire() noexcept;
  std::optional<ipc::clipboard::State> admitted() const noexcept;

private:
  struct Job {
    ipc::clipboard::Operation operation;
    std::uint64_t generation, revision, id, deadline;
    std::vector<std::uint8_t> payload;
  };
  const TextPolicy policy_;
  Send send_;
  Clock clock_;
  TextSession::Resolve resolve_;
  mutable std::mutex mutex_;
  std::optional<ipc::clipboard::State> admitted_;
  std::optional<Job> queued_, active_;
  bool occupied_ = false, stopped_ = true;
  std::unique_ptr<TextSession> text_;
  std::thread::id owner_;
  std::uint64_t generation_ = 0, now_ = 0, output_deadline_ = 0;
  std::vector<std::uint8_t> result_;
  std::optional<std::array<std::uint8_t, ipc::clipboard::metadata_bytes>> published_;
  bool seen_clock_ = false, started_ = false, bound_ = false, pumping_ = false;
  bool retire_requested_ = false;
  bool current_thread() const noexcept;
  bool observe() noexcept;
  bool complete(ipc::clipboard::Status, std::span<const std::uint8_t> = {}) noexcept;
  bool reply(std::uint64_t, TextReply, std::span<const std::uint8_t>) noexcept;
  bool publish(const TextSnapshot &);
  void release_job() noexcept;
  bool fail() noexcept;
};
} // namespace bridge::clipboard
