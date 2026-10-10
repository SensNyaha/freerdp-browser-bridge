#pragma once
#include "queue.hpp"
#include <atomic>
#include <freerdp/client/rdpsnd.h>
#include <thread>

namespace bridge::audio {
struct SinkStats {
  QueueStats queue;
  std::uint64_t rejected_packets = 0, overflow_resets = 0;
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
    std::array<std::uint8_t, PcmNormalizer::max_output_bytes> volume{};
  };
  std::unique_ptr<Pipeline> pipeline_;
  std::thread::id thread_;
  std::atomic<bool> retired_{false};
  bool opened_ = false;
  UINT32 volume_ = 0xffffffffU;
  SinkStats stats_;
  static RdpsndSink *owner(rdpsndDevicePlugin *) noexcept;
  bool usable() const noexcept;
  void discontinuity() noexcept;
  static BOOL supported(rdpsndDevicePlugin *, const AUDIO_FORMAT *) noexcept;
  static BOOL open(rdpsndDevicePlugin *, const AUDIO_FORMAT *, UINT32) noexcept;
  static UINT32 get_volume(rdpsndDevicePlugin *) noexcept;
  static BOOL set_volume(rdpsndDevicePlugin *, UINT32) noexcept;
  static UINT play(rdpsndDevicePlugin *, const BYTE *, std::size_t) noexcept;
  static void close(rdpsndDevicePlugin *) noexcept;
  static void free(rdpsndDevicePlugin *) noexcept;
  static BOOL default_format(rdpsndDevicePlugin *, const AUDIO_FORMAT *, AUDIO_FORMAT *) noexcept;

public:
  RdpsndSink();
  RdpsndSink(const RdpsndSink &) = delete;
  RdpsndSink &operator=(const RdpsndSink &) = delete;
  rdpsndDevicePlugin &device() noexcept { return device_; }
  QueueRead read(std::span<std::uint8_t>) noexcept;
  std::optional<SinkStats> stats() const noexcept;
  bool retire() noexcept;
  bool retired() const noexcept { return retired_.load(std::memory_order_acquire); }
};
} // namespace bridge::audio
