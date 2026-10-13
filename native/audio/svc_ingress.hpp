#pragma once
#include "ingress.hpp"
#include <functional>

namespace bridge::audio {
struct AudioSvcFragment {
  std::span<const std::uint8_t> bytes;
  std::size_t total_bytes = 0;
  bool first = false, last = false;
};
struct AudioSvcStats {
  std::uint64_t fragments = 0, forwarded = 0, rejected = 0, abandoned = 0;
  std::size_t stored_bytes = 0;
  bool partial = false, awaiting_wave = false, dispatching = false, closed = false, failed = false;
};
// Isolated, serialized complete RDPSND message owner. Does not select a device,
// decode PCM or install a public receive callback. The fixed arena survives borrows.
class AudioSvcIngress final {
public:
  using Forward = std::function<bool(std::span<const std::uint8_t>)>;
  explicit AudioSvcIngress(Forward, std::uint64_t timeout_ms = 2000);
  ~AudioSvcIngress();
  AudioSvcIngress(const AudioSvcIngress &) = delete;
  AudioSvcIngress &operator=(const AudioSvcIngress &) = delete;
  bool receive(AudioSvcFragment, std::uint64_t now_ms) noexcept;
  bool poll(std::uint64_t now_ms) noexcept;
  void close() noexcept;
  AudioSvcStats stats() const noexcept;

private:
  Forward forward_;
  const std::uint64_t timeout_ms_;
  AudioAssembler assembler_;
  AudioPduValidator validator_;
  AudioSvcStats counters_;
  std::optional<std::uint64_t> observed_, deadline_;
  bool busy_ = false, closed_ = false, failed_ = false;
  bool fail(bool abandoned = false) noexcept;
  void wipe() noexcept;
};
} // namespace bridge::audio
