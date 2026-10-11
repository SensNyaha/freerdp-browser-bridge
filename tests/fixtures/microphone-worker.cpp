// Bounded fake IPC peer. No FreeRDP, device capture or remote microphone.
#include "connection_config.hpp"
#include "microphone.hpp"
#include <cstdio>
#include <optional>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
using namespace bridge::ipc;
int main() {
#ifdef _WIN32
  if (_setmode(_fileno(stdin), _O_BINARY) == -1 || _setmode(_fileno(stdout), _O_BINARY) == -1)
    return 2;
#endif
  const auto send = [](const Packet &packet) {
    const auto bytes = encode(packet);
    if (std::fwrite(bytes.data(), 1, bytes.size(), stdout) != bytes.size() || std::fflush(stdout))
      throw ProtocolError();
  };
  std::optional<ConnectionConfig> config;
  std::optional<std::uint64_t> pending;
  microphone::State status{true, audio::Availability::ready, 1, 1, 1000};
  const auto state = [&] {
    auto bytes = microphone::encode_state(status);
    if (config->host == "malformed")
      bytes[29] = 1;
    send({Kind::microphone_state, 0, {bytes.begin(), bytes.end()}});
  };
  const auto result = [&](std::uint64_t id, microphone::Result code) {
    auto bytes = microphone::encode_result(code);
    if (config->host == "bad-result")
      bytes[1] = 5;
    send({Kind::microphone_result, id, {bytes.begin(), bytes.end()}});
  };
  try {
    for (;;) {
      std::array<std::uint8_t, header_bytes> header_storage{};
      if (std::fread(header_storage.data(), 1, header_storage.size(), stdin) !=
          header_storage.size())
        return 0;
      const auto header = decode_header(header_storage);
      if (header.request_id == 0)
        throw ProtocolError();
      std::vector<std::uint8_t> bytes(header.length);
      if (std::fread(bytes.data(), 1, bytes.size(), stdin) != bytes.size())
        throw ProtocolError();
      if (header.kind == Kind::hello) {
        validate_hello(bytes);
        std::vector<std::uint8_t> report;
        append_be(report, 1, 2);
        append_be(report, 32773, 2);
        for (const auto *text :
             {"0.1.0", "fake-microphone", "3.32.1", "3.32.1", "fake", "x64", "framed-pipes"}) {
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
        if ((config->pcm_input || config->host == "unsolicited") && config->host != "no-status") {
          if (config->host == "waiting") {
            status.epoch = 0;
            status.availability = audio::Availability::waiting;
          }
          if (config->host == "disabled") {
            status.enabled = false;
            status.epoch = 0;
            status.availability = audio::Availability::unavailable;
          }
          state();
          if (config->host == "replay")
            state();
          if (config->host == "clock") {
            ++status.revision;
            --status.timestamp_us;
            state();
          }
          if (config->host == "disconnected") {
            send({Kind::state, 0, {0, 4, 0, 0, 0, 0, 0, 0}});
            ++status.revision;
            state();
          }
          if (config->host == "closed") {
            ++status.revision;
            status.availability = audio::Availability::closed;
            state();
          }
        }
      } else if (header.kind == Kind::microphone_pcm) {
        if (!config || pending)
          throw ProtocolError();
        const auto pcm = microphone::decode_pcm(bytes);
        const auto code =
            pcm.epoch == status.epoch ? microphone::Result::accepted : microphone::Result::stale;
        wipe(bytes);
        if (config->host == "hold") {
          pending = header.request_id;
        } else if (config->host == "stale") {
          result(header.request_id, microphone::Result::stale);
          ++status.epoch;
          ++status.revision;
          ++status.timestamp_us;
          state();
        } else {
          result(header.request_id, code);
        }
      } else if (header.kind == Kind::heartbeat) {
        send({Kind::heartbeat_ack, header.request_id, {}});
        if (pending) {
          result(*pending, microphone::Result::accepted);
          pending.reset();
        }
      } else if (header.kind == Kind::shutdown) {
        if (pending) {
          result(*pending, microphone::Result::unavailable);
          pending.reset();
        }
        if (config && config->pcm_input && status.enabled) {
          ++status.revision;
          ++status.timestamp_us;
          status.availability = audio::Availability::closed;
          state();
        }
        send({Kind::shutdown_ack, header.request_id, {}});
        return 0;
      } else {
        throw ProtocolError();
      }
    }
  } catch (...) {
    return 2;
  }
}
