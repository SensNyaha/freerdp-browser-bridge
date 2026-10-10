#pragma once
#include "protocol.hpp"

namespace bridge::ipc::audio {
constexpr std::size_t config_bytes = 20, metadata_bytes = 24;
constexpr std::uint16_t packet_frames = 960;
constexpr std::size_t pcm_bytes = packet_frames * 4, packet_bytes = metadata_bytes + pcm_bytes;
constexpr std::uint64_t interval_us = 20000;
constexpr std::size_t state_bytes = 40;
enum class Availability : std::uint8_t { unavailable, waiting, ready, suspended, closed, failed };
struct State {
  bool enabled;
  Availability availability;
  std::uint64_t revision, epoch, timestamp_us;
};
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
State decode_state(std::span<const std::uint8_t>);
std::array<std::uint8_t, state_bytes> encode_state(const State &);
} // namespace bridge::ipc::audio
