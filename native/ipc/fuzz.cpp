#include "protocol.hpp"
extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  try {
    using namespace bridge::ipc;
    const auto bytes = std::span(data, size);
    if (size < header_bytes) {
      (void)decode_header(bytes);
    } else {
      const auto header = decode_header(bytes.first(header_bytes));
      if (size == header_bytes + header.length && header.kind == Kind::hello)
        validate_hello(bytes.subspan(header_bytes));
    }
  } catch (const bridge::ipc::ProtocolError &) {
  }
  return 0;
}
