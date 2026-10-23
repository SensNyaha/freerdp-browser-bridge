#include "../compat/span.hpp"
#include "ingress.hpp"
#include <algorithm>
#include <cstdlib>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  using namespace bridge::clipboard;
  if (size > 16384)
    return 0;
  const ::bridge::compat::span<const std::uint8_t> b{data, size};
  (void)inspect_pdu(b, false, 16384);
  (void)inspect_pdu(b, true, 16384);
  const std::size_t maximum = 128 + (size ? data[0] : 0);
  const auto inspected = inspect_pdu(b, false, maximum);
  auto normalized = b;
  if (inspected) {
    std::size_t declared = 0;
    for (unsigned i = 0; i < 4; ++i)
      declared |= std::size_t{b[4 + i]} << (8 * i);
    normalized = b.first(8 + declared);
  }
  const std::array<std::uint8_t, 8> refused{5, 0, 2, 0, 0, 0, 0, 0};
  ClipboardIngress owner(
      [&](auto complete) {
        if (!inspected)
          std::abort();
        const auto expected = inspected->quota_refused
                                  ? ::bridge::compat::span<const std::uint8_t>(refused)
                                  : normalized;
        if (!std::equal(complete.begin(), complete.end(), expected.begin(), expected.end()))
          std::abort();
        return true;
      },
      maximum);
  if (size < 8)
    return 0;
  const auto split = (std::min)(size - 1, std::size_t{1} + data[0]);
  if (owner.receive({b.first(split), size, true, false}, 1)) {
    if (owner.stats().allocated > (std::max)(maximum, max_control_bytes) + 8)
      std::abort();
    (void)owner.receive({b.subspan(split), size, false, true}, 2);
  }
  owner.close();
  if (owner.stats().allocated || owner.stats().stored || owner.stats().partial)
    std::abort();
  return 0;
}
