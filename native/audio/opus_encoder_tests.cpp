#include "opus_audio.hpp"
#include "opus_encoder.hpp"
#include <algorithm>
#include <bit>
#include <catch2/catch_test_macros.hpp>
#include <cmath>
#include <limits>
#include <numbers>
#include <opus/opus.h>
#include <stdexcept>
#include <vector>

using namespace bridge::audio;
namespace {
std::int16_t tone(std::size_t frame, std::size_t channel) {
  const auto frequency = channel == 0 ? 440.0 : 990.0;
  const auto amplitude = channel == 0 ? 8000.0 : 4000.0;
  return static_cast<std::int16_t>(
      std::lround(amplitude * std::sin(2.0 * std::numbers::pi * frequency *
                                       static_cast<double>(frame) / 48000.0)));
}
std::vector<std::uint8_t> pcm(std::size_t first) {
  std::vector<std::uint8_t> bytes(SoftwareOpusEncoder::pcm_bytes);
  for (std::size_t i = 0; i < SoftwareOpusEncoder::packet_frames; ++i)
    for (std::size_t channel = 0; channel < 2; ++channel) {
      const auto word = std::bit_cast<std::uint16_t>(tone(first + i, channel));
      bytes[i * 4 + channel * 2] = static_cast<std::uint8_t>(word);
      bytes[i * 4 + channel * 2 + 1] = static_cast<std::uint8_t>(word >> 8);
    }
  return bytes;
}
using Decoder = std::unique_ptr<OpusDecoder, decltype(&opus_decoder_destroy)>;
Decoder decoder() {
  int error = OPUS_OK;
  Decoder result(opus_decoder_create(48000, 2, &error), opus_decoder_destroy);
  REQUIRE(error == OPUS_OK);
  REQUIRE(result);
  return result;
}
std::vector<std::uint8_t> copy(const OpusUnit &unit) {
  return {unit.bytes.begin(), unit.bytes.end()};
}
} // namespace

TEST_CASE("Private Opus encodes real stereo PCM with bounded packets and preserved time") {
  SoftwareOpusEncoder encoder;
  auto receiver = decoder();
  std::vector<opus_int16> decoded(SoftwareOpusEncoder::packet_frames * 2);
  std::vector<opus_int16> history;
  REQUIRE(encoder.lookahead_frames() <= SoftwareOpusEncoder::packet_frames);
  for (std::size_t packet = 0; packet < 40; ++packet) {
    const auto source = pcm(packet * SoftwareOpusEncoder::packet_frames);
    const auto original = source;
    const auto timestamp = 1000 + static_cast<std::uint64_t>(packet) * 20000;
    const auto unit = encoder.encode({source, timestamp});
    REQUIRE(unit.timestamp_us == timestamp);
    REQUIRE(unit.discontinuity == (packet == 0));
    REQUIRE_FALSE(unit.bytes.empty());
    REQUIRE(unit.bytes.size() <= SoftwareOpusEncoder::max_packet_bytes);
    REQUIRE(opus_packet_get_nb_samples(unit.bytes.data(),
                                       static_cast<opus_int32>(unit.bytes.size()), 48000) == 960);
    REQUIRE(opus_packet_get_nb_channels(unit.bytes.data()) == 2);
    REQUIRE(opus_decode(receiver.get(), unit.bytes.data(),
                        static_cast<opus_int32>(unit.bytes.size()), decoded.data(), 960, 0) == 960);
    REQUIRE(source == original);
    history.insert(history.end(), decoded.begin(), decoded.end());
  }
  REQUIRE(encoder.encoded_packets() == 40);
  // Compare after the queried algorithmic delay and a short warm-up. Lossy output
  // is checked by per-channel waveform correlation rather than exact sample bytes.
  for (std::size_t channel = 0; channel < 2; ++channel) {
    double dot = 0.0, reference_energy = 0.0, decoded_energy = 0.0;
    for (std::size_t frame = 4800; frame < history.size() / 2; ++frame) {
      const auto reference = static_cast<double>(tone(frame - encoder.lookahead_frames(), channel));
      const auto actual = static_cast<double>(history[frame * 2 + channel]);
      dot += reference * actual;
      reference_energy += reference * reference;
      decoded_energy += actual * actual;
    }
    REQUIRE(decoded_energy > 0.0);
    REQUIRE(dot / std::sqrt(reference_energy * decoded_energy) > 0.9);
  }
}

TEST_CASE("Opus rejects input atomically before mutating prediction or borrowed output") {
  SoftwareOpusEncoder encoder, reference;
  const auto source = pcm(0);
  const auto borrowed = encoder.encode({source, 1000});
  const auto saved = copy(borrowed);
  REQUIRE(copy(reference.encode({source, 1000})) == saved);
  for (const auto size :
       {std::size_t{0}, std::size_t{1}, std::size_t{3839}, std::size_t{3841}, std::size_t{3844}}) {
    const std::vector<std::uint8_t> invalid(size);
    REQUIRE_THROWS_AS(encoder.encode({invalid, 21000}), std::invalid_argument);
    REQUIRE(encoder.encoded_packets() == 1);
    REQUIRE(copy(borrowed) == saved);
  }
  for (const auto timestamp : {std::uint64_t{0}, std::uint64_t{1000}, std::uint64_t{21001},
                               std::numeric_limits<std::uint64_t>::max() - 19999}) {
    REQUIRE_THROWS_AS(encoder.encode({source, timestamp}), std::invalid_argument);
    REQUIRE(encoder.encoded_packets() == 1);
    REQUIRE(copy(borrowed) == saved);
  }
  REQUIRE_THROWS_AS(encoder.encode({source, 1000, true}), std::invalid_argument);
  REQUIRE(copy(borrowed) == saved);
  std::vector<std::uint8_t> unaligned(source.size() + 1);
  std::ranges::copy(source, unaligned.begin() + 1);
  const auto next = encoder.encode({std::span<const std::uint8_t>(unaligned).subspan(1), 21000});
  REQUIRE(copy(next) == copy(reference.encode({source, 21000})));
  REQUIRE_FALSE(next.discontinuity);
  REQUIRE(encoder.encoded_packets() == 2);
}

