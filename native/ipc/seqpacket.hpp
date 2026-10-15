#pragma once
#include "clipboard.hpp"
#include "protocol.hpp"
#include <optional>

namespace bridge::ipc {
// Versioned packet carrier beneath the unchanged RWI1 envelope. One logical
// record at a time; the caller owns the bounded datagram scratch buffer.
constexpr std::size_t seqpacket_prefix_bytes = 16;
constexpr std::size_t seqpacket_chunk_bytes = 16384;
constexpr std::size_t seqpacket_datagram_bytes = seqpacket_prefix_bytes + seqpacket_chunk_bytes;
constexpr std::size_t max_seqpacket_record_bytes = header_bytes + clipboard::max_record_bytes;

std::array<std::uint8_t, seqpacket_prefix_bytes> encode_seqpacket_prefix(std::uint32_t message_id,
                                                                         std::uint32_t total_bytes,
                                                                         std::uint32_t offset,
                                                                         std::size_t data_bytes);

class SeqpacketInspector {
public:
  // Refusal permanently invalidates this transport. Returned data is borrowed
  // from the caller's datagram; first RWI1 header is validated before allocation.
  std::optional<std::span<const std::uint8_t>> inspect(std::span<const std::uint8_t>) noexcept;
  bool failed() const noexcept { return failed_; }
  bool at_record_boundary() const noexcept { return !failed_ && offset_ == 0; }

private:
  std::uint64_t next_message_ = 1;
  std::uint32_t total_ = 0, offset_ = 0;
  bool failed_ = false;
  std::optional<std::span<const std::uint8_t>> refuse() noexcept;
};
} // namespace bridge::ipc
