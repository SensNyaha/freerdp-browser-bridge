#pragma once
#include "protocol.hpp"
#include <memory>
#include <span>

namespace bridge::media {
// Replaceable native provider. No raw framebuffer crosses the worker boundary.
class JpegEncoder {
  struct State;
  std::unique_ptr<State> state_;

public:
  explicit JpegEncoder(int quality = 80);
  ~JpegEncoder();
  std::span<const std::uint8_t> encode(std::span<const std::uint8_t> bgra, int width, int height,
                                       int stride);
};
} // namespace bridge::media
