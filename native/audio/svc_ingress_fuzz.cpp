#include "../compat/span.hpp"
#include "svc_ingress.hpp"
extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  using namespace bridge::audio;
  const ::bridge::compat::span<const std::uint8_t> bytes{data, size};
  AudioSvcIngress whole([](auto) { return true; });
  (void)whole.receive({bytes, size, true, true}, 1);
  AudioSvcIngress split([](auto) { return true; });
  const auto pivot = size / 2;
  (void)split.receive({bytes.first(pivot), size, true, false}, 1);
  (void)split.receive({bytes.subspan(pivot), size, false, true}, 2);
  (void)split.poll(2001);
  return 0;
}
