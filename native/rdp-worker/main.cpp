#include "../compat/span.hpp"
#include "audio_reset.hpp"
#include "build_features.hpp"
#include "clipboard.hpp"
#include "connection_config.hpp"
#include "microphone.hpp"
#include "microphone_opus.hpp"
#include "ownership.hpp"
#include "protocol.hpp"
#include "../files/service.hpp"
#include "../devices/inventory.hpp"
#include <algorithm>
#include <csignal>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#ifdef _WIN32
#include "windows_pipe.hpp"
#include <fcntl.h>
#include <io.h>
#elif defined(__linux__)
#include "linux_seqpacket.hpp"
#include "linux_stream.hpp"
#include <sys/prctl.h>
#include <unistd.h>
#endif
#ifdef BRIDGE_WITH_FREERDP
#include "connection.hpp"
#include <freerdp/client.h>
#include <freerdp/config.h>
#include <freerdp/freerdp.h>
#include <winpr/wlog.h>
#endif

namespace {
using namespace bridge::ipc;
#if !defined(_WIN32) && !defined(__linux__)
std::mutex output_mutex;
#endif
class RuntimeGuard {
  std::filesystem::path path_;
  std::unique_ptr<bridge::runtime::RuntimeLease> lease_;

public:
  RuntimeGuard() {
    const auto path = std::filesystem::current_path();
    if (bridge::runtime::runtime_identity(path.filename().native())) {
      lease_ = std::make_unique<bridge::runtime::RuntimeLease>(path);
      path_ = path;
      return;
    }
    std::ifstream marker(path / ".rdp-worker-owned", std::ios::binary);
    std::array<char, 11> bytes{};
    marker.read(bytes.data(), static_cast<std::streamsize>(bytes.size()));
    if (marker.gcount() == 10 && std::string(bytes.data(), 10) == "runtime-v1")
      path_ = path;
  }
  ~RuntimeGuard() {
    if (path_.empty())
      return;
    lease_.reset();
    std::error_code ec;
    std::filesystem::current_path(path_.parent_path(), ec);
    std::filesystem::remove(path_ / ".rdp-worker-owned", ec);
    std::filesystem::remove(path_,
                            ec); // Empty directory only; never recursively delete arbitrary cwd.
  }
  bool owned() const noexcept { return !path_.empty(); }
};
#if defined(__linux__)
volatile std::sig_atomic_t parent_lost = 0;
void parent_died(int) { parent_lost = 1; } // Signal-safe; owned read loop unwinds.
#endif
constexpr const char *target_freerdp = "3.32.1";
#ifdef _WIN32
constexpr const char *platform = "windows";
#elif defined(__linux__)
constexpr const char *platform = "linux";
#else
constexpr const char *platform = "unknown";
#endif
#if defined(_M_X64) || defined(__x86_64__)
constexpr const char *arch = "x64";
#else
constexpr const char *arch = "unknown";
#endif
const char *freerdp_version() {
#ifdef BRIDGE_WITH_FREERDP
  return freerdp_get_version_string();
#else
  return "";
#endif
}
void append_string(std::vector<std::uint8_t> &bytes, const std::string &text) {
  if (text.size() > 256)
    throw ProtocolError();
  append_be(bytes, text.size(), 2);
  bytes.insert(bytes.end(), text.begin(), text.end());
}
std::vector<std::uint8_t> build_payload(const char *transport) {
  std::vector<std::uint8_t> bytes;
  append_be(bytes, version, 2);
#ifdef BRIDGE_WITH_FREERDP
  unsigned capabilities = 1533;
#ifdef CHANNEL_DISP_CLIENT
  capabilities |= 512;
#endif
#ifdef CHANNEL_RDPEI_CLIENT
  capabilities |= 2048;
#endif
#if (defined(_WIN32) || defined(__linux__)) && defined(CHANNEL_RDPSND_CLIENT)
  capabilities |= 4096 | 8192 | 16384;
#endif
#if (defined(_WIN32) || defined(__linux__)) && defined(CHANNEL_AUDIN_CLIENT)
  capabilities |= 32768;
#endif
  append_be(bytes, capabilities, 2);
#else
  append_be(bytes, 1, 2);
#endif
  for (const auto *value : {BRIDGE_VERSION, BRIDGE_GIT_COMMIT, freerdp_version(), target_freerdp,
                            platform, arch, transport})
    append_string(bytes, value);
  unsigned extensions = 0;
#if defined(_WIN32) || defined(__linux__)
  extensions |= 1024 | 8192; // Private services; inventory does not advertise device redirection.
#endif
#ifdef BRIDGE_WITH_FREERDP
  extensions |= 32 | 64;
#if (defined(_WIN32) || defined(__linux__)) && defined(CHANNEL_RDPDR_CLIENT) && defined(CHANNEL_DRIVE_CLIENT) && defined(CHANNEL_RDPSND_CLIENT)
  extensions |= 2048 | 4096; // Managed drives and explicit trusted-host XRDP delete compatibility.
#endif
#if (defined(_WIN32) || defined(__linux__)) && defined(CHANNEL_AUDIN_CLIENT)
  extensions |= 3;
#endif
#if (defined(_WIN32) || defined(__linux__)) && defined(CHANNEL_RDPSND_CLIENT)
  extensions |= 4;
#endif
#if (defined(_WIN32) || defined(__linux__)) && defined(CHANNEL_CLIPRDR_CLIENT)
  extensions |= 8 | 16 | 256 | 512;
#endif
#endif
#ifdef _WIN32
  extensions |= 128;
#endif
  if (extensions) {
    // Fixed schema-1 extension; unknown feature bits remain refused by old peers.
    append_be(bytes, 1, 2);
    append_be(bytes, 0, 2);
    append_be(bytes, extensions, 4);
  }
  return bytes;
}
bool read_exact(::bridge::compat::span<std::uint8_t> bytes, bool allow_eof = false) {
  std::size_t used = 0;
  while (used < bytes.size()) {
    const auto count = std::fread(bytes.data() + used, 1, bytes.size() - used, stdin);
    if (count == 0) {
      if (allow_eof && used == 0 && std::feof(stdin))
        return false;
      throw ProtocolError();
    }
    used += count;
  }
  return true;
}
#if !defined(_WIN32) && !defined(__linux__)
void send_sync(const Packet &packet) {
  const std::lock_guard lock(output_mutex);
  const auto bytes = encode(packet);
  if (std::fwrite(bytes.data(), 1, bytes.size(), stdout) != bytes.size() ||
      std::fflush(stdout) != 0)
    throw ProtocolError();
}
#endif
int run(bool owned_runtime, int packet_fd = -1) {
  (void)packet_fd;
#ifdef _WIN32
  WindowsPipeOutput output(reinterpret_cast<void *>(_get_osfhandle(_fileno(stdout))));
#elif defined(__linux__)
  const bool packet_mode = packet_fd >= 0;
  LinuxStreamOutput output(
      packet_mode ? packet_fd : ::fileno(stdout), std::chrono::milliseconds(1000),
      packet_mode ? LinuxOutputTransport::seqpacket : LinuxOutputTransport::framed_stream);
  std::unique_ptr<LinuxSeqpacketEndpoint> packet_reader;
  if (packet_mode)
    packet_reader = std::make_unique<LinuxSeqpacketEndpoint>(packet_fd);
  ::bridge::compat::span<const std::uint8_t> pending;
  const auto read = [&](::bridge::compat::span<std::uint8_t> bytes, bool allow_eof = false) {
    if (!packet_reader)
      return read_exact(bytes, allow_eof);
    std::size_t used = 0;
    while (used < bytes.size()) {
      if (parent_lost)
        throw ProtocolError();
      const auto stats = output.try_stats();
      if (stats && stats->failed)
        throw ProtocolError();
      if (pending.empty()) {
        const auto result = packet_reader->read();
        if (result.state == SeqpacketReadState::idle)
          continue;
        if (result.state == SeqpacketReadState::closed) {
          if (allow_eof && used == 0)
            return false;
          throw ProtocolError();
        }
        pending = result.bytes;
      }
      const auto count = std::min(bytes.size() - used, pending.size());
      std::copy_n(pending.begin(), count, bytes.begin() + used);
      pending = pending.subspan(count);
      used += count;
    }
    return true;
  };
  const char *transport = packet_mode ? "unix-seqpacket-rws1" : "framed-pipes";
#else
  (void)packet_fd;
#endif
#if !defined(__linux__)
  const auto read = read_exact;
  const char *transport = "framed-pipes";
#endif
#if defined(_WIN32) || defined(__linux__)
  const auto send = [&output](const Packet &packet) {
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(50);
    for (;;) {
      const auto result = output.try_send(packet.kind, packet.request_id, packet.payload);
      if (result == DispatchAdmission::accepted)
        return;
      if (result != DispatchAdmission::busy || std::chrono::steady_clock::now() >= deadline)
        throw ProtocolError();
      std::this_thread::yield();
    }
  };
#else
  const auto send = send_sync;
#endif
  const auto error = [&send](std::uint64_t request, std::uint32_t code) {
    std::vector<std::uint8_t> payload;
    append_be(payload, code, 4);
    send({Kind::error, request, std::move(payload)});
  };
  // All connection producers retire before finishing/destroying output ownership.
  const auto control = [&]() {
    bridge::files::FileService files(std::filesystem::current_path(), owned_runtime);
#ifdef BRIDGE_WITH_FREERDP
    if (!WLog_SetLogLevel(WLog_GetRoot(), WLOG_OFF))
      throw std::runtime_error("FreeRDP logging initialization failed");
#if defined(_WIN32) || defined(__linux__)
    bridge::Connection connection(
        send,
        [&output](Kind kind, ::bridge::compat::span<const std::uint8_t> bytes) {
          const auto result = output.try_send(kind, 0, bytes);
          if (result == DispatchAdmission::accepted)
            return true;
          if (result == DispatchAdmission::busy || result == DispatchAdmission::full)
            return false;
          throw ProtocolError();
        },
        [&output] { return output.try_discard_audio(); },
        [&output](Kind kind, std::uint64_t id, ::bridge::compat::span<const std::uint8_t> bytes) {
          const auto result = output.try_send(kind, id, bytes);
          if (result == DispatchAdmission::accepted)
            return true;
          if (result == DispatchAdmission::busy || result == DispatchAdmission::full)
            return false;
          throw ProtocolError();
        }, &files);
#else
    bridge::Connection connection(send);
#endif
#endif
    bool ready = false;
    bool inventory_only = false, other_command_seen = false;
    std::array<std::uint8_t, header_bytes> buffer{};
    while (read(buffer, true)) {
      const auto header = decode_header(buffer); // Validate class limit before allocation.
      if (header.request_id == 0)
        throw ProtocolError();
      std::vector<std::uint8_t> payload(header.length);
      struct SecretWiper {
        std::vector<std::uint8_t> &bytes;
        bool secret;
        ~SecretWiper() {
          if (secret)
            wipe(bytes);
        }
      } wiper{payload, header.kind == Kind::secret || header.kind == Kind::input_text ||
                           header.kind == Kind::microphone_pcm ||
                           header.kind == Kind::microphone_opus ||
                           header.kind == Kind::clipboard_command || header.kind == Kind::file_command};
      (void)read(payload, false);
      if (ready) {
        const bool management = header.kind == Kind::heartbeat || header.kind == Kind::shutdown;
        if (inventory_only && !management) throw ProtocolError();
        if (header.kind == Kind::host_inventory) {
          if (other_command_seen) throw ProtocolError();
          inventory_only = true;
        } else if (!management) other_command_seen = true;
      }
      if (header.kind == Kind::hello && !ready) {
        try {
          validate_hello(payload);
        } catch (const ProtocolError &) {
          error(header.request_id, 2);
          return 2;
        }
        ready = true;
        send({Kind::hello_ack, header.request_id, build_payload(transport)});
      } else if (header.kind == Kind::heartbeat && ready) {
        send({Kind::heartbeat_ack, header.request_id, {}});
      } else if (header.kind == Kind::host_inventory && ready) {
        const auto request = bridge::ipc::inventory::decode_request(payload);
        Packet response{Kind::host_inventory_result, header.request_id, bridge::devices::discover(request)};
        SecretWiper response_wiper{response.payload, true};
        send(response);
      } else if (header.kind == Kind::file_command && ready) {
        Packet response{Kind::file_result, header.request_id, files.command(payload)};
        SecretWiper response_wiper{response.payload, true};
        send(response);
      } else if (header.kind == Kind::audio_reset && ready) {
#ifdef BRIDGE_WITH_FREERDP
        connection.enqueue_audio_reset(header.request_id, payload);
#else
        (void)audio::decode_reset(payload);
        const auto result = audio::encode_reset_result(audio::ResetResult::unavailable);
        send({Kind::audio_reset_result, header.request_id, {result.begin(), result.end()}});
#endif
      } else if (header.kind == Kind::microphone_pcm && ready) {
#ifdef BRIDGE_WITH_FREERDP
        connection.enqueue_microphone(header.request_id, payload);
#else
        (void)microphone::decode_pcm(payload);
        const auto result = microphone::encode_result(microphone::Result::unavailable);
        send({Kind::microphone_result, header.request_id, {result.begin(), result.end()}});
#endif
      } else if (header.kind == Kind::microphone_opus && ready) {
#ifdef BRIDGE_WITH_FREERDP
        connection.enqueue_microphone(header.request_id, payload, true);
#else
        (void)microphone::opus::decode_packet(payload);
        const auto result = microphone::encode_result(microphone::Result::unavailable);
        send({Kind::microphone_result, header.request_id, {result.begin(), result.end()}});
#endif
      } else if (header.kind == Kind::microphone_reset && ready) {
#ifdef BRIDGE_WITH_FREERDP
        connection.enqueue_microphone_reset(header.request_id, payload);
#else
        (void)microphone::decode_reset(payload);
        const auto result = microphone::encode_reset_result(microphone::ResetResult::unavailable);
        send({Kind::microphone_reset_result, header.request_id, {result.begin(), result.end()}});
#endif
      } else if (header.kind == Kind::clipboard_command && ready) {
#ifdef BRIDGE_WITH_FREERDP
        connection.enqueue_clipboard(header.request_id, payload);
#else
        const auto command = clipboard::decode_command(payload);
        send({Kind::clipboard_result, header.request_id,
              clipboard::encode_result({command.operation,
                                        clipboard::Status::unavailable,
                                        command.generation,
                                        command.revision,
                                        {}})});
#endif
      } else if (header.kind == Kind::shutdown && ready) {
#ifdef BRIDGE_WITH_FREERDP
        connection.stop_and_join();
#endif
        if (files.shutdown() != bridge::files::StoreStatus::ok) {
          error(header.request_id, 6);
          return 2;
        }
        send({Kind::shutdown_ack, header.request_id, {}});
        return 0;
#ifdef BRIDGE_WITH_FREERDP
      } else if (header.kind == Kind::configure && ready) {
#if defined(_WIN32) || defined(__linux__)
        const auto config = decode_connection_config(payload);
        const auto codec = config.opus_output ? OutputAudioCodec::opus : OutputAudioCodec::pcm;
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(50);
        for (;;) {
          const auto result = output.try_select_audio_codec(codec);
          if (result == DispatchAdmission::accepted)
            break;
          if (result != DispatchAdmission::busy || std::chrono::steady_clock::now() >= deadline)
            throw ProtocolError();
          std::this_thread::yield();
        }
#endif
        connection.configure(payload);
        send({Kind::configure_ack, header.request_id, {}});
      } else if (header.kind == Kind::secret && ready) {
        connection.secret(payload);
        send({Kind::secret_ack, header.request_id, {}});
      } else if (header.kind == Kind::connect && ready) {
        connection.start();
        send({Kind::connect_ack, header.request_id, {}});
      } else if (header.kind == Kind::certificate_decision && ready) {
        connection.decide(payload);
        send({Kind::certificate_decision_ack, header.request_id, {}});
      } else if ((header.kind == Kind::capture || header.kind == Kind::capture_avc) && ready) {
        if (!connection.capture(header.request_id, payload, header.kind == Kind::capture_avc))
          error(header.request_id, 5);
      } else if ((header.kind == Kind::input || header.kind == Kind::input_text) && ready) {
        const auto code =
            connection.enqueue_input(header.request_id, payload, header.kind == Kind::input_text);
        if (code != 0)
          error(header.request_id, code);
      } else if (header.kind == Kind::input_touch && ready) {
        const auto code = connection.enqueue_touch(header.request_id, payload);
        if (code != 0)
          error(header.request_id, code);
      } else if (header.kind == Kind::pipeline_stats && ready) {
        send({Kind::pipeline_stats_ack, header.request_id, connection.pipeline_stats()});
      } else if (header.kind == Kind::display_resize && ready) {
        connection.enqueue_resize(header.request_id, payload);
#endif
      } else {
        error(header.request_id, 3);
        return 2;
      }
    }
    return 0; // Parent disappeared; inherited input EOF is the portable parent-death path.
  };
  const auto result = control();
#if defined(_WIN32) || defined(__linux__)
  return output.finish() ? result : 2;
#else
  return result;
#endif
}
} // namespace
int main(int argc, char **argv) {
  bool report = argc > 1 && argc <= 3;
  for (int i = 1; i < argc; ++i)
    report =
        report && (std::string(argv[i]) == "--version" || std::string(argv[i]) == "--capabilities");
  if (std::string(freerdp_version()) != "" && std::string(freerdp_version()) != target_freerdp) {
    std::fputs("FreeRDP runtime version mismatch\n", stderr);
    return 3;
  }
  if (argc == 2 && std::string(argv[1]) == "--build-features") {
    std::cout << bridge::build_features << '\n';
    return 0;
  }
  if (report) {
    std::cout << "{\"bridgeVersion\":\"" << BRIDGE_VERSION << "\",\"gitCommit\":\""
              << BRIDGE_GIT_COMMIT << "\",\"protocolVersion\":1,\"freeRdpVersion\":";
    if (*freerdp_version())
      std::cout << '"' << freerdp_version() << '"';
    else
      std::cout << "null";
    std::cout << ",\"targetFreeRdpVersion\":\"3.32.1\",\"capabilities\":{\"lifecycle\":true,"
                 "\"rdp\":false,\"penInput\":false,"
#if defined(_WIN32) || defined(__linux__)
                 "\"hostDeviceInventory\":true,"
#endif
#if defined(BRIDGE_WITH_FREERDP) && (defined(_WIN32) || defined(__linux__)) &&                     \
    defined(CHANNEL_AUDIN_CLIENT)
                 "\"microphoneReset\":true,\"opusInput\":true,"
#else
                 "\"microphoneReset\":false,\"opusInput\":false,"
#endif
#if defined(BRIDGE_WITH_FREERDP) && (defined(_WIN32) || defined(__linux__)) &&                     \
    defined(CHANNEL_RDPSND_CLIENT)
                 "\"audioBuffer200\":true,"
#else
                 "\"audioBuffer200\":false,"
#endif
#if defined(BRIDGE_WITH_FREERDP) && (defined(_WIN32) || defined(__linux__)) &&                     \
    defined(CHANNEL_CLIPRDR_CLIENT)
                 "\"clipboardText\":true,\"clipboardRevoke\":true,\"clipboardHtml\":true,"
                 "\"clipboardImage\":true,"
#else
                 "\"clipboardText\":false,\"clipboardRevoke\":false,"
#endif
#ifdef _WIN32
                 "\"processResourceBatch\":true,"
#endif
#if defined(_WIN32) || defined(__linux__)
                 "\"fileService\":true,"
#endif
#if defined(BRIDGE_WITH_FREERDP) && (defined(_WIN32) || defined(__linux__)) && defined(CHANNEL_RDPDR_CLIENT) && defined(CHANNEL_DRIVE_CLIENT) && defined(CHANNEL_RDPSND_CLIENT)
                 "\"managedDrives\":true,"
                 "\"xrdpLegacyDelete\":true,"
#endif
                 "\"connectCore\":"
#ifdef BRIDGE_WITH_FREERDP
                 "true,\"performanceSettings\":true,\"ipSettings\":true,\"jpegCapture\":true,"
                 "\"h264Capture\":true,"
                 "\"basicInput\":true,"
                 "\"unicodeInput\":true,"
#if (defined(_WIN32) || defined(__linux__)) && defined(CHANNEL_AUDIN_CLIENT)
                 "\"pcmInput\":true,"
#else
                 "\"pcmInput\":false,"
#endif
#if (defined(_WIN32) || defined(__linux__)) && defined(CHANNEL_RDPSND_CLIENT)
                 "\"pcmOutput\":true,\"opusOutput\":true,\"audioReset\":true,"
#else
                 "\"pcmOutput\":false,\"opusOutput\":false,\"audioReset\":false,"
#endif
#ifdef CHANNEL_RDPEI_CLIENT
                 "\"touchInput\":true,"
#else
                 "\"touchInput\":false,"
#endif
                 "\"pipelineStats\":true,\"cursor\":true,\"videoQuality\":true,"
#ifdef CHANNEL_DISP_CLIENT
                 "\"displayControl\":true},"
#else
                 "\"displayControl\":false},"
#endif
#else
                 "false,\"performanceSettings\":false,\"ipSettings\":false,\"jpegCapture\":false,"
                 "\"h264Capture\":false,"
                 "\"basicInput\":false,"
                 "\"unicodeInput\":false,"
                 "\"pcmInput\":false,"
                 "\"pcmOutput\":false,\"opusOutput\":false,\"audioReset\":false,"
                 "\"touchInput\":false,"
                 "\"pipelineStats\":false,\"cursor\":false,\"videoQuality\":false,"
                 "\"displayControl\":false},"
#endif
              << "\"os\":\"" << platform << "\",\"arch\":\"" << arch
              << "\",\"transport\":\"framed-pipes\"}\n";
    return 0;
  }
  int packet_fd = -1;
#ifdef __linux__
  if (argc == 2 && std::string(argv[1]) == "--ipc-seqpacket-fd=3")
    packet_fd = 3;
#endif
  if (argc != 1 && packet_fd < 0) {
    std::fputs("Unsupported worker arguments\n", stderr);
    return 2;
  }
#ifdef _WIN32
  if (_setmode(_fileno(stdin), _O_BINARY) == -1 || _setmode(_fileno(stdout), _O_BINARY) == -1)
    return 3;
#elif defined(__linux__)
  struct sigaction action{};
  action.sa_handler = parent_died;
  sigemptyset(&action.sa_mask);
  if (sigaction(SIGTERM, &action, nullptr) != 0)
    return 3;
  const auto parent = getppid();
  if (parent == 1 || prctl(PR_SET_PDEATHSIG, SIGTERM) != 0 || getppid() != parent)
    return 3;
  std::signal(SIGPIPE, SIG_IGN);
#endif
  try {
    const RuntimeGuard runtime;
    return run(runtime.owned(), packet_fd);
  } catch (const std::exception &) {
    std::fputs("Worker IPC failure\n", stderr);
    return 2;
  }
}
