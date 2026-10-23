#include "../compat/span.hpp"
#include "connection_config.hpp"
#include <algorithm>

namespace bridge::ipc {
namespace {
bool utf8(::bridge::compat::span<const std::uint8_t> bytes) {
  std::size_t i = 0;
  while (i < bytes.size()) {
    const auto c = bytes[i++];
    if (c == 0)
      return false;
    if (c < 0x80)
      continue;
    std::uint32_t value = 0, minimum = 0;
    unsigned count = 0;
    if (c >= 0xc2 && c <= 0xdf) {
      value = c & 0x1fU;
      count = 1;
      minimum = 0x80;
    } else if (c >= 0xe0 && c <= 0xef) {
      value = c & 0x0fU;
      count = 2;
      minimum = 0x800;
    } else if (c >= 0xf0 && c <= 0xf4) {
      value = c & 7U;
      count = 3;
      minimum = 0x10000;
    } else {
      return false;
    }
    if (bytes.size() - i < count)
      return false;
    while (count--) {
      const auto next = bytes[i++];
      if ((next & 0xc0U) != 0x80)
        return false;
      value = (value << 6) | (next & 0x3fU);
    }
    if (value < minimum || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff))
      return false;
  }
  return true;
}
} // namespace
ConnectionConfig decode_connection_config(::bridge::compat::span<const std::uint8_t> bytes) {
  if (bytes.size() > 2048)
    throw ProtocolError();
  std::size_t offset = 0;
  const auto number = [&](std::size_t count) {
    if (count > bytes.size() - offset)
      throw ProtocolError();
    const auto value = read_be(bytes.subspan(offset, count));
    offset += count;
    return value;
  };
  const auto text = [&](std::size_t maximum) {
    const auto length = static_cast<std::size_t>(number(2));
    if (length > maximum || length > bytes.size() - offset)
      throw ProtocolError();
    const auto slice = bytes.subspan(offset, length);
    if (!utf8(slice))
      throw ProtocolError();
    offset += length;
    return std::string(slice.begin(), slice.end());
  };
  const auto schema = number(2);
  if (schema < 1 || schema > 12)
    throw ProtocolError();
  ConnectionConfig config{};
  config.host = text(253);
  config.username = text(256);
  config.domain = text(256);
  config.port = static_cast<std::uint16_t>(number(2));
  config.width = static_cast<std::uint16_t>(number(2));
  config.height = static_cast<std::uint16_t>(number(2));
  config.color_depth = static_cast<std::uint16_t>(number(2));
  config.security = static_cast<std::uint8_t>(number(1));
  config.certificate_policy = static_cast<std::uint8_t>(number(1));
  config.minimum_tls = static_cast<std::uint8_t>(number(1));
  const auto reserved = number(1);
  config.connect_ms = static_cast<std::uint32_t>(number(4));
  config.tcp_ack_ms = static_cast<std::uint32_t>(number(4));
  if (schema >= 2) {
    config.h264_fps = static_cast<std::uint8_t>(number(1));
    config.jpeg_fps = static_cast<std::uint8_t>(number(1));
    config.jpeg_quality = static_cast<std::uint8_t>(number(1));
    const auto media_reserved = number(1);
    config.target_bitrate = static_cast<std::uint32_t>(number(4));
    config.max_bitrate = static_cast<std::uint32_t>(number(4));
    if (media_reserved || config.h264_fps < 1 || config.h264_fps > 30 || config.jpeg_fps < 1 ||
        config.jpeg_fps > 20 || config.jpeg_quality < 1 || config.jpeg_quality > 100 ||
        config.target_bitrate < 100000 || config.target_bitrate > 20000000 ||
        config.max_bitrate < config.target_bitrate || config.max_bitrate > 20000000)
      throw ProtocolError();
  }
  if (schema >= 3) {
    const auto flags = number(4);
    if (flags > (schema == 3   ? 1U
                 : schema == 4 ? 3U
                 : schema == 5 ? 7U
                 : schema == 6 ? 15U
                 : schema == 7 ? 31U
                 : schema == 8 ? 63U
                 : schema == 9 ? 127U
                               : 511U) ||
        (flags & 12U) == 12U || (flags & 48U) == 48U)
      throw ProtocolError();
    config.dynamic_resolution = (flags & 1U) != 0;
    config.touch = (flags & 2U) != 0;
    config.pcm_output = (flags & 4U) != 0;
    config.opus_output = (flags & 8U) != 0;
    config.pcm_input = (flags & 16U) != 0;
    config.opus_input = (flags & 32U) != 0;
    config.audio_buffer_200 = (flags & 64U) != 0;
    config.clipboard_to_server = (flags & 128U) != 0;
    config.clipboard_from_server = (flags & 256U) != 0;
    if (config.audio_buffer_200 && !(config.pcm_output || config.opus_output))
      throw ProtocolError();
  }
  if (schema >= 10) {
    config.clipboard_maximum = static_cast<std::uint32_t>(number(4));
    if (config.clipboard_to_server || config.clipboard_from_server) {
      if (!config.clipboard_maximum || config.clipboard_maximum > 16 * 1024 * 1024)
        throw ProtocolError();
    } else if (config.clipboard_maximum)
      throw ProtocolError();
  }
  if (schema >= 11) {
    const auto mask = number(1), values = number(1);
    if (mask > 63U || (values & ~mask) != 0)
      throw ProtocolError();
    config.performance_mask = static_cast<std::uint8_t>(mask);
    config.performance_values = static_cast<std::uint8_t>(values);
  }
  if (schema >= 12) {
    config.ip_mask = static_cast<std::uint8_t>(number(1));
    config.prefer_ipv6 = static_cast<std::uint8_t>(number(1));
    config.force_ip_version = static_cast<std::uint8_t>(number(1));
    if (!valid_ip_settings(config.ip_mask, config.prefer_ipv6, config.force_ip_version))
      throw ProtocolError();
  }
  if (offset != bytes.size() || config.host.empty() ||
      std::any_of(config.host.begin(), config.host.end(),
                  [](unsigned char c) { return c <= 32; }) ||
      config.port == 0 || config.width == 0 || config.width > 7680 || config.height == 0 ||
      config.height > 4320 ||
      (config.color_depth != 16 && config.color_depth != 24 && config.color_depth != 32) ||
      config.security > 2 || config.certificate_policy > 1 ||
      (config.minimum_tls != 2 && config.minimum_tls != 3) || reserved != 0 ||
      config.connect_ms < 100 || config.connect_ms > 120000 || config.tcp_ack_ms < 100 ||
      config.tcp_ack_ms > 120000)
    throw ProtocolError();
  return config;
}
void validate_secret(::bridge::compat::span<const std::uint8_t> bytes) {
  if (bytes.size() > 4096 || !utf8(bytes))
    throw ProtocolError();
}
void wipe(::bridge::compat::span<std::uint8_t> bytes) noexcept {
  volatile std::uint8_t *output = bytes.data();
  for (std::size_t i = 0; i < bytes.size(); ++i)
    output[i] = 0;
}
} // namespace bridge::ipc
