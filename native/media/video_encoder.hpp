#pragma once
#include "avc.hpp"
#include <memory>

namespace bridge::media {
struct VideoFrame {
  std::span<const std::uint8_t> bgra;
  int width, height, stride;
  std::uint64_t timestamp_us;
};
struct EncoderOptions {
  int fps = 30;
  int bitrate = 4000000;
  int keyframe_ms = 2000;
};
class VideoEncoder {
public:
  virtual ~VideoEncoder() = default;
  // Output spans remain valid until the next encode; callers own transport copies.
  virtual AvcUnit encode(const VideoFrame &frame, bool force_idr) = 0;
};
class SoftwareH264Encoder final : public VideoEncoder {
  struct State;
  std::unique_ptr<State> state_;

public:
  explicit SoftwareH264Encoder(EncoderOptions options = {});
  ~SoftwareH264Encoder() override;
  AvcUnit encode(const VideoFrame &frame, bool force_idr) override;
};
} // namespace bridge::media
