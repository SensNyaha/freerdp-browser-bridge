#include "device_inventory.hpp"
#include <algorithm>
#include <cstdlib>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  using namespace bridge::ipc::inventory;
  if (size > maximum_bytes) return 0;
  const bridge::compat::span<const std::uint8_t> input{data, size};
  try {
    const auto output = encode_request(decode_request(input));
    if (!std::equal(output.begin(), output.end(), input.begin(), input.end())) std::abort();
  } catch (const bridge::ipc::ProtocolError &) {
  }
  try {
    const auto output = encode_report(decode_report(input));
    if (!std::equal(output.begin(), output.end(), input.begin(), input.end())) std::abort();
  } catch (const bridge::ipc::ProtocolError &) {
  }
  return 0;
}
