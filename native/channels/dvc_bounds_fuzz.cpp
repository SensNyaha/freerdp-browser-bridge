#include "../compat/span.hpp"
#include "dvc_bounds.hpp"
#include <initializer_list>
extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  using namespace bridge::channels;
  const ::bridge::compat::span<const std::uint8_t> bytes{data, size};
  for (const auto logical :
       {std::size_t{14}, std::size_t{65536}, DvcAllocationLimits::hard_message_bytes}) {
    DvcAllocationLimits limits;
    limits.message_bytes = logical;
    limits.codec_bytes = logical;
    (void)inspect_dvc_allocations(bytes, limits);
    (void)inspect_zgfx_allocations(bytes, limits);
    limits.codec_bytes = logical < 65536 ? 65536 : logical;
    (void)inspect_dvc_allocations(bytes, limits);
    (void)inspect_zgfx_allocations(bytes, limits);
  }
  return 0;
}
