#include "clipboard.hpp"
#include <algorithm>
#include <cstdlib>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  if (size > 16384)
    return 0;
  using namespace bridge::ipc::clipboard;
  const std::span<const std::uint8_t> input{data, size};
  const auto equal = [&](const auto &encoded) {
    if (!std::equal(encoded.begin(), encoded.end(), input.begin(), input.end()))
      std::abort();
  };
  try {
    equal(encode_state(decode_state(input)));
  } catch (const bridge::ipc::ProtocolError &) {
  }
  try {
    equal(encode_command(decode_command(input)));
  } catch (const bridge::ipc::ProtocolError &) {
  }
  try {
    equal(encode_result(decode_result(input)));
  } catch (const bridge::ipc::ProtocolError &) {
  }
  return 0;
}
