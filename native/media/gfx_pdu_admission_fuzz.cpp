#include "../compat/span.hpp"
#include "gfx_pdu_admission.hpp"
extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  using namespace bridge::media;
  const ::bridge::compat::span<const std::uint8_t> bytes{data, size};
  (void)admit_gfx_pdus(bytes);
  GfxPduLimits limits;
  limits.bytes = 65536;
  limits.pdus = 4;
  limits.regions = 2;
  (void)admit_gfx_pdus(bytes, limits);
  return 0;
}
