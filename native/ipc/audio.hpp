#pragma once
#include "protocol.hpp"

namespace bridge::ipc::audio {
constexpr std::size_t config_bytes = 20, metadata_bytes = 24;
constexpr std::uint16_t packet_frames = 960;
constexpr std::size_t pcm_bytes = packet_frames * 4, packet_bytes = metadata_bytes + pcm_bytes;
constexpr std::uint64_t interval_us = 20000;
struct Config {
  std::uint64_t epoch;
};
struct PcmPacket {
  std::uint64_t epoch, timestamp_us;
  std::uint16_t frames, silence_frames;
  bool discontinuity;
  std::span<const std::uint8_t> pcm;
};
// Fixed schema 1: S16LE stereo 48 kHz, 20 ms. Decode borrows the supplied storage.
Config decode_config(std::span<const std::uint8_t>);
PcmPacket decode_packet(std::span<const std::uint8_t>);
std::array<std::uint8_t, config_bytes> encode_config(Config);
std::array<std::uint8_t, packet_bytes> encode_packet(const PcmPacket &);
} // namespace bridge::ipc::audio
