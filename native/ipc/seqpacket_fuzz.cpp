#include "../compat/span.hpp"
#include "seqpacket.hpp"
#include <cstddef>
#include <cstdint>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  const ::bridge::compat::span<const std::uint8_t> bytes(data, size);
  bridge::ipc::SeqpacketInspector whole;
  (void)whole.inspect(bytes);
  // Size-prefixed chunk sequences exercise retained partial-record state.
  bridge::ipc::SeqpacketInspector sequence;
  std::size_t offset = 0;
  for (unsigned count = 0; count < 32 && size - offset >= 2; ++count) {
    const auto length = bridge::ipc::read_be(bytes.subspan(offset, 2));
    offset += 2;
    if (length > size - offset)
      break;
    (void)sequence.inspect(bytes.subspan(offset, static_cast<std::size_t>(length)));
    offset += static_cast<std::size_t>(length);
  }
  return 0;
}
