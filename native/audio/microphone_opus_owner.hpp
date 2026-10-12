#pragma once
#include "microphone_session.hpp"
#include "opus_capture.hpp"

namespace bridge::audio {
struct MicrophoneOpusStats {
  std::uint64_t accepted = 0, stale = 0, unavailable = 0, busy = 0, invalid = 0;
  std::uint64_t primed = 0, pcm_units = 0, decoded_packets = 0, discarded_partial_frames = 0;
  std::uint64_t epoch = 0;
  std::size_t partial_frames = 0;
  bool failed = false, retired = false;
};
// Serialized RDP-thread composition, borrowing a live MicrophoneSession. No
// capture permission, worker dispatch, thread, timer, packet queue or wire selector.
class MicrophoneOpusOwner final {
  MicrophoneSession &owner_;
  const std::thread::id thread_;
  std::unique_ptr<OpusCaptureDecoder> decoder_;
  MicrophoneOpusStats stats_;
  bool busy_ = false;
  bool on_thread() const noexcept;
  void clear() noexcept;
  ipc::microphone::Result count(ipc::microphone::Result) noexcept;

public:
  explicit MicrophoneOpusOwner(MicrophoneSession &);
  ~MicrophoneOpusOwner();
  MicrophoneOpusOwner(const MicrophoneOpusOwner &) = delete;
  MicrophoneOpusOwner &operator=(const MicrophoneOpusOwner &) = delete;
  ipc::microphone::Result submit(const ipc::microphone::opus::Packet &) noexcept;
  // Drop prediction/partial PCM on unavailable/unpublished/changed source.
  bool synchronize() noexcept;
  // Host joins input first; this drops codec bytes, not the AUDIN source queue.
  bool invalidate() noexcept;
  bool retire() noexcept;
  std::optional<MicrophoneOpusStats> stats() const noexcept;
};
} // namespace bridge::audio
