#include "opus_capture.hpp"
#include <array>
#include <cstdio>
#include <stdexcept>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

// Test-only bounded stdin/stdout codec probe. No RDP, device, files or arguments.
int main() {
  try {
#ifdef _WIN32
    if (_setmode(_fileno(stdin), _O_BINARY) == -1 || _setmode(_fileno(stdout), _O_BINARY) == -1)
      return 1;
#endif
    bridge::audio::OpusCaptureDecoder decoder(1);
    std::array<std::uint8_t, bridge::ipc::microphone::opus::max_packet_bytes> storage{};
    for (std::size_t index = 0; index <= 16; ++index) {
      std::array<std::uint8_t, 2> header{};
      if (std::fread(header.data(), 1, 2, stdin) != 2)
        return 1;
      const auto size = static_cast<std::size_t>(bridge::ipc::read_be(header));
      if (!size)
        return std::getc(stdin) == EOF && !std::ferror(stdin) && !std::ferror(stdout) ? 0 : 1;
      if (index == 16 || size < 26 || size > storage.size() ||
          std::fread(storage.data(), 1, size, stdin) != size)
        return 1;
      const auto packet =
          bridge::ipc::microphone::opus::decode_packet(std::span(storage).first(size));
      const auto output = decoder.decode(packet);
      storage.fill(0);
      if (!output) {
        header.fill(0);
        if (std::fwrite(header.data(), 1, 2, stdout) != 2)
          return 1;
      } else {
        auto pcm = bridge::ipc::microphone::encode_pcm(*output);
        header[0] = static_cast<std::uint8_t>(pcm.size() >> 8);
        header[1] = static_cast<std::uint8_t>(pcm.size());
        if (std::fwrite(header.data(), 1, 2, stdout) != 2 ||
            std::fwrite(pcm.data(), 1, pcm.size(), stdout) != pcm.size())
          return 1;
        pcm.fill(0);
      }
    }
    return 1;
  } catch (...) {
    return 1;
  }
}
