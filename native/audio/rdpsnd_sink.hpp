#pragma once
#include "packetizer.hpp"
#include "volume.hpp"
#include <atomic>
#include <freerdp/client/rdpsnd.h>
#include <thread>

namespace bridge::audio {
enum class SourceAvailability { waiting, ready, suspended, closed, failed, unavailable };
struct SinkStats {
  QueueStats queue;
  PacketStats packets;
  std::uint64_t rejected_packets = 0, overflow_resets = 0, stream_revision = 0;
  std::uint64_t chunked_packets = 0;
  SourceAvailability availability = SourceAvailability::waiting;
};
// Public device ABI adapter, not an installed addin. One serialized RDP owner.
// Retire on that thread before joining; keep this wrapper alive through host Free.
class RdpsndSink {
  struct Device : rdpsndDevicePlugin {
    RdpsndSink *owner;
    explicit Device(RdpsndSink *value) : rdpsndDevicePlugin{}, owner(value) {}
  } device_{this};
  struct Pipeline {
    PcmNormalizer pcm;
    PcmQueue queue;
    PcmPacketizer packets;
    std::array<std::uint8_t, PcmNormalizer::max_output_bytes> volume{};
    explicit Pipeline(OutputBufferProfile profile) : queue(profile) {}
  };
  std::unique_ptr<Pipeline> pipeline_;
  std::thread::id thread_;
  std::atomic<bool> retired_{false};
  bool opened_ = false;
  PcmVolume volume_;
  SinkStats stats_;
  static RdpsndSink *owner(rdpsndDevicePlugin *) noexcept;
  bool usable() const noexcept;
  void discontinuity(SourceAvailability) noexcept;
  static BOOL supported(rdpsndDevicePlugin *, const AUDIO_FORMAT *) noexcept;
  static BOOL open(rdpsndDevicePlugin *, const AUDIO_FORMAT *, UINT32) noexcept;
  static UINT32 get_volume(rdpsndDevicePlugin *) noexcept;
  static BOOL set_volume(rdpsndDevicePlugin *, UINT32) noexcept;
  static UINT play(rdpsndDevicePlugin *, const BYTE *, std::size_t) noexcept;
  static void close(rdpsndDevicePlugin *) noexcept;
  static void free(rdpsndDevicePlugin *) noexcept;
  static BOOL default_format(rdpsndDevicePlugin *, const AUDIO_FORMAT *, AUDIO_FORMAT *) noexcept;

public:
  explicit RdpsndSink(OutputBufferProfile profile = OutputBufferProfile::low_latency);
  RdpsndSink(const RdpsndSink &) = delete;
  RdpsndSink &operator=(const RdpsndSink &) = delete;
  rdpsndDevicePlugin &device() noexcept { return device_; }
  QueueRead read(std::span<std::uint8_t>) noexcept;
  PcmPacket packet(std::uint64_t worker_time_us) noexcept;
  std::optional<std::uint64_t> publication_deadline() const noexcept;
  std::optional<SinkStats> stats() const noexcept;
  // Discard history/backlog while keeping an open device usable. Only Play marks ready.
  bool reset_stream(SourceAvailability next = SourceAvailability::waiting) noexcept;
  bool ready() const noexcept;
  std::optional<std::uint64_t> stream_revision() const noexcept;
  bool retire() noexcept;
  bool retired() const noexcept { return retired_.load(std::memory_order_acquire); }
};
} // namespace bridge::audio
