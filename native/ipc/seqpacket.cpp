#include "seqpacket.hpp"
#include <algorithm>

namespace bridge::ipc {
namespace {
constexpr std::array<std::uint8_t, 4> magic{'R', 'W', 'S', '1'};
bool valid_part(std::uint32_t id, std::uint32_t total, std::uint32_t offset,
                std::size_t size) noexcept {
  return id != 0 && total >= header_bytes && total <= max_seqpacket_record_bytes &&
         offset < total && size > 0 && size <= seqpacket_chunk_bytes && size <= total - offset &&
         (offset != 0 || size >= header_bytes);
}
} // namespace
std::array<std::uint8_t, seqpacket_prefix_bytes> encode_seqpacket_prefix(std::uint32_t id,
                                                                         std::uint32_t total,
                                                                         std::uint32_t offset,
                                                                         std::size_t size) {
  if (!valid_part(id, total, offset, size))
    throw ProtocolError();
  std::array<std::uint8_t, seqpacket_prefix_bytes> bytes{'R', 'W', 'S', '1'};
  const std::array<std::uint32_t, 3> fields{id, total, offset};
  for (std::size_t field = 0; field < fields.size(); ++field)
    for (unsigned i = 0; i < 4; ++i)
      bytes[4 + field * 4 + i] = static_cast<std::uint8_t>(fields[field] >> ((3 - i) * 8));
  return bytes;
}
std::optional<std::span<const std::uint8_t>> SeqpacketInspector::refuse() noexcept {
  failed_ = true;
  total_ = offset_ = 0;
  return std::nullopt;
}
std::optional<std::span<const std::uint8_t>>
SeqpacketInspector::inspect(std::span<const std::uint8_t> bytes) noexcept {
  if (failed_ || bytes.size() <= seqpacket_prefix_bytes ||
      bytes.size() > seqpacket_datagram_bytes ||
      !std::equal(magic.begin(), magic.end(), bytes.begin()))
    return refuse();
  try {
    const auto id = static_cast<std::uint32_t>(read_be(bytes.subspan(4, 4)));
    const auto total = static_cast<std::uint32_t>(read_be(bytes.subspan(8, 4)));
    const auto offset = static_cast<std::uint32_t>(read_be(bytes.subspan(12, 4)));
    const auto data = bytes.subspan(seqpacket_prefix_bytes);
    if (!valid_part(id, total, offset, data.size()) || id != next_message_ || offset != offset_)
      return refuse();
    if (offset == 0) {
      const auto header = decode_header(data.first(header_bytes));
      if (header.length + header_bytes != total)
        return refuse();
    } else if (total != total_)
      return refuse();
    total_ = total;
    offset_ += static_cast<std::uint32_t>(data.size());
    if (offset_ == total_) {
      offset_ = total_ = 0;
      ++next_message_; // Wider counter refuses uint32 message-ID wrap/reuse.
    }
    return data;
  } catch (...) {
    return refuse();
  }
}
} // namespace bridge::ipc
