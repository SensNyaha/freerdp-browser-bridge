// Explicit fake IPC peer. No FreeRDP context, desktop or remote channel is used here.
#include "connection_config.hpp"
#include "display.hpp"
#include "input.hpp"
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <mutex>
#include <optional>
#include <thread>
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
  std::mutex output_mutex, wait_mutex;
  std::condition_variable wait;
  const auto send = [&](const Packet &packet) {
    std::lock_guard lock(output_mutex);
    const auto bytes = encode(packet);
    if (std::fwrite(bytes.data(), 1, bytes.size(), stdout) != bytes.size() || std::fflush(stdout))
      throw ProtocolError();
  };
  std::optional<ConnectionConfig> config;
  DisplayUpdate display{1, 1, {1024, 768}, false, true, {3840, 2160}, 3840U * 2160U};
  std::atomic<bool> busy = false;
  std::jthread confirmation;
  try {
    for (;;) {
      std::array<std::uint8_t, header_bytes> bytes{};
      if (std::fread(bytes.data(), 1, bytes.size(), stdin) != bytes.size())
        break;
      const auto header = decode_header(bytes);
      std::vector<std::uint8_t> payload(header.length);
      if (std::fread(payload.data(), 1, payload.size(), stdin) != payload.size())
        throw ProtocolError();
      if (header.kind == Kind::hello) {
        validate_hello(payload);
        std::vector<std::uint8_t> report;
        append_be(report, 1, 2);
        append_be(report, FIXTURE_LEGACY ? 509 : 1021, 2);
        for (const auto *text :
             {"0.1.0", "fake-display", "3.32.1", "3.32.1", "fake", "x64", "framed-pipes"}) {
          const std::string value(text);
          append_be(report, value.size(), 2);
          report.insert(report.end(), value.begin(), value.end());
        }
        send({Kind::hello_ack, header.request_id, report});
      } else if (header.kind == Kind::heartbeat) {
        send({Kind::heartbeat_ack, header.request_id, {}});
      } else if (header.kind == Kind::configure) {
        config = decode_connection_config(payload);
        if constexpr (FIXTURE_LEGACY != 0) {
          if (config->dynamic_resolution)
            throw ProtocolError();
        }
        display.actual = {config->width, config->height};
        display.enabled = config->dynamic_resolution;
        if (config->host == "unnegotiated") {
          display.negotiated = false;
          display.maximum = {0, 0};
          display.max_area = 0;
        }
        send({Kind::configure_ack, header.request_id, {}});
      } else if (header.kind == Kind::secret) {
        validate_secret(payload);
        wipe(payload);
        send({Kind::secret_ack, header.request_id, {}});
      } else if (header.kind == Kind::connect && config) {
        send({Kind::connect_ack, header.request_id, {}});
        send({Kind::state, 0, {0, 3, 0, 0, 0, 0, 0, 0}});
        if constexpr (FIXTURE_LEGACY == 0)
          send({Kind::display_update, 0, encode_display_update(display)});
      } else if (header.kind == Kind::input) {
        const auto event = bridge::input::decode(payload);
        if (busy && event.type != bridge::input::Type::reset) {
          std::vector<std::uint8_t> error;
          append_be(error, 8, 4);
          send({Kind::error, header.request_id, error});
        } else {
          send({Kind::input_ack, header.request_id, {}});
        }
      } else if (header.kind == Kind::display_resize && config) {
        if constexpr (FIXTURE_LEGACY != 0) {
          throw ProtocolError();
        } else {
          const auto size = decode_display_resize(payload);
          const auto result = [&](ResizeResult value) {
            send({Kind::display_resize_result, header.request_id, encode_resize_result(value)});
          };
          if (busy) {
            result(ResizeResult::busy);
          } else if (!display.enabled || !display.negotiated) {
            result(ResizeResult::unavailable);
          } else if (size.width < 200 || size.width > 3840 || size.height < 200 ||
                     size.height > 2160 || (size.width % 2) || (size.height % 2)) {
            result(ResizeResult::invalid);
          } else if (size == display.actual) {
            result(ResizeResult::unchanged);
          } else {
            if (confirmation.joinable())
              confirmation.join();
            busy = true;
            confirmation =
                std::jthread([&, size, request = header.request_id](std::stop_token stop) {
                  std::unique_lock lock(wait_mutex);
                  std::stop_callback cancel(stop, [&] { wait.notify_all(); });
                  if (wait.wait_for(lock, std::chrono::milliseconds(2300),
                                    [&] { return stop.stop_requested(); }))
                    return;
                  if (config->host == "timeout" || config->host == "timeout-late") {
                    send({Kind::display_resize_result, request,
                          encode_resize_result(ResizeResult::timeout)});
                    if (config->host == "timeout-late") {
                      if (wait.wait_for(lock, std::chrono::milliseconds(100),
                                        [&] { return stop.stop_requested(); }))
                        return;
                      display.actual = size;
                      ++display.generation;
                      ++display.framebuffer_revision;
                      send({Kind::display_update, 0, encode_display_update(display)});
                    }
                  } else if (config->host == "false-applied") {
                    send({Kind::display_resize_result, request,
                          encode_resize_result(ResizeResult::applied)});
                  } else {
                    display.actual = size;
                    if (config->host != "bad-generation")
                      ++display.generation;
                    ++display.framebuffer_revision;
                    send({Kind::display_update, 0, encode_display_update(display)});
                    send({Kind::display_resize_result, request,
                          encode_resize_result(ResizeResult::applied)});
                    if (config->host == "applied-close")
                      send({Kind::state, 0, {0, 4, 0, 0, 0, 0, 0, 0}});
                  }
                  busy = false;
                });
          }
        }
      } else if (header.kind == Kind::shutdown) {
        confirmation.request_stop();
        if (confirmation.joinable())
          confirmation.join();
        send({Kind::shutdown_ack, header.request_id, {}});
        return 0;
      } else {
        throw ProtocolError();
      }
    }
  } catch (...) {
    confirmation.request_stop();
    return 2;
  }
  confirmation.request_stop();
  return 0;
}
