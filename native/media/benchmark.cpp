#include "video_encoder.hpp"
#include <algorithm>
#include <array>
#include <chrono>
#include <iostream>
#include <numeric>

int main() {
  using Clock = std::chrono::steady_clock;
  constexpr int width = 1920, height = 1080, frames = 40;
  std::vector<std::uint8_t> pixels(width * height * 4);
  for (const int threads : {1, 2, 4}) {
    bridge::media::EncoderOptions options;
    options.threads = threads;
    bridge::media::SoftwareH264Encoder encoder(options);
    std::array<std::vector<std::uint64_t>, 5> samples;
    std::size_t bytes = 0;
    for (int frame = 0; frame < frames; ++frame) {
      // Deterministic dense desktop, scrolling edges and repeated complete scene replacements.
      for (int y = 0; y < height; ++y)
        for (int x = 0; x < width; ++x) {
          const bool edge = ((x + frame * 12) % 120 < 3) || y % 40 < 2;
          const bool window = x > frame * 24 && x < frame * 24 + 600 && y > 240 && y < 720;
          const auto shade = static_cast<std::uint8_t>(
              edge ? 20 : (window ? 100 : ((frame / 10 % 2) != 0 ? 210 : 240)));
          const auto offset = static_cast<std::size_t>((y * width + x) * 4);
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = shade;
          pixels[offset + 3] = 255;
        }
      const auto start = Clock::now();
      const auto unit = encoder.encode(
          {pixels, width, height, width * 4, 1000000 + static_cast<std::uint64_t>(frame) * 33333},
          false);
      const auto total = static_cast<std::uint64_t>(
          std::chrono::duration_cast<std::chrono::microseconds>(Clock::now() - start).count());
      bytes += unit.bytes.size();
      const auto timing = encoder.timings();
      const std::array<std::uint64_t, 5> values{total, timing.configure_us, timing.convert_us,
                                                timing.compress_us, timing.packetize_us};
      for (std::size_t i = 0; i < values.size(); ++i)
        samples[i].push_back(values[i]);
    }
    std::cout << "{\"threads\":" << threads << ",\"frames\":" << frames << ",\"bytes\":" << bytes;
    constexpr std::array<const char *, 5> names{"total", "configure", "convert", "compress",
                                                "packetize"};
    for (std::size_t i = 0; i < samples.size(); ++i) {
      auto &s = samples[i];
      std::sort(s.begin(), s.end());
      std::cout << ",\"" << names[i]
                << "MeanUs\":" << std::accumulate(s.begin(), s.end(), std::uint64_t{}) / s.size()
                << ",\"" << names[i] << "P95Us\":" << s[(s.size() * 95 + 99) / 100 - 1];
    }
    std::cout << "}\n";
  }
}
