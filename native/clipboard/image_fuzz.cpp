#include "image.hpp"
#include <algorithm>
#include <array>
#include <cstdlib>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  if (size > 16384)
    return 0;
  using namespace bridge::clipboard;
  using Bytes = ::bridge::compat::span<const std::uint8_t>;
  const Bytes input{data, size};
  std::array<std::uint8_t, 16384> decoded, encoded, again;
  decoded.fill(0xa5);
  encoded.fill(0xa5);
  again.fill(0xa5);
  const auto untouched = [](const auto &bytes) {
    return std::all_of(bytes.begin(), bytes.end(), [](auto value) { return value == 0xa5; });
  };
  const auto view = inspect_dib_clipboard(input, decoded.size());
  const auto result = decode_dib_clipboard(input, decoded, decoded.size());
  if (view.status == ImageStatus::ok) {
    if (result.status != ImageStatus::ok || result.width != view.width ||
        result.height != view.height || result.bytes != view.rgba_bytes ||
        view.rgba_bytes > decoded.size() || view.pixel_offset > size ||
        view.pixel_bytes != size - view.pixel_offset ||
        !std::all_of(decoded.begin() + result.bytes, decoded.end(),
                     [](auto value) { return value == 0xa5; }))
      std::abort();
    const auto written = encode_dibv5_clipboard(Bytes(decoded).first(result.bytes), result.width,
                                                result.height, encoded, encoded.size());
    if (written.status == ImageStatus::ok) {
      const auto roundtrip =
          decode_dib_clipboard(Bytes(encoded).first(written.bytes), again, encoded.size());
      if (roundtrip.status != ImageStatus::ok || roundtrip.bytes != result.bytes ||
          !std::equal(decoded.begin(), decoded.begin() + result.bytes, again.begin()) ||
          !std::all_of(encoded.begin() + written.bytes, encoded.end(),
                       [](auto value) { return value == 0xa5; }))
        std::abort();
    } else if (!untouched(encoded))
      std::abort();
  } else if (result.status != view.status || result.bytes || result.width || result.height ||
             view.width || view.height || view.pixel_offset || view.row_bytes || view.pixel_bytes ||
             view.rgba_bytes || view.bits || view.bottom_up || view.alpha || !untouched(decoded))
    std::abort();
  encoded.fill(0xa5);
  again.fill(0xa5);
  const auto written = encode_dibv5_clipboard(input, static_cast<std::uint32_t>(size / 4), 1,
                                              encoded, encoded.size());
  if (written.status == ImageStatus::ok) {
    const auto roundtrip =
        decode_dib_clipboard(Bytes(encoded).first(written.bytes), again, encoded.size());
    if (roundtrip.status != ImageStatus::ok || roundtrip.bytes != size ||
        !std::equal(input.begin(), input.end(), again.begin()))
      std::abort();
  } else if (!untouched(encoded))
    std::abort();
  return 0;
}
