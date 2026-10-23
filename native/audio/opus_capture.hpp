#pragma once
#include "microphone.hpp"
#include "microphone_opus.hpp"
#include "opus_decoder.hpp"
#include <optional>

namespace bridge::audio {
struct OpusCaptureStats {
  std::uint64_t epoch = 0, decoded_packets = 0, output_packets = 0;
  std::uint64_t skipped_delay_frames = 0, reset_discarded_frames = 0;
  std::size_t queued_frames = 0;
  std::uint16_t lookahead_frames = 0;
  bool priming = true, failed = false;
};
// Serialized, isolated input composition. Removes measured codec pre-skip and
// reblocks to exact 960-frame PCM with fixed heap carry/output. No AUDIN/queue
// dispatch, permission, clock rewrite, PLC/FEC, flush or automatic retry.
class OpusCaptureDecoder final {
  struct State;
  std::unique_ptr<State> state_;

public:
  explicit OpusCaptureDecoder(std::uint64_t epoch);
  ~OpusCaptureDecoder();
  OpusCaptureDecoder(const OpusCaptureDecoder &) = delete;
  OpusCaptureDecoder &operator=(const OpusCaptureDecoder &) = delete;
  // Empty means priming, not failure. PCM borrows until next successful decode/reset.
  std::optional<ipc::microphone::PcmPacket> decode(const ipc::microphone::opus::Packet &);
  void reset(std::uint64_t new_epoch);
  OpusCaptureStats stats() const noexcept;
};
} // namespace bridge::audio
