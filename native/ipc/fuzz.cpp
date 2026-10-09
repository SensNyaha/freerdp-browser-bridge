#include "connection_config.hpp"
#include "display.hpp"
#include "input.hpp"
#include "protocol.hpp"
extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  try {
    using namespace bridge::ipc;
    const auto bytes = std::span(data, size);
    if (size < header_bytes) {
      (void)decode_header(bytes);
    } else {
      const auto header = decode_header(bytes.first(header_bytes));
      if (size == header_bytes + header.length) {
        const auto payload = bytes.subspan(header_bytes);
        if (header.kind == Kind::hello)
          validate_hello(payload);
        else if (header.kind == Kind::configure)
          (void)decode_connection_config(payload);
        else if (header.kind == Kind::secret)
          validate_secret(payload);
        else if (header.kind == Kind::input)
          (void)bridge::input::decode(payload);
        else if (header.kind == Kind::input_text)
          (void)bridge::input::decode_text(payload);
        else if (header.kind == Kind::display_resize)
          (void)decode_display_resize(payload);
      }
    }
  } catch (const bridge::ipc::ProtocolError &) {
  }
  return 0;
}
