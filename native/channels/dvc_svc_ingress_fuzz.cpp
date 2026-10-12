#include "dvc_svc_ingress.hpp"
extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  using namespace bridge::channels;
  DvcAllocationLimits limits;
  limits.message_bytes = limits.codec_bytes = limits.encoded_bytes = 65536;
  limits.segments = 64;
  DvcSvcIngress ingress([](auto) { return true; }, limits);
  std::span<const std::uint8_t> bytes{data, size};
  std::size_t position = 0;
  std::uint64_t now = 0;
  for (unsigned record = 0; record < 16 && size - position >= 9; ++record) {
    const auto flags = bytes[position++];
    std::uint32_t total = 0;
    for (unsigned index = 0; index < 4; ++index)
      total |= static_cast<std::uint32_t>(bytes[position++]) << (index * 8);
    const auto delta = static_cast<std::uint64_t>(bytes[position]) |
                       (static_cast<std::uint64_t>(bytes[position + 1]) << 8);
    position += 2;
    const auto claimed = static_cast<std::size_t>(bytes[position]) |
                         (static_cast<std::size_t>(bytes[position + 1]) << 8);
    position += 2;
    const auto count = claimed > size - position ? size - position : claimed;
    now += delta;
    (void)ingress.receive(
        {bytes.subspan(position, count), total, (flags & 1) != 0, (flags & 2) != 0}, now);
    position += count;
  }
  (void)ingress.poll(now + 2000);
  ingress.close();
  return 0;
}
