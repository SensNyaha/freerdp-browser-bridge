#pragma once
#include "output_dispatcher.hpp"
#include <chrono>
#include <memory>

namespace bridge::ipc {
// Framed-stream fallback for inherited FIFO/AF_UNIX SOCK_STREAM descriptors.
// The caller retains its descriptor and gives this owner exclusive write use
// until finish/destruction. Producers must retire before owner teardown.
class LinuxStreamOutput {
public:
  explicit LinuxStreamOutput(
      int write_fd, std::chrono::milliseconds write_timeout = std::chrono::milliseconds(1000));
  ~LinuxStreamOutput();
  LinuxStreamOutput(const LinuxStreamOutput &) = delete;
  LinuxStreamOutput &operator=(const LinuxStreamOutput &) = delete;
  DispatchAdmission try_send(Kind, std::uint64_t, std::span<const std::uint8_t>);
  DispatchAdmission try_select_audio_codec(OutputAudioCodec);
  bool try_discard_audio();
  std::optional<DispatcherStats> try_stats() const;
  bool finish(std::chrono::milliseconds drain_timeout = std::chrono::milliseconds(1500));
  bool timed_out() const noexcept;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
} // namespace bridge::ipc
