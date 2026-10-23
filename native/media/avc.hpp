#pragma once
#include "../compat/span.hpp"
#include "protocol.hpp"

namespace bridge::media {
constexpr std::size_t max_access_unit_bytes = 8 * 1024 * 1024;
struct AvcUnit {
  ::bridge::compat::span<const std::uint8_t> config;
  ::bridge::compat::span<const std::uint8_t> bytes;
  bool keyframe;
};
// Accepts bounded, complete Annex-B NALs from the native provider, emits only AVCC.
class AvcPacketizer {
  std::vector<std::uint8_t> sps_, pps_, config_, unit_;
  bool vcl_ = false, keyframe_ = false;

public:
  AvcPacketizer();
  void begin();
  void append(::bridge::compat::span<const std::uint8_t> nal);
  AvcUnit finish();
};
} // namespace bridge::media
