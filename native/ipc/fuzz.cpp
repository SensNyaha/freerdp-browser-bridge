#include "../compat/span.hpp"
#include "audio.hpp"
#include "audio_reset.hpp"
#include "connection_config.hpp"
#include "display.hpp"
#include "files.hpp"
#include "input.hpp"
#include "microphone.hpp"
#include "microphone_opus.hpp"
#include "opus_audio.hpp"
#include "output_queue.hpp"
#include "protocol.hpp"
#include "touch_ipc.hpp"
extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t *data, std::size_t size) {
  // Also exercise the bounded raw input grammar before framed dispatch.
  try {
    (void)bridge::ipc::microphone::opus::decode_packet(::bridge::compat::span(data, size));
  } catch (const bridge::ipc::ProtocolError &) {
  }
  try {
    using namespace bridge::ipc;
    const auto bytes = ::bridge::compat::span(data, size);
    if (size < header_bytes) {
      (void)decode_header(bytes);
    } else {
      const auto header = decode_header(bytes.first(header_bytes));
      if (size == header_bytes + header.length) {
        const auto payload = bytes.subspan(header_bytes);
        // Commands are not output-queue messages, but their bounded grammar
        // must still be fuzzed independently of queue admission.
        if (header.kind == Kind::file_command)
          (void)files::decode(payload, false);
        else if (header.kind == Kind::file_result)
          (void)files::decode(payload, true);
        // Explicit Opus profile keeps codec-specific records in the matching queue.
        OutputQueue opus_output{OutputAudioCodec::opus};
        if (header.kind == Kind::audio_opus) {
          (void)audio::opus::decode_packet(payload);
          (void)opus_output.push(header.kind, header.request_id, payload);
          return 0;
        }
        if (header.kind == Kind::audio_config && payload[1] == 1) {
          (void)audio::opus::decode_config(payload);
          (void)opus_output.push(header.kind, header.request_id, payload);
          return 0;
        }
        if (header.kind == Kind::audio_state && payload[28] == 1) {
          (void)audio::opus::decode_state(payload);
          (void)opus_output.push(header.kind, header.request_id, payload);
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
        else if (header.kind == Kind::audio_reset)
          (void)audio::decode_reset(payload);
        else if (header.kind == Kind::audio_reset_result)
          (void)audio::decode_reset_result(payload);
        else if (header.kind == Kind::microphone_pcm)
          (void)microphone::decode_pcm(payload);
        else if (header.kind == Kind::microphone_opus)
          (void)microphone::opus::decode_packet(payload);
        else if (header.kind == Kind::microphone_result)
          (void)microphone::decode_result(payload);
        else if (header.kind == Kind::microphone_state)
          (void)microphone::decode_state(payload);
        else if (header.kind == Kind::microphone_reset)
          (void)microphone::decode_reset(payload);
        else if (header.kind == Kind::microphone_reset_result)
          (void)microphone::decode_reset_result(payload);
        else if (header.kind == Kind::clipboard_command)
          (void)clipboard::decode_command(payload);
        else if (header.kind == Kind::clipboard_result)
          (void)clipboard::decode_result(payload);
        else if (header.kind == Kind::clipboard_state)
          (void)clipboard::decode_state(payload);
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
