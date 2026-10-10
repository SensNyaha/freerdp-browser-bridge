#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <span>

namespace bridge::audio {
struct PcmFormat {
  std::uint32_t rate;
  std::uint16_t channels;
  std::uint16_t bits;
  bool operator==(const PcmFormat &) const = default;
};
enum class PcmStatus { accepted, unconfigured, invalid, capacity };
struct PcmResult {
  PcmStatus status;
  std::span<const std::uint8_t> bytes;
  std::size_t frames = 0;
};
// Single serialized owner. Results borrow fixed storage until process/reset/configure.
// Only unsigned PCM8 / signed little-endian PCM16, mono/stereo, 8..48 kHz.
// Rates above output require a future antialiasing downsampler, not silent folding.
class PcmNormalizer {
public:
  static constexpr std::uint32_t output_rate = 48000;
  static constexpr std::size_t max_input_bytes = 65536;
  static constexpr std::size_t max_output_frames = 4800; // 100 ms; not a jitter queue.
  static constexpr std::size_t max_output_bytes = max_output_frames * 4;
  PcmNormalizer();
  PcmNormalizer(const PcmNormalizer &) = delete;
  PcmNormalizer &operator=(const PcmNormalizer &) = delete;
  bool configure(PcmFormat) noexcept;
  void reset() noexcept;
  PcmResult process(std::span<const std::uint8_t>) noexcept;
  std::uint64_t produced_frames() const noexcept { return produced_; }
  std::optional<PcmFormat> format() const noexcept { return format_; }

private:
  std::unique_ptr<std::array<std::uint8_t, max_output_bytes>> output_;
  std::optional<PcmFormat> format_;
  std::array<std::int16_t, 2> previous_{};
  std::uint64_t next_ = 0, produced_ = 0;
  bool have_previous_ = false;
};
} // namespace bridge::audio
