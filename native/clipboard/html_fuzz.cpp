#include "html.hpp"
#include <algorithm>
#include <array>
#include <cstdlib>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  if (size > 16384)
    return 0;
  using namespace bridge::clipboard;
  const ::bridge::compat::span<const std::uint8_t> input{data, size};
  std::array<std::uint8_t, 16384> encoded{};
  encoded.fill(0x5a);
  const auto result = encode_html_clipboard(input, encoded, encoded.size());
  if (result.status == TextStatus::ok) {
    const auto view = inspect_html_clipboard(
        ::bridge::compat::span<const std::uint8_t>(encoded).first(result.bytes), encoded.size());
    if (view.status != TextStatus::ok || !view.context || view.selection ||
        view.fragment_bytes != input.size() ||
        !std::equal(input.begin(), input.end(), encoded.begin() + view.fragment_offset))
      std::abort();
    if (!std::all_of(encoded.begin() + result.bytes, encoded.end(),
                     [](auto value) { return value == 0x5a; }))
      std::abort();
  } else if (!std::all_of(encoded.begin(), encoded.end(), [](auto value) { return value == 0x5a; }))
    std::abort();
  const auto view = inspect_html_clipboard(input, encoded.size());
  if (view.status == TextStatus::ok) {
    if (view.body_offset > input.size() || view.body_bytes > input.size() - view.body_offset ||
        view.fragment_offset < view.body_offset ||
        view.fragment_offset - view.body_offset > view.body_bytes ||
        view.fragment_bytes > view.body_bytes - (view.fragment_offset - view.body_offset) ||
        (view.selection && (view.selection_offset < view.fragment_offset ||
                            view.selection_offset - view.fragment_offset > view.fragment_bytes ||
                            view.selection_bytes > view.fragment_bytes -
                                                       (view.selection_offset - view.fragment_offset))))
      std::abort();
    const auto fragment = input.subspan(view.fragment_offset, view.fragment_bytes);
    const auto wrapped = encode_html_clipboard(fragment, encoded, encoded.size());
    if (wrapped.status == TextStatus::ok) {
      const auto again = inspect_html_clipboard(
          ::bridge::compat::span<const std::uint8_t>(encoded).first(wrapped.bytes), encoded.size());
      if (again.status != TextStatus::ok || again.fragment_bytes != fragment.size() ||
          !std::equal(fragment.begin(), fragment.end(), encoded.begin() + again.fragment_offset))
        std::abort();
    }
  } else if (view.body_offset || view.body_bytes || view.fragment_offset || view.fragment_bytes ||
             view.selection_offset || view.selection_bytes || view.context || view.selection)
    std::abort();
  return 0;
}
