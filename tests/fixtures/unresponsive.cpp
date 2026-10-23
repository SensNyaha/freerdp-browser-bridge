#include "protocol.hpp"
#include <chrono>
#include <cstdio>
#include <thread>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
int main() {
#ifdef _WIN32
  (void)_setmode(_fileno(stdin), _O_BINARY);
  (void)_setmode(_fileno(stdout), _O_BINARY);
#endif
  using namespace bridge::ipc;
  std::array<std::uint8_t, header_bytes> bytes{};
  if (std::fread(bytes.data(), 1, bytes.size(), stdin) != bytes.size())
    return 1;
  const auto header = decode_header(bytes);
  std::array<std::uint8_t, 8> hello{};
  if (std::fread(hello.data(), 1, hello.size(), stdin) != hello.size())
    return 1;
#if FIXTURE_MODE == 1
  std::this_thread::sleep_for(std::chrono::seconds(30));
#elif FIXTURE_MODE == 2
  const auto output = encode({Kind::heartbeat_ack, header.request_id, {}});
  (void)std::fwrite(output.data(), 1, output.size(), stdout);
  (void)std::fflush(stdout);
  std::this_thread::sleep_for(std::chrono::seconds(30));
#else
  std::vector<std::uint8_t> payload{0, 1, 0, 1};
  for (const auto *value : {"0.1.0", "fake", "", "3.32.1", "fake", "x64", "framed-pipes"}) {
    const std::string text(value);
    append_be(payload, text.size(), 2);
    payload.insert(payload.end(), text.begin(), text.end());
  }
  const auto output = encode({Kind::hello_ack, header.request_id, payload});
  (void)std::fwrite(output.data(), 1, output.size(), stdout);
  (void)std::fflush(stdout);
  std::this_thread::sleep_for(std::chrono::seconds(30));
#endif
  (void)header;
}
