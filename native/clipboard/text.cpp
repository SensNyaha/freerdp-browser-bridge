#include "../compat/span.hpp"
#include "text.hpp"
#include <optional>

namespace bridge::clipboard {
namespace {
struct Writer {
  std::uint8_t *data;
  std::size_t maximum, size = 0;
  bool byte(std::uint8_t value) noexcept {
    if (size == maximum)
      return false;
    if (data)
      data[size] = value;
    ++size;
    return true;
  }
  bool word(std::uint32_t value) noexcept {
    return byte(static_cast<std::uint8_t>(value)) && byte(static_cast<std::uint8_t>(value >> 8));
  }
};
bool overlap(::bridge::compat::span<const std::uint8_t> input, ::bridge::compat::span<std::uint8_t> output) noexcept {
  if (input.empty() || output.empty())
    return false;
  const auto a = reinterpret_cast<std::uintptr_t>(input.data());
  const auto b = reinterpret_cast<std::uintptr_t>(output.data());
  return a <= b ? b - a < input.size() : a - b < output.size();
}
std::optional<std::uint32_t> next_utf8(::bridge::compat::span<const std::uint8_t> input,
                                       std::size_t &at) noexcept {
  if (at == input.size())
    return {};
  const auto first = input[at++];
  if (first < 0x80)
    return first;
  unsigned remaining = 0;
  std::uint32_t value = 0, minimum = 0;
  if (first >= 0xc2 && first <= 0xdf) {
    remaining = 1;
    value = first & 0x1fU;
    minimum = 0x80;
  } else if (first >= 0xe0 && first <= 0xef) {
    remaining = 2;
    value = first & 0xfU;
    minimum = 0x800;
  } else if (first >= 0xf0 && first <= 0xf4) {
    remaining = 3;
    value = first & 7U;
    minimum = 0x10000;
  } else
    return {};
  if (remaining > input.size() - at)
    return {};
  for (unsigned i = 0; i < remaining; ++i) {
    const auto byte = input[at++];
    if ((byte & 0xc0) != 0x80)
      return {};
    value = (value << 6) | (byte & 0x3fU);
  }
  if (value < minimum || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff))
    return {};
  return value;
}
TextStatus encode(::bridge::compat::span<const std::uint8_t> input, Writer &out) noexcept {
  std::size_t at = 0;
  while (at < input.size()) {
    const auto code = next_utf8(input, at);
    if (!code || *code == 0)
      return TextStatus::invalid;
    auto value = *code;
    if (value == 13 || value == 10) {
      if (value == 13 && at < input.size() && input[at] == 10)
        ++at;
      if (!out.word(13) || !out.word(10))
        return TextStatus::too_large;
    } else if (value < 0x10000) {
      if (!out.word(value))
        return TextStatus::too_large;
    } else {
      value -= 0x10000;
      if (!out.word(0xd800 + (value >> 10)) || !out.word(0xdc00 + (value & 0x3ff)))
        return TextStatus::too_large;
    }
  }
  return out.word(0) ? TextStatus::ok : TextStatus::too_large;
}
std::uint32_t word(::bridge::compat::span<const std::uint8_t> input, std::size_t at) noexcept {
  return input[at] | (std::uint32_t{input[at + 1]} << 8);
}
bool utf8(Writer &out, std::uint32_t value) noexcept {
  if (value < 0x80)
    return out.byte(static_cast<std::uint8_t>(value));
  if (value < 0x800)
    return out.byte(static_cast<std::uint8_t>(0xc0 | (value >> 6))) &&
           out.byte(static_cast<std::uint8_t>(0x80 | (value & 0x3f)));
  if (value < 0x10000)
    return out.byte(static_cast<std::uint8_t>(0xe0 | (value >> 12))) &&
           out.byte(static_cast<std::uint8_t>(0x80 | ((value >> 6) & 0x3f))) &&
           out.byte(static_cast<std::uint8_t>(0x80 | (value & 0x3f)));
  return out.byte(static_cast<std::uint8_t>(0xf0 | (value >> 18))) &&
         out.byte(static_cast<std::uint8_t>(0x80 | ((value >> 12) & 0x3f))) &&
         out.byte(static_cast<std::uint8_t>(0x80 | ((value >> 6) & 0x3f))) &&
         out.byte(static_cast<std::uint8_t>(0x80 | (value & 0x3f)));
}
TextStatus decode(::bridge::compat::span<const std::uint8_t> input, Writer &out) noexcept {
  for (std::size_t at = 0; at < input.size();) {
    auto value = word(input, at);
    at += 2;
    if (!value) {
      for (; at < input.size(); at += 2)
        if (word(input, at))
          return TextStatus::invalid;
      return TextStatus::ok;
    }
    if (value >= 0xd800 && value <= 0xdbff) {
      if (at == input.size())
        return TextStatus::invalid;
      const auto low = word(input, at);
      if (low < 0xdc00 || low > 0xdfff)
        return TextStatus::invalid;
      at += 2;
      value = 0x10000 + ((value - 0xd800) << 10) + low - 0xdc00;
    } else if (value >= 0xdc00 && value <= 0xdfff)
      return TextStatus::invalid;
    if (value == 13) {
      if (at < input.size() && word(input, at) == 10)
        at += 2;
      value = 10;
    }
    if (!utf8(out, value))
      return TextStatus::too_large;
  }
  return TextStatus::invalid; // Missing UTF16 terminator.
}
template <class Convert>
TextResult convert(::bridge::compat::span<const std::uint8_t> input, ::bridge::compat::span<std::uint8_t> output,
                   std::size_t maximum, Convert operation) noexcept {
  if (!maximum || maximum > max_item_bytes || overlap(input, output))
    return {TextStatus::invalid};
  if (input.size() > maximum)
    return {TextStatus::too_large};
  Writer measure{nullptr, maximum};
  const auto status = operation(input, measure);
  if (status != TextStatus::ok)
    return {status};
  if (measure.size > output.size())
    return {TextStatus::capacity, measure.size};
  Writer write{output.data(), measure.size};
  (void)operation(input, write); // Input stays immutable and was fully validated.
  return {TextStatus::ok, write.size};
}
} // namespace
bool valid_clipboard_utf8(::bridge::compat::span<const std::uint8_t> input) noexcept {
  std::size_t at = 0;
  while (at < input.size()) {
    const auto value = next_utf8(input, at);
    if (!value || !*value)
      return false;
  }
  return true;
}
TextResult encode_unicode_text(::bridge::compat::span<const std::uint8_t> input, ::bridge::compat::span<std::uint8_t> output,
                               std::size_t maximum) noexcept {
  return convert(input, output, maximum, encode);
}
TextResult decode_unicode_text(::bridge::compat::span<const std::uint8_t> input, ::bridge::compat::span<std::uint8_t> output,
                               std::size_t maximum) noexcept {
  if (input.empty() || input.size() % 2)
    return {TextStatus::invalid};
  return convert(input, output, maximum, decode);
}
} // namespace bridge::clipboard
