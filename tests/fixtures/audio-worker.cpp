// Fake private IPC peer. No FreeRDP, remote transport or audible audio.
#include "audio.hpp"
#include "connection_config.hpp"
#include "opus_audio.hpp"
#include <cstdio>
#include <optional>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
using namespace bridge::ipc;
#ifdef FIXTURE_AUDIO_OPUS
constexpr bool opus_profile = true;
#else
constexpr bool opus_profile = false;
#endif
int main() {
#ifdef _WIN32
  if (_setmode(_fileno(stdin), _O_BINARY) == -1 || _setmode(_fileno(stdout), _O_BINARY) == -1)
    return 2;
#endif
  const auto send = [](const Packet &p) {
    const auto bytes = encode(p);
    if (std::fwrite(bytes.data(), 1, bytes.size(), stdout) != bytes.size() || std::fflush(stdout))
      throw ProtocolError();
  };
  std::optional<ConnectionConfig> config;
  const auto audio_record = [&](Kind kind, std::span<const std::uint8_t> body) {
    send({kind, 0, {body.begin(), body.end()}});
  };
  audio::State status{true, audio::Availability::ready, 1, 1, 100000};
  const auto state = [&] {
    audio_record(Kind::audio_state,
                 opus_profile ? audio::opus::encode_state(status) : audio::encode_state(status));
  };
  const auto samples = [&](std::uint64_t pts, bool discontinuity) {
    if constexpr (opus_profile) {
      if (config->host != "pcm-packet") {
        constexpr std::array<std::uint8_t, 3> encoded{0xfc, 0xff, 0xfe};
        auto packet = audio::opus::encode_packet({1, pts, 960, 0, discontinuity, encoded});
        if (config->host == "malformed")
          packet.storage[24] = 0xf8;
        audio_record(Kind::audio_opus, packet.bytes());
        return;
      }
    }
    std::vector<std::uint8_t> pcm(audio::pcm_bytes, 0);
    audio_record(Kind::audio_pcm, audio::encode_packet({1, pts, 960, 0, discontinuity, pcm}));
  };
  try {
    for (;;) {
      std::array<std::uint8_t, header_bytes> header_bytes_buffer{};
      if (std::fread(header_bytes_buffer.data(), 1, header_bytes_buffer.size(), stdin) !=
          header_bytes_buffer.size())
        return 0;
      const auto header = decode_header(header_bytes_buffer);
      std::vector<std::uint8_t> bytes(header.length);
      if (std::fread(bytes.data(), 1, bytes.size(), stdin) != bytes.size())
        throw ProtocolError();
      if (header.kind == Kind::hello) {
        validate_hello(bytes);
        std::vector<std::uint8_t> report;
        append_be(report, 1, 2);
#ifdef FIXTURE_AUDIO_LEGACY
        append_be(report, 5, 2);
#elif defined(FIXTURE_AUDIO_OPUS)
        append_be(report, 8197, 2);
#else
        append_be(report, 4101, 2);
#endif
        for (const auto *text :
             {"0.1.0", "fake-audio", "3.32.1", "3.32.1", "fake", "x64", "framed-pipes"}) {
          const std::string value(text);
          append_be(report, value.size(), 2);
          report.insert(report.end(), value.begin(), value.end());
        }
        send({Kind::hello_ack, header.request_id, report});
      } else if (header.kind == Kind::configure) {
        config = decode_connection_config(bytes);
        send({Kind::configure_ack, header.request_id, {}});
      } else if (header.kind == Kind::secret) {
        validate_secret(bytes);
        wipe(bytes);
        send({Kind::secret_ack, header.request_id, {}});
      } else if (header.kind == Kind::connect) {
        if (!config)
          throw ProtocolError();
        send({Kind::connect_ack, header.request_id, {}});
        if (config->host == "early")
          state();
        send({Kind::state, 0, {0, 3, 0, 0, 0, 0, 0, 0}});
        if ((opus_profile ? config->opus_output : config->pcm_output) ||
            config->host == "unsolicited") {
          if (config->host != "no-status")
            state();
          auto descriptor = audio::encode_config({1});
          if constexpr (opus_profile) {
            if (config->host != "pcm-config")
              descriptor = audio::opus::encode_config({1, 312});
          }
          audio_record(Kind::audio_config, descriptor);
          samples(0, true);
          if (config->host == "replay")
            state();
          if (config->host == "clock")
            samples(20001, false);
          if (config->host == "close") {
            ++status.revision;
            status.epoch = 2;
            status.availability = audio::Availability::closed;
            state();
          }
        }
      } else if (header.kind == Kind::heartbeat) {
        send({Kind::heartbeat_ack, header.request_id, {}});
      } else if (header.kind == Kind::shutdown) {
        if (config && (opus_profile ? config->opus_output : config->pcm_output)) {
          ++status.revision;
          status.epoch = 2;
          status.availability = audio::Availability::closed;
          state();
        }
        send({Kind::shutdown_ack, header.request_id, {}});
        return 0;
      } else
        throw ProtocolError();
    }
  } catch (...) {
    return 2;
  }
}
