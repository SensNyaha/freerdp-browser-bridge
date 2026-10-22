#include "../compat/span.hpp"
#include "dvc_bounds.hpp"

namespace bridge::channels {
bool DvcAllocationLimits::valid() const noexcept {
  return message_bytes > 0 && message_bytes <= hard_message_bytes && codec_bytes > 0 &&
         codec_bytes <= hard_message_bytes && encoded_bytes > 0 &&
         encoded_bytes <= hard_encoded_bytes && segments > 0 && segments <= hard_segments;
}
namespace {
struct Reader {
  ::bridge::compat::span<const std::uint8_t> bytes;
  std::size_t position = 0;
  std::optional<std::uint32_t> integer(std::size_t width) noexcept {
    if (width == 0 || width > 4 || width > bytes.size() - position)
      return std::nullopt;
    std::uint32_t value = 0;
    for (std::size_t index = 0; index < width; ++index)
      value |= static_cast<std::uint32_t>(bytes[position + index]) << (index * 8);
    position += width;
    return value;
  }
  std::optional<::bridge::compat::span<const std::uint8_t>> take(std::size_t size) noexcept {
    if (size > bytes.size() - position)
      return std::nullopt;
    const auto result = bytes.subspan(position, size);
    position += size;
    return result;
  }
};
constexpr std::size_t width(std::uint8_t selector) noexcept {
  // Pinned drdynvc_cblen_to_bytes/read_variable_uint both map selectors 2/3 to 4.
  return selector == 0 ? 1 : selector == 1 ? 2 : 4;
}
std::optional<std::size_t> segment(::bridge::compat::span<const std::uint8_t> bytes) noexcept {
  if (bytes.size() < 2)
    return std::nullopt;
  if ((bytes.front() & 0x20) == 0) {
    const auto size = bytes.size() - 1;
    if (size > DvcAllocationLimits::single_output_bytes)
      return std::nullopt;
    return size;
  }
  // The compressed segment ends with the count of unused bits; no SDK decoding here.
  if (bytes.back() > (bytes.size() - 2) * 8)
    return std::nullopt;
  return DvcAllocationLimits::single_output_bytes;
}
} // namespace

std::optional<ZgfxAllocationInfo> inspect_zgfx_allocations(::bridge::compat::span<const std::uint8_t> bytes,
                                                           DvcAllocationLimits limits) noexcept {
  if (!limits.valid() || bytes.empty() || bytes.size() > limits.encoded_bytes)
    return std::nullopt;
  Reader reader{bytes};
  const auto descriptor = reader.integer(1);
  if (*descriptor == 0xe0) {
    const auto body = reader.take(bytes.size() - reader.position);
    const auto bound = segment(*body);
    if (!bound || *bound > limits.codec_bytes)
      return std::nullopt;
    const bool compressed = (body->front() & 0x20) != 0;
    return ZgfxAllocationInfo{
        1,
        compressed ? std::nullopt
                   : std::optional<std::uint32_t>(static_cast<std::uint32_t>(*bound)),
        *bound ? *bound + 64 : 0};
  }
  if (*descriptor != 0xe1)
    return std::nullopt;
  const auto count = reader.integer(2), output = reader.integer(4);
  if (!count || !output || *count > limits.segments || *output > limits.codec_bytes)
    return std::nullopt;
  std::size_t known = 0, possible = 0;
  bool compressed = false;
  for (std::uint32_t index = 0; index < *count; ++index) {
    const auto size = reader.integer(4);
    if (!size)
      return std::nullopt;
    const auto body = reader.take(*size);
    if (!body)
      return std::nullopt;
    const auto bound = segment(*body);
    if (!bound)
      return std::nullopt;
    possible += *bound; // At most 4096 * 65536, independent of hostile uint32 fields.
    if ((body->front() & 0x20) == 0)
      known += *bound;
    else
      compressed = true;
  }
  if (reader.position != bytes.size() || *output < known || *output > possible ||
      (!compressed && *output != known))
    return std::nullopt;
  // Pinned zgfx_append checks used+OutputCount <= uncompressedSize before realloc.
  return ZgfxAllocationInfo{*count, *output, *count ? static_cast<std::size_t>(*output) + 64 : 0};
}

std::optional<DvcAllocationInfo> inspect_dvc_allocations(::bridge::compat::span<const std::uint8_t> bytes,
                                                         DvcAllocationLimits limits) noexcept {
  if (!limits.valid() || bytes.empty() || bytes.size() > limits.encoded_bytes)
    return std::nullopt;
  Reader reader{bytes};
  const auto header = static_cast<std::uint8_t>(*reader.integer(1));
  DvcAllocationInfo result;
  result.command = header >> 4;
  if (result.command != 2 && result.command != 3 && result.command != 6 && result.command != 7)
    return result; // Control/unknown PDUs still require the host's separate validation.
  result.channel_id = reader.integer(width(header & 3));
  if (!result.channel_id)
    return std::nullopt;
  const bool first = result.command == 2 || result.command == 6;
  if (first) {
    result.declared_message = reader.integer(width((header >> 2) & 3));
    if (!result.declared_message || *result.declared_message > limits.message_bytes)
      return std::nullopt;
  }
  const auto body = bytes.subspan(reader.position);
  result.payload_bytes = body.size();
  if (result.command == 6 || result.command == 7) {
    result.codec = inspect_zgfx_allocations(body, limits);
    if (!result.codec || (result.codec->declared_output &&
                          (*result.codec->declared_output > limits.message_bytes ||
                           (first && *result.codec->declared_output > *result.declared_message))))
      return std::nullopt;
  } else if (body.size() > limits.message_bytes ||
             (first && body.size() > *result.declared_message))
    return std::nullopt;
  return result;
}
} // namespace bridge::channels
