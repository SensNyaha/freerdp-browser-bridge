#include "build_features.hpp"
#include "connection_config.hpp"
#include "protocol.hpp"
#include <csignal>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#elif defined(__linux__)
#include <sys/prctl.h>
#include <unistd.h>
#endif
#ifdef BRIDGE_WITH_FREERDP
#include "connection.hpp"
#include <freerdp/client.h>
#include <freerdp/freerdp.h>
#include <winpr/wlog.h>
#endif

namespace {
using namespace bridge::ipc;
std::mutex output_mutex;
class RuntimeGuard {
  std::filesystem::path path_;

public:
  RuntimeGuard() {
    const auto path = std::filesystem::current_path();
    std::ifstream marker(path / ".rdp-worker-owned", std::ios::binary);
    std::array<char, 11> bytes{};
    marker.read(bytes.data(), static_cast<std::streamsize>(bytes.size()));
    if (marker.gcount() == 10 && std::string(bytes.data(), 10) == "runtime-v1")
      path_ = path;
  }
  ~RuntimeGuard() {
    if (path_.empty())
      return;
    std::error_code ec;
    std::filesystem::current_path(path_.parent_path(), ec);
    std::filesystem::remove(path_ / ".rdp-worker-owned", ec);
    std::filesystem::remove(path_,
                            ec); // Empty directory only; never recursively delete arbitrary cwd.
  }
};
#if defined(__linux__)
void parent_died(int) {} // Interrupt blocking stdio; run() unwinds and RuntimeGuard cleans up.
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
std::vector<std::uint8_t> build_payload() {
  std::vector<std::uint8_t> bytes;
  append_be(bytes, version, 2);
#ifdef BRIDGE_WITH_FREERDP
  append_be(bytes, 13, 2); // Lifecycle, connect core and JPEG capture; usable desktop still false.
#else
  append_be(bytes, 1, 2);
#endif
  for (const auto *value : {BRIDGE_VERSION, BRIDGE_GIT_COMMIT, freerdp_version(), target_freerdp,
                            platform, arch, "framed-pipes"})
    append_string(bytes, value);
  return bytes;
}
bool read_exact(std::span<std::uint8_t> bytes, bool allow_eof = false) {
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
void send(const Packet &packet) {
  const std::lock_guard lock(output_mutex);
  const auto bytes = encode(packet);
  if (std::fwrite(bytes.data(), 1, bytes.size(), stdout) != bytes.size() ||
      std::fflush(stdout) != 0)
    throw ProtocolError();
}
void error(std::uint64_t request, std::uint32_t code) {
  std::vector<std::uint8_t> payload;
  append_be(payload, code, 4);
  send({Kind::error, request, std::move(payload)});
}
int run() {
#ifdef BRIDGE_WITH_FREERDP
  if (!WLog_SetLogLevel(WLog_GetRoot(), WLOG_OFF))
    throw std::runtime_error("FreeRDP logging initialization failed");
  bridge::Connection connection(send);
#endif
  bool ready = false;
  std::array<std::uint8_t, header_bytes> buffer{};
  while (read_exact(buffer, true)) {
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
    } wiper{payload, header.kind == Kind::secret};
    (void)read_exact(payload);
    if (header.kind == Kind::hello && !ready) {
      try {
        validate_hello(payload);
      } catch (const ProtocolError &) {
        error(header.request_id, 2);
        return 2;
      }
      ready = true;
      send({Kind::hello_ack, header.request_id, build_payload()});
    } else if (header.kind == Kind::heartbeat && ready) {
      send({Kind::heartbeat_ack, header.request_id, {}});
    } else if (header.kind == Kind::shutdown && ready) {
#ifdef BRIDGE_WITH_FREERDP
      connection.stop();
#endif
      send({Kind::shutdown_ack, header.request_id, {}});
      return 0;
#ifdef BRIDGE_WITH_FREERDP
    } else if (header.kind == Kind::configure && ready) {
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
    } else if (header.kind == Kind::capture && ready) {
      if (!connection.capture(header.request_id, payload))
        error(header.request_id, 5);
#endif
    } else {
      error(header.request_id, 3);
      return 2;
    }
  }
  return 0; // Parent disappeared; inherited input EOF is the portable parent-death path.
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
                 "\"rdp\":false,\"connectCore\":"
#ifdef BRIDGE_WITH_FREERDP
                 "true,\"jpegCapture\":true},"
#else
                 "false,\"jpegCapture\":false},"
#endif
              << "\"os\":\"" << platform << "\",\"arch\":\"" << arch
              << "\",\"transport\":\"framed-pipes\"}\n";
    return 0;
  }
  if (argc != 1) {
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
    return run();
  } catch (const std::exception &) {
    std::fputs("Worker IPC failure\n", stderr);
    return 2;
  }
}
