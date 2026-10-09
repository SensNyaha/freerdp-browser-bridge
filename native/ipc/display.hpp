#pragma once
#include "protocol.hpp"

namespace bridge::ipc {
constexpr std::size_t display_update_bytes = 32;
struct DisplaySize {
  std::uint16_t width, height;
  bool operator==(const DisplaySize &) const = default;
};
struct DisplayUpdate {
  std::uint64_t generation, framebuffer_revision;
  DisplaySize actual;
  bool enabled, negotiated;
  DisplaySize maximum;
  std::uint32_t max_area;
};
enum class ResizeResult : std::uint16_t {
  applied = 0,
  unchanged,
  unavailable,
  invalid,
  busy,
  send_failed,
  timeout,
  disconnected
};
DisplaySize decode_display_resize(std::span<const std::uint8_t> bytes);
std::vector<std::uint8_t> encode_display_update(const DisplayUpdate &update);
std::vector<std::uint8_t> encode_resize_result(ResizeResult result);
} // namespace bridge::ipc
