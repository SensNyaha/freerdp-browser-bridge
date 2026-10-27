#include "image.hpp"
#include <algorithm>
#include <optional>

namespace bridge::clipboard {
namespace {
using Bytes = ::bridge::compat::span<const std::uint8_t>;
using Output = ::bridge::compat::span<std::uint8_t>;
constexpr std::uint32_t srgb = 0x73524742U, windows_srgb = 0x57696e20U;
std::uint16_t word(Bytes input, std::size_t at) noexcept {
  return static_cast<std::uint16_t>(input[at] | (std::uint16_t{input[at + 1]} << 8));
}
std::uint32_t dword(Bytes input, std::size_t at) noexcept {
  return std::uint32_t{input[at]} | (std::uint32_t{input[at + 1]} << 8) |
         (std::uint32_t{input[at + 2]} << 16) | (std::uint32_t{input[at + 3]} << 24);
}
void put(Output output, std::size_t at, std::uint32_t value) noexcept {
  for (std::size_t i = 0; i < 4; ++i)
    output[at + i] = static_cast<std::uint8_t>(value >> (i * 8));
}
bool overlap(Bytes input, Output output) noexcept {
  if (input.empty() || output.empty())
    return false;
  const auto first = reinterpret_cast<std::uintptr_t>(input.data());
  const auto second = reinterpret_cast<std::uintptr_t>(output.data());
  return first <= second ? second - first < input.size() : first - second < output.size();
}
std::optional<std::uint8_t> shift(std::uint32_t mask) noexcept {
  for (std::uint8_t at = 0; at < 32; at = static_cast<std::uint8_t>(at + 8))
    if (mask == (0xffU << at))
      return at;
  return {};
}
bool dimensions(std::uint32_t width, std::uint32_t height) noexcept {
  return width && height && width <= 0x7fffffffU && height <= 0x7fffffffU;
}
// Signed-positive dimensions are at most INT32_MAX, so this product fits uint64.
std::uint64_t rgba_size(std::uint32_t width, std::uint32_t height) noexcept {
  return std::uint64_t{width} * height * 4;
}
} // namespace

ImageInspection inspect_dib_clipboard(Bytes input, std::size_t maximum) noexcept {
  if (!maximum || maximum > max_item_bytes)
    return {};
  if (input.size() > maximum)
    return {ImageStatus::too_large};
  if (input.size() < 40)
    return {};
  const auto header = dword(input, 0);
  if (header < 40 || header > input.size())
    return {};
  if (header != 40 && header != 108 && header != dibv5_header_bytes)
    return {ImageStatus::unsupported};
  const auto width = dword(input, 4), signed_height = dword(input, 8);
  const bool bottom_up = (signed_height & 0x80000000U) == 0;
  const auto height = bottom_up ? signed_height : 0U - signed_height;
  if (!dimensions(width, height) || word(input, 12) != 1)
    return {};
  const auto count = rgba_size(width, height);
  if (count > maximum)
    return {ImageStatus::too_large};
  const auto bits = word(input, 14);
  const auto compression = dword(input, 16);
  if ((bits != 24 && bits != 32) || (compression != 0 && compression != 3) ||
      (compression == 3 && bits != 32) || dword(input, 32) || dword(input, 36))
    return {ImageStatus::unsupported};
  if (header >= 108) {
    const auto color = dword(input, 56);
    if (color != srgb && color != windows_srgb)
      return {ImageStatus::unsupported};
    if (header == dibv5_header_bytes) {
      if (dword(input, 120))
        return {};
      if (dword(input, 112) || dword(input, 116))
        return {ImageStatus::unsupported};
    }
  }
  std::size_t offset = header;
  std::array<std::uint8_t, 4> shifts{16, 8, 0, 0};
  bool alpha = false;
  if (compression == 3) {
    if (header == 40) {
      if (input.size() - header < 12)
        return {};
      offset += 12;
    }
    const auto red = dword(input, 40), green = dword(input, 44), blue = dword(input, 48);
    const auto mask_alpha = header >= 108 ? dword(input, 52) : 0;
    const auto r = shift(red), g = shift(green), b = shift(blue), a = shift(mask_alpha);
    if (!r || !g || !b || (red & green) || (red & blue) || (green & blue) ||
        (mask_alpha && (!a || (mask_alpha & (red | green | blue)))))
      return {ImageStatus::unsupported};
    alpha = mask_alpha != 0;
    shifts = {*r, *g, *b, a.value_or(0)};
  }
  const auto row = ((std::uint64_t{width} * bits + 31) / 32) * 4;
  const auto body = row * height;
  if (body > maximum || offset > maximum - body)
    return {ImageStatus::too_large};
  if (input.size() != offset + body || (dword(input, 20) && dword(input, 20) != body))
    return {};
  return {ImageStatus::ok,
          width,
          height,
          offset,
          static_cast<std::size_t>(row),
          static_cast<std::size_t>(body),
          static_cast<std::size_t>(count),
          bits,
          shifts,
          bottom_up,
          alpha};
}

ImageResult decode_dib_clipboard(Bytes input, Output output, std::size_t maximum) noexcept {
  const auto view = inspect_dib_clipboard(input, maximum);
  if (view.status != ImageStatus::ok)
    return {view.status};
  if (overlap(input, output))
    return {};
  if (output.size() < view.rgba_bytes)
    return {ImageStatus::capacity, view.rgba_bytes, view.width, view.height};
  std::size_t to = 0;
  for (std::uint32_t y = 0; y < view.height; ++y) {
    const auto row = view.bottom_up ? view.height - 1 - y : y;
    auto from = view.pixel_offset + static_cast<std::size_t>(row) * view.row_bytes;
    for (std::uint32_t x = 0; x < view.width; ++x) {
      if (view.bits == 24) {
        output[to++] = input[from + 2];
        output[to++] = input[from + 1];
        output[to++] = input[from];
        output[to++] = 0xff;
      } else {
        const auto pixel = dword(input, from);
        for (std::size_t channel = 0; channel < 3; ++channel)
          output[to++] = static_cast<std::uint8_t>(pixel >> view.shifts[channel]);
        output[to++] = view.alpha ? static_cast<std::uint8_t>(pixel >> view.shifts[3]) : 0xff;
      }
      from += view.bits / 8;
    }
  }
  return {ImageStatus::ok, view.rgba_bytes, view.width, view.height};
}

ImageResult encode_dibv5_clipboard(Bytes rgba, std::uint32_t width, std::uint32_t height,
                                   Output output, std::size_t maximum) noexcept {
  if (!maximum || maximum > max_item_bytes || !dimensions(width, height))
    return {};
  const auto count = rgba_size(width, height);
  if (count > maximum || dibv5_header_bytes > maximum - count)
    return {ImageStatus::too_large};
  if (rgba.size() != count || overlap(rgba, output))
    return {};
  const auto bytes = dibv5_header_bytes + static_cast<std::size_t>(count);
  if (output.size() < bytes)
    return {ImageStatus::capacity, bytes, width, height};
  std::fill_n(output.begin(), dibv5_header_bytes, std::uint8_t{0});
  put(output, 0, dibv5_header_bytes);
  put(output, 4, width);
  put(output, 8, 0U - height);
  output[12] = 1;
  output[14] = 32;
  put(output, 16, 3);
  put(output, 20, static_cast<std::uint32_t>(count));
  put(output, 40, 0x00ff0000U);
  put(output, 44, 0x0000ff00U);
  put(output, 48, 0x000000ffU);
  put(output, 52, 0xff000000U);
  put(output, 56, srgb);
  put(output, 108, 4); // LCS_GM_IMAGES (wingdi.h).
  for (std::size_t at = 0; at < count; at += 4) {
    output[dibv5_header_bytes + at] = rgba[at + 2];
    output[dibv5_header_bytes + at + 1] = rgba[at + 1];
    output[dibv5_header_bytes + at + 2] = rgba[at];
    output[dibv5_header_bytes + at + 3] = rgba[at + 3];
  }
  return {ImageStatus::ok, bytes, width, height};
}
} // namespace bridge::clipboard