TEST_CASE("Opus reset and forward discontinuity restore prediction and retain controls") {
  const auto source = pcm(0);
  SoftwareOpusEncoder encoder({128000}), reference({128000});
  const auto fresh = copy(reference.encode({source, 0}));
  const auto lookahead = encoder.lookahead_frames();
  REQUIRE(copy(encoder.encode({source, 1000})) == fresh);
  encoder.encode({source, 21000});
  const auto gap = encoder.encode({source, 200000, true});
  REQUIRE(gap.discontinuity);
  REQUIRE(gap.timestamp_us == 200000);
  REQUIRE(copy(gap) == fresh);
  REQUIRE(encoder.encoded_packets() == 3);
  encoder.reset();
  const auto restarted = encoder.encode({source, 0});
  REQUIRE(restarted.discontinuity);
  REQUIRE(copy(restarted) == fresh);
  REQUIRE(encoder.lookahead_frames() == lookahead);
  REQUIRE(encoder.encoded_packets() == 4);
}

TEST_CASE("Opus accepts bounded bitrate profiles and decodable silence without DTX") {
  const std::vector<std::uint8_t> silence(SoftwareOpusEncoder::pcm_bytes);
  for (const auto bitrate : {16000, 64000, 128000}) {
    SoftwareOpusEncoder encoder({bitrate});
    auto receiver = decoder();
    std::vector<opus_int16> decoded(SoftwareOpusEncoder::packet_frames * 2);
    for (std::uint64_t packet = 0; packet < 20; ++packet) {
      const auto unit = encoder.encode({silence, packet * 20000});
      REQUIRE_FALSE(unit.bytes.empty());
      REQUIRE(unit.bytes.size() <= SoftwareOpusEncoder::max_packet_bytes);
      REQUIRE(opus_decode(receiver.get(), unit.bytes.data(),
                          static_cast<opus_int32>(unit.bytes.size()), decoded.data(), 960,
                          0) == 960);
    }
  }
  for (const auto bitrate : {-1, 0, 15999, 128001, std::numeric_limits<int>::max()})
    REQUIRE_THROWS_AS(SoftwareOpusEncoder(OpusOptions{bitrate}), std::invalid_argument);
}

TEST_CASE("Opus timestamp upper boundary cannot wrap into a fresh clock") {
  SoftwareOpusEncoder encoder;
  const auto source = pcm(0);
  const auto maximum = std::numeric_limits<std::uint64_t>::max();
  const auto unit = encoder.encode({source, maximum - 20000});
  const auto saved = copy(unit);
  REQUIRE(unit.timestamp_us == maximum - 20000);
  REQUIRE_THROWS_AS(encoder.encode({source, maximum}), std::invalid_argument);
  REQUIRE_THROWS_AS(encoder.encode({source, 0, true}), std::invalid_argument);
  REQUIRE(copy(unit) == saved);
  REQUIRE(encoder.encoded_packets() == 1);
  encoder.reset();
  REQUIRE(encoder.encode({source, 0}).discontinuity);
}

TEST_CASE("Real private Opus packets satisfy the bounded IPC stereo frame profile") {
  namespace wire = bridge::ipc::audio::opus;
  for (const auto bitrate : {16000, 64000, 128000}) {
    SoftwareOpusEncoder encoder({bitrate});
    const auto config = wire::decode_config(wire::encode_config({1, encoder.lookahead_frames()}));
    REQUIRE(config.lookahead_frames == encoder.lookahead_frames());
    for (std::uint64_t index = 0; index < 20; ++index) {
      auto input = pcm(static_cast<std::size_t>(index) * SoftwareOpusEncoder::packet_frames);
      if (index % 2)
        std::ranges::fill(input, 0);
      const auto unit = encoder.encode({input, index * 20000});
      REQUIRE_NOTHROW(wire::validate_payload(unit.bytes));
      REQUIRE(opus_packet_get_nb_frames(unit.bytes.data(),
                                        static_cast<opus_int32>(unit.bytes.size())) == 1);
      REQUIRE(opus_packet_get_nb_channels(unit.bytes.data()) == 2);
      REQUIRE(opus_packet_get_samples_per_frame(unit.bytes.data(), 48000) == 960);
      const auto owner =
          wire::encode_packet({1, unit.timestamp_us, 960, 0, unit.discontinuity, unit.bytes});
      const auto packet = wire::decode_packet(owner.bytes());
      REQUIRE(std::ranges::equal(packet.encoded, unit.bytes));
      REQUIRE(packet.timestamp_us == unit.timestamp_us);
      REQUIRE(packet.discontinuity == unit.discontinuity);
    }
  }
}
