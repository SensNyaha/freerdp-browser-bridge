#pragma once
#include "queue.hpp"

namespace bridge::audio {
enum class CaptureStatus { accepted, inactive, stale, invalid };
struct CapturePacket {
  std::uint64_t epoch, timestamp_us;
  bool discontinuity;
  std::span<const std::uint8_t> stereo;
};
struct CaptureRead {
  CaptureStatus status;
  std::span<const std::uint8_t> bytes;
  std::size_t frames = 0, silence_frames = 0;
  bool discontinuity = false;
};
struct CaptureStats {
  QueueStats queue;
  std::uint64_t invalid_calls = 0, stale_packets = 0, discontinuities = 0;
  std::uint64_t buffering_silence_frames = 0;
  bool active = false, buffering = true;
};
// Serialized virtual microphone foundation; no host capture, waits or wire activation.
// Browser input is exactly 20 ms S16LE 48 kHz stereo. AUDIN projection is PCM16
// 48 kHz mono/stereo, 1..4,800 frames. Scratch and 120 ms queue allocate once.
class PcmCaptureSource {
public:
  static constexpr std::size_t packet_frames = 960, packet_bytes = packet_frames * 4;
  static constexpr std::size_t prebuffer_frames = 1920;
  PcmCaptureSource();
  PcmCaptureSource(const PcmCaptureSource &) = delete;
  PcmCaptureSource &operator=(const PcmCaptureSource &) = delete;
  bool configure(PcmFormat, std::size_t frames_per_packet) noexcept;
  bool start(std::uint64_t epoch) noexcept;
  void stop() noexcept;
  CaptureStatus submit(const CapturePacket &) noexcept;
  // Always bounded; valid active reads return configured frames, including silence.
  // Returned bytes borrow scratch until read/configure/start/stop.
  CaptureRead read() noexcept;
  CaptureStats stats() const noexcept;
  std::optional<PcmFormat> format() const noexcept { return format_; }
  std::size_t frames_per_packet() const noexcept { return frames_per_packet_; }

private:
  PcmQueue queue_;
  std::unique_ptr<std::array<std::uint8_t, PcmNormalizer::max_output_bytes>> scratch_;
  std::optional<PcmFormat> format_;
  std::optional<std::uint64_t> timestamp_;
  std::uint64_t epoch_ = 0;
  std::size_t frames_per_packet_ = 0;
  CaptureStats stats_;
};
} // namespace bridge::audio
