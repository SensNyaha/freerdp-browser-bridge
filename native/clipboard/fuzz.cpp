#include "text.hpp"
#include <algorithm>
#include <array>
#include <cstdlib>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  if (size > 16384)
    return 0;
  using namespace bridge::clipboard;
  std::array<std::uint8_t, 32768> encoded, decoded, repeated;
  encoded.fill(0x5a);
  decoded.fill(0x5a);
  const std::span<const std::uint8_t> input{data, size};
  const auto a = encode_unicode_text(input, encoded, 16384);
  if (a.status != TextStatus::ok &&
      !std::all_of(encoded.begin(), encoded.end(), [](auto value) { return value == 0x5a; }))
    std::abort();
  if (a.status == TextStatus::ok) {
    const auto b = decode_unicode_text(std::span(encoded).first(a.bytes), decoded, 16384);
    if (b.status != TextStatus::ok)
      std::abort();
    const auto c = encode_unicode_text(std::span(decoded).first(b.bytes), repeated, 16384);
    if (c.status != TextStatus::ok || c.bytes != a.bytes ||
        !std::equal(encoded.begin(), encoded.begin() + a.bytes, repeated.begin()))
      std::abort();
  }
  decoded.fill(0x5a);
  const auto b = decode_unicode_text(input, decoded, 16384);
  if (b.status != TextStatus::ok &&
      !std::all_of(decoded.begin(), decoded.end(), [](auto value) { return value == 0x5a; }))
    std::abort();
  return 0;
}
