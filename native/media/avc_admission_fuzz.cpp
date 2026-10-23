#include "../compat/span.hpp"
#include "avc_admission.hpp"
extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  using namespace bridge::media;
  const ::bridge::compat::span<const std::uint8_t> bytes{data, size};
  (void)admit_avc_decode(bytes);
  AvcDecodeLimits limits;
  limits.width = 64;
  limits.height = 32;
  limits.nals = 4;
  (void)admit_avc_decode(bytes, limits);
  return 0;
}
