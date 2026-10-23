#pragma once
#include "../compat/span.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>

namespace bridge::audio {
enum class AudinPhase { version, formats, open, recording, unsupported, failed };
enum class AudinPduKind { version, formats, open, change };
enum class AudinCaptureProfile { compatibility, worker };
struct AudinPdu {
  AudinPduKind kind;
  ::bridge::compat::span<const std::uint8_t> bytes;
  std::uint32_t version = 0, format_count = 0, format_index = 0, frames_per_packet = 0;
  bool forward = true; // No common format must not enter upstream's zero-count parser.
};
// Serialized, allocation-free server-PDU validation/PCM offer filtering only.
// It does not establish drdynvc's earlier allocation/decompression limits or
// successful transport negotiation. Caller closes on downstream dispatch failure.
class AudinIngress {
public:
  static constexpr std::size_t max_bytes = 65536, max_formats = 64, max_extra = 1024;
  static constexpr std::size_t max_offer_bytes = 9 + max_formats * 18;
  static constexpr std::uint32_t worker_min_frames = 480, max_frames = 4800;
  explicit AudinIngress(AudinCaptureProfile profile = AudinCaptureProfile::compatibility) noexcept
      : profile_(profile) {}
  std::optional<AudinPdu> inspect(::bridge::compat::span<const std::uint8_t>) noexcept;
  void reset() noexcept;
  AudinPhase phase() const noexcept { return phase_; }
  std::uint32_t format_count() const noexcept { return count_; }
  std::uint32_t frames_per_packet() const noexcept { return frames_; }

private:
  const AudinCaptureProfile profile_;
  std::array<std::uint8_t, max_offer_bytes> offer_{};
  AudinPhase phase_ = AudinPhase::version;
  std::uint32_t version_ = 0, count_ = 0, frames_ = 0;
  std::optional<AudinPdu> reject() noexcept;
};
} // namespace bridge::audio
