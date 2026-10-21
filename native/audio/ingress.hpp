#pragma once
#include "../compat/span.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>

namespace bridge::audio {
enum class FragmentStatus { collecting, complete, invalid };
struct FragmentResult {
  FragmentStatus status;
  ::bridge::compat::span<const std::uint8_t> bytes;
};
// Generic bounded SVC assembly. Caller maps transport flags and serializes ownership.
class AudioAssembler {
public:
  static constexpr std::size_t max_bytes = 65536, max_fragments = 4096;
  AudioAssembler();
  FragmentResult push(::bridge::compat::span<const std::uint8_t>, std::size_t total, bool first,
                      bool last) noexcept;
  void reset() noexcept;
  bool failed() const noexcept { return failed_; }
  bool assembling() const noexcept { return active_; }

private:
  std::unique_ptr<std::array<std::uint8_t, max_bytes>> bytes_;
  std::size_t used_ = 0, total_ = 0, fragments_ = 0;
  bool active_ = false, failed_ = false;
  FragmentResult reject() noexcept;
};

enum class AudioPduKind { formats, training, volume, close, wave_info, wave, wave2 };
struct AudioPdu {
  AudioPduKind kind;
  std::uint32_t timestamp = 0;
  std::uint16_t format_index = 0, format_count = 0;
  std::uint8_t block = 0, timestamp_bits = 0;
  std::size_t sample_bytes = 0;
};
// Validate complete client RDPSND ingress records before upstream parser allocations.
// This is baseline control/Wave/Wave2 validation, not format selection or PCM decoding.
class AudioPduValidator {
public:
  static constexpr std::size_t max_formats = 64, max_format_extra = 1024;
  std::optional<AudioPdu> validate(::bridge::compat::span<const std::uint8_t>) noexcept;
  void reset() noexcept;
  bool failed() const noexcept { return failed_; }
  bool awaiting_wave() const noexcept { return pending_wave_ != 0; }

private:
  bool failed_ = false;
  std::size_t pending_wave_ = 0;
  AudioPdu wave_{AudioPduKind::wave};
  std::optional<AudioPdu> reject() noexcept;
};
} // namespace bridge::audio
