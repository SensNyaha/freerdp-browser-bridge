#include "audio.hpp"
#include "connection_config.hpp"
#include "display.hpp"
#include "input.hpp"
#include "opus_audio.hpp"
#include "output_queue.hpp"
#include "protocol.hpp"
#include "touch_ipc.hpp"
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
        // Opus payload preparation has no output-lane activation. Exercise its
        // parsers before the current PCM-only queue can refuse these records.
        if (header.kind == Kind::audio_opus) {
          (void)audio::opus::decode_packet(payload);
          return 0;
        }
        if (header.kind == Kind::audio_config && payload[1] == 1) {
          (void)audio::opus::decode_config(payload);
          return 0;
        }
        if (header.kind == Kind::audio_state && payload[28] == 1) {
          (void)audio::opus::decode_state(payload);
          return 0;
        }
        OutputQueue output;
        (void)output.push(header.kind, header.request_id, payload);
        (void)output.take();
        if (header.kind == Kind::hello)
          validate_hello(payload);
        else if (header.kind == Kind::configure)
          (void)decode_connection_config(payload);
        else if (header.kind == Kind::secret)
          validate_secret(payload);
        else if (header.kind == Kind::input)
          (void)bridge::input::decode(payload);
        else if (header.kind == Kind::audio_config)
          (void)audio::decode_config(payload);
        else if (header.kind == Kind::audio_pcm)
          (void)audio::decode_packet(payload);
        else if (header.kind == Kind::audio_state)
          (void)audio::decode_state(payload);
        else if (header.kind == Kind::input_text)
          (void)bridge::input::decode_text(payload);
        else if (header.kind == Kind::input_touch) {
          if (payload.size() == 16)
            (void)bridge::touch::decode_ipc(payload);
          else
            (void)bridge::touch::decode_request(payload);
        } else if (header.kind == Kind::display_resize)
          (void)decode_display_resize(payload);
      }
    }
  } catch (const bridge::ipc::ProtocolError &) {
  }
  return 0;
}
