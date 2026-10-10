#include "opus_audio.hpp"
#include "opus_encoder.hpp"
#include <bit>
#include <cmath>
#include <cstdio>
#include <numbers>
#include <vector>

// Test-only, fixed synthetic tones. No session input, files or command arguments.
int main() {
  try {
    bridge::audio::SoftwareOpusEncoder encoder;
    std::vector<std::uint8_t> source(3840);
    std::printf("{\"lookaheadFrames\":%u,\"packets\":[",
                static_cast<unsigned>(encoder.lookahead_frames()));
    for (std::size_t packet = 0; packet < 20; ++packet) {
      for (std::size_t frame = 0; frame < 960; ++frame)
        for (std::size_t channel = 0; channel < 2; ++channel) {
          const auto index = packet * 960 + frame;
          const auto value = static_cast<std::int16_t>(
              std::lround((channel == 0 ? 8000.0 : 4000.0) *
                          std::sin(2.0 * std::numbers::pi * (channel == 0 ? 440.0 : 990.0) *
                                   static_cast<double>(index) / 48000.0)));
          const auto word = std::bit_cast<std::uint16_t>(value);
          source[frame * 4 + channel * 2] = static_cast<std::uint8_t>(word);
          source[frame * 4 + channel * 2 + 1] = static_cast<std::uint8_t>(word >> 8);
        }
      const auto unit = encoder.encode({source, packet * 20000});
      bridge::ipc::audio::opus::validate_payload(unit.bytes);
      std::printf("%s[", packet == 0 ? "" : ",");
      for (std::size_t i = 0; i < unit.bytes.size(); ++i)
        std::printf("%s%u", i == 0 ? "" : ",", static_cast<unsigned>(unit.bytes[i]));
      std::printf("]");
    }
    std::printf("]}\n");
    return std::ferror(stdout) ? 1 : 0;
  } catch (...) {
    return 1;
  }
}
