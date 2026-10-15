#include "ingress.hpp"
#include <algorithm>
#include <cstdlib>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  using namespace bridge::clipboard;
  if (size > 16384)
    return 0;
  const std::span<const std::uint8_t> b{data, size};
  (void)inspect_pdu(b, false, 16384);
  (void)inspect_pdu(b, true, 16384);
  ClipboardIngress owner(
      [&](auto complete) {
        if (!std::equal(complete.begin(), complete.end(), b.begin(), b.end()))
          std::abort();
        return true;
      },
      16384);
  if (size < 8)
    return 0;
  const auto split = (std::min)(size - 1, std::size_t{1} + data[0]);
  if (owner.receive({b.first(split), size, true, false}, 1))
    (void)owner.receive({b.subspan(split), size, false, true}, 2);
  owner.close();
  if (owner.stats().allocated || owner.stats().stored || owner.stats().partial)
    std::abort();
  return 0;
}
