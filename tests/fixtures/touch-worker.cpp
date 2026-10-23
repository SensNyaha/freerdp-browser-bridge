// Fake private IPC peer only: no FreeRDP context or remote transport.
#include "connection_config.hpp"
#include "input.hpp"
#include "touch_ipc.hpp"
#include <cstdio>
#include <optional>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
using namespace bridge::ipc;
int main() {
#ifdef _WIN32
  (void)_setmode(_fileno(stdin), _O_BINARY);
  (void)_setmode(_fileno(stdout), _O_BINARY);
#endif
  const auto send = [](const Packet &p) {
    const auto bytes = encode(p);
    if (std::fwrite(bytes.data(), 1, bytes.size(), stdout) != bytes.size() ||
        std::fflush(stdout) != 0)
      throw ProtocolError();
  };
  std::optional<ConnectionConfig> config;
  bridge::touch::State contacts;
  bridge::touch::Update update{1, 1, 1920, 1080, 10, true, bridge::touch::Availability::ready};
  const auto failure = [&](std::uint64_t id, unsigned code) {
    std::vector<std::uint8_t> bytes;
    append_be(bytes, code, 4);
    send({Kind::error, id, bytes});
  };
  try {
    while (true) {
      std::array<std::uint8_t, 24> bytes{};
      if (std::fread(bytes.data(), 1, bytes.size(), stdin) != bytes.size())
        return 0;
      const auto header = decode_header(bytes);
      std::vector<std::uint8_t> p(header.length);
      if (std::fread(p.data(), 1, p.size(), stdin) != p.size())
        throw ProtocolError();
      if (header.kind == Kind::hello) {
        validate_hello(p);
        std::vector<std::uint8_t> report;
        append_be(report, 1, 2);
        append_be(report, 4093, 2);
        for (const auto *text :
             {"0.1.0", "fake-touch", "3.32.1", "3.32.1", "fake", "x64", "framed-pipes"}) {
          const std::string value(text);
          append_be(report, value.size(), 2);
          report.insert(report.end(), value.begin(), value.end());
        }
        send({Kind::hello_ack, header.request_id, report});
      } else if (header.kind == Kind::configure) {
        config = decode_connection_config(p);
        update.enabled = config->touch;
        update.width = config->width;
        update.height = config->height;
        if (!config->touch || config->host == "unavailable") {
          update.availability = bridge::touch::Availability::unavailable;
          update.contacts = 0;
        }
        send({Kind::configure_ack, header.request_id, {}});
      } else if (header.kind == Kind::secret) {
        validate_secret(p);
        wipe(p);
        send({Kind::secret_ack, header.request_id, {}});
      } else if (header.kind == Kind::connect && config) {
        send({Kind::connect_ack, header.request_id, {}});
        send({Kind::state, 0, {0, 3, 0, 0, 0, 0, 0, 0}});
        send({Kind::touch_update, 0, bridge::touch::encode_update(update)});
      } else if (header.kind == Kind::input_touch && config) {
        const auto request = bridge::touch::decode_request(p);
        if (!update.enabled || update.availability != bridge::touch::Availability::ready) {
          failure(header.request_id, 10);
          continue;
        }
        if (request.generation != update.generation) {
          failure(header.request_id, 8);
          continue;
        }
        const auto result = contacts.apply(
            request.event, [](const auto &) { return true; }, update.width, update.height);
        if (result != bridge::touch::Result::accepted) {
          failure(header.request_id, result == bridge::touch::Result::full ? 6 : 11);
          continue;
        }
        if (config->host == "suspend") {
          ++update.revision;
          update.availability = bridge::touch::Availability::suspended;
          update.contacts = 0;
          send({Kind::touch_update, 0, bridge::touch::encode_update(update)});
        }
        send({Kind::input_ack, header.request_id, {}});
      } else if (header.kind == Kind::input) {
        const auto event = bridge::input::decode(p);
        if (event.type == bridge::input::Type::reset) {
          (void)contacts.release([](const auto &) { return true; });
        }
        send({Kind::input_ack, header.request_id, {}});
      } else if (header.kind == Kind::heartbeat)
        send({Kind::heartbeat_ack, header.request_id, {}});
      else if (header.kind == Kind::shutdown) {
        send({Kind::shutdown_ack, header.request_id, {}});
        return 0;
      } else
        throw ProtocolError();
    }
  } catch (...) {
    return 2;
  }
}
