#include "../compat/span.hpp"
#include "touch_frame.hpp"
#include <algorithm>
#include <freerdp/channels/rdpei.h>

namespace bridge::touch {
namespace {
struct Reader {
  ::bridge::compat::span<const std::uint8_t> bytes;
  std::size_t at = 0;
  bool byte(std::uint8_t &value) noexcept {
    if (at == bytes.size())
      return false;
    value = bytes[at++];
    return true;
  }
  bool number(unsigned width, bool sign, std::int64_t &value) noexcept {
    std::uint8_t first = 0;
    if (!byte(first))
      return false;
    const unsigned shift = width == 2 ? 7 : width == 4 ? 6 : 5;
    const unsigned count = first >> shift;
    const auto mask = (1U << (shift - unsigned(sign))) - 1;
    std::uint64_t magnitude = first & mask;
    if (count >= width || count > bytes.size() - at)
      return false;
    for (unsigned i = 0; i < count; ++i)
      magnitude = (magnitude << 8) | bytes[at++];
    value = static_cast<std::int64_t>(magnitude);
    if (sign && (first & (1U << (shift - 1))))
      value = -value;
    return true;
  }
};
bool contact(Reader &r, ContactView &out) noexcept {
  const auto start = r.at;
  std::uint8_t id = 0;
  std::int64_t fields = 0, x = 0, y = 0, flags = 0, unused = 0;
  if (!r.byte(id) || id >= 64 || !r.number(2, false, fields) || (fields & ~7LL) ||
      !r.number(4, true, x) || !r.number(4, true, y) || !r.number(4, false, flags))
    return false;
  switch (flags) {
  case 4:
  case 36:
  case 2:
  case 34:
  case 25:
  case 26:
  case 12:
  case 10:
    break;
  default:
    return false;
  }
  if (fields & CONTACT_DATA_CONTACTRECT_PRESENT)
    for (unsigned i = 0; i < 4; ++i)
      if (!r.number(2, true, unused))
        return false;
  if ((fields & CONTACT_DATA_ORIENTATION_PRESENT) && (!r.number(4, false, unused) || unused > 359))
    return false;
  if ((fields & CONTACT_DATA_PRESSURE_PRESENT) && (!r.number(4, false, unused) || unused > 1024))
    return false;
  if (r.at - start > TerminalRecord::capacity)
    return false;
  out = {id, static_cast<std::int32_t>(x), static_cast<std::int32_t>(y),
         static_cast<std::uint32_t>(flags), r.bytes.subspan(start, r.at - start)};
  return true;
}
} // namespace
std::optional<TouchFrame> read_touch_frame(::bridge::compat::span<const std::uint8_t> bytes) noexcept {
  if (bytes.size() < 10 || bytes.size() > 8192 || bytes[0] != 3 || bytes[1] != 0)
    return std::nullopt;
  std::uint32_t length = 0;
  for (unsigned i = 0; i < 4; ++i)
    length |= std::uint32_t{bytes[2 + i]} << (i * 8);
  if (length != bytes.size())
    return std::nullopt;
  Reader r{bytes, 6};
  std::int64_t unused = 0, count = 0;
  if (!r.number(4, false, unused) || !r.number(2, false, count) || count != 1 ||
      !r.number(2, false, count) || count < 1 || count > 64 || !r.number(8, false, unused))
    return std::nullopt;
  TouchFrame result;
  result.count = static_cast<std::size_t>(count);
  std::array<bool, 64> seen{};
  for (std::size_t i = 0; i < result.count; ++i) {
    auto &c = result.contacts[i];
    if (!contact(r, c) || seen[c.id])
      return std::nullopt;
    seen[c.id] = true;
  }
  if (r.at != bytes.size())
    return std::nullopt;
  return result;
}
std::optional<TerminalPacket> terminal_packet(::bridge::compat::span<const TerminalRecord> records) noexcept {
  if (records.empty() || records.size() > 10)
    return std::nullopt;
  TerminalPacket result;
  // Fresh cleanup frame: encodeTime=0, frameCount=1, contactCount<=10, frameOffset=0.
  result.bytes[0] = 3;
  result.bytes[7] = 1;
  result.bytes[8] = static_cast<std::uint8_t>(records.size());
  result.size = 10;
  for (const auto &record : records) {
    if (!record.size || record.size > record.bytes.size())
      return std::nullopt;
    std::copy_n(record.bytes.begin(), record.size, result.bytes.begin() + result.size);
    result.size += record.size;
  }
  for (unsigned i = 0; i < 4; ++i)
    result.bytes[2 + i] = static_cast<std::uint8_t>(result.size >> (i * 8));
  const auto parsed = read_touch_frame(::bridge::compat::span(result.bytes).first(result.size));
  if (!parsed)
    return std::nullopt;
  for (std::size_t i = 0; i < parsed->count; ++i)
    if (parsed->contacts[i].flags != RDPINPUT_CONTACT_FLAG_UP &&
        parsed->contacts[i].flags != (RDPINPUT_CONTACT_FLAG_UP | RDPINPUT_CONTACT_FLAG_CANCELED))
      return std::nullopt;
  return result;
}
} // namespace bridge::touch
