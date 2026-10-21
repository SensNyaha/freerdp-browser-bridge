#pragma once
#include "../compat/span.hpp"
#include "protocol.hpp"
#include <memory>

namespace bridge::media {
// Replaceable native provider. No raw framebuffer crosses the worker boundary.
class JpegEncoder {
  struct State;
  std::unique_ptr<State> state_;

public:
  explicit JpegEncoder(int quality = 80);
  ~JpegEncoder();
  ::bridge::compat::span<const std::uint8_t> encode(::bridge::compat::span<const std::uint8_t> bgra, int width, int height,
                                       int stride);
};
} // namespace bridge::media
