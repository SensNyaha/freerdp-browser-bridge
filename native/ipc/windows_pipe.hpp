#pragma once
#include "../compat/span.hpp"
#include "output_dispatcher.hpp"
#include <chrono>
#include <memory>

namespace bridge::ipc {
// Windows anonymous/synchronous byte-pipe driver. Borrowed write handle must
// outlive this owner; the owner must outlive producer calls. No worker selection yet.
class WindowsPipeOutput {
public:
  explicit WindowsPipeOutput(void *write_handle, std::chrono::milliseconds write_timeout =
                                                     std::chrono::milliseconds(1000));
  ~WindowsPipeOutput();
  WindowsPipeOutput(const WindowsPipeOutput &) = delete;
  WindowsPipeOutput &operator=(const WindowsPipeOutput &) = delete;
  DispatchAdmission try_send(Kind, std::uint64_t, ::bridge::compat::span<const std::uint8_t>);
  DispatchAdmission try_select_audio_codec(OutputAudioCodec codec);
  std::optional<DispatcherStats> try_stats() const;
  bool try_discard_audio();
  // Graceful drain deadline, then cancellation grace. False means failed drain.
  // Only the owning thread may call finish/destruction; never call from producers.
  bool finish(std::chrono::milliseconds drain_timeout = std::chrono::milliseconds(1500));
  bool timed_out() const noexcept;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
} // namespace bridge::ipc
