#pragma once
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>

namespace bridge::channels {
struct DvcAllocationLimits {
  static constexpr std::size_t hard_message_bytes = 16 * 1024 * 1024;
  static constexpr std::size_t hard_encoded_bytes = hard_message_bytes + 65536;
  static constexpr std::size_t hard_segments = 4096;
  static constexpr std::size_t single_output_bytes = 65536;
  std::size_t message_bytes = hard_message_bytes;
  std::size_t codec_bytes = hard_message_bytes;
  std::size_t encoded_bytes = hard_encoded_bytes;
  std::size_t segments = hard_segments;
};
struct ZgfxAllocationInfo {
  std::size_t segments = 0;
  std::optional<std::uint32_t> declared_output;
  // Upper bound on pinned zgfx_append output allocation including 64-byte padding.
  std::size_t allocation_ceiling = 0;
};
struct DvcAllocationInfo {
  std::uint8_t command = 0;
  std::optional<std::uint32_t> channel_id, declared_message;
  std::size_t payload_bytes = 0;
  std::optional<ZgfxAllocationInfo> codec;
};
// Allocation-free resource-header inspection only, not an entropy decoder or
// transport/reassembly owner. Caller must bound outer SVC storage before this
// complete-message inspection and install it before actual host dispatch.
std::optional<ZgfxAllocationInfo> inspect_zgfx_allocations(std::span<const std::uint8_t>,
                                                           DvcAllocationLimits = {}) noexcept;
std::optional<DvcAllocationInfo> inspect_dvc_allocations(std::span<const std::uint8_t>,
                                                         DvcAllocationLimits = {}) noexcept;
} // namespace bridge::channels
