#include "../compat/bit.hpp"
#include "../compat/span.hpp"
#include "opus_decoder.hpp"
#include <array>
#include <cstring>
#include <limits>
#include <opus/opus.h>
#include <stdexcept>

namespace bridge::audio {
namespace {
[[noreturn]] void sdk_failed() { throw std::runtime_error("Opus decoder failed"); }
[[noreturn]] void invalid() { throw std::invalid_argument("Invalid Opus input packet"); }
using Decoder = std::unique_ptr<OpusDecoder, decltype(&opus_decoder_destroy)>;
Decoder create() {
  int error = OPUS_OK;
  Decoder decoder(opus_decoder_create(48000, 2, &error), opus_decoder_destroy);
  if (error != OPUS_OK || !decoder)
    sdk_failed();
  return decoder;
}
void validate(::bridge::compat::span<const std::uint8_t> packet) {
  if (packet.size() < SoftwareOpusDecoder::min_packet_bytes ||
      packet.size() > SoftwareOpusDecoder::max_packet_bytes)
    invalid();
  const auto size = static_cast<opus_int32>(packet.size());
  // Bridge single-frame/stereo/20 ms policy, not the universal Opus limits.
  if ((packet[0] & 3) != 0 || opus_packet_get_nb_channels(packet.data()) != 2 ||
      opus_packet_get_nb_frames(packet.data(), size) != 1 ||
      opus_packet_get_nb_samples(packet.data(), size, 48000) != 960)
    invalid();
}
} // namespace
struct SoftwareOpusDecoder::State {
  Decoder active{nullptr, opus_decoder_destroy}, candidate{nullptr, opus_decoder_destroy};
  std::array<opus_int16, packet_frames * 2> samples{};
  std::array<std::uint8_t, pcm_bytes> pcm{};
  std::size_t sdk_bytes = 0;
  std::uint64_t timestamp = 0, decoded = 0;
  bool have_timestamp = false, boundary = true, failed = false;
  State() {
    const auto size = opus_decoder_get_size(2);
    if (size <= 0 || static_cast<std::size_t>(size) > max_sdk_state_bytes)
      sdk_failed();
    sdk_bytes = static_cast<std::size_t>(size);
    active = create();
    candidate = create();
  }
  ~State() {
    samples.fill(0);
    pcm.fill(0);
  }
  [[noreturn]] void fail() {
    failed = true;
    samples.fill(0);
    pcm.fill(0);
    sdk_failed();
  }
};
SoftwareOpusDecoder::SoftwareOpusDecoder() : state_(std::make_unique<State>()) {}
SoftwareOpusDecoder::~SoftwareOpusDecoder() = default;
OpusPcmUnit SoftwareOpusDecoder::decode(const OpusDecodePacket &packet) {
  auto &state = *state_;
  if (state.failed)
    sdk_failed();
  constexpr auto maximum_time = std::numeric_limits<std::uint64_t>::max() - 20000;
  if (packet.timestamp_us > maximum_time ||
      (state.have_timestamp &&
       (packet.timestamp_us <= state.timestamp ||
        (!packet.discontinuity && packet.timestamp_us != state.timestamp + 20000))))
    invalid();
  validate(packet.encoded);
  if (state.decoded == std::numeric_limits<std::uint64_t>::max())
    state.fail();
  // Public OpusDecoder API defines the complete state as position independent
  // and shallow-copyable. Decode into the preallocated candidate, then commit.
  std::memcpy(state.candidate.get(), state.active.get(), state.sdk_bytes);
  if (packet.discontinuity && opus_decoder_ctl(state.candidate.get(), OPUS_RESET_STATE) != OPUS_OK)
    state.fail();
  const auto frames = opus_decode(state.candidate.get(), packet.encoded.data(),
                                  static_cast<opus_int32>(packet.encoded.size()),
                                  state.samples.data(), static_cast<int>(packet_frames), 0);
  if (frames != static_cast<int>(packet_frames)) {
    state.samples.fill(0);
    if (frames == OPUS_INVALID_PACKET || frames == OPUS_BUFFER_TOO_SMALL)
      invalid();
    state.fail();
  }
  for (std::size_t i = 0; i < state.samples.size(); ++i) {
    const auto word = ::bridge::compat::bit_cast<std::uint16_t>(state.samples[i]);
    state.pcm[i * 2] = static_cast<std::uint8_t>(word);
    state.pcm[i * 2 + 1] = static_cast<std::uint8_t>(word >> 8);
  }
  state.samples.fill(0);
  state.active.swap(state.candidate);
  const bool boundary = state.boundary || packet.discontinuity;
  state.have_timestamp = true;
  state.timestamp = packet.timestamp_us;
  state.boundary = false;
  ++state.decoded;
  return {state.pcm, packet.timestamp_us, boundary};
}
void SoftwareOpusDecoder::reset() {
  auto &state = *state_;
  if (state.failed)
    sdk_failed();
  if (opus_decoder_ctl(state.active.get(), OPUS_RESET_STATE) != OPUS_OK ||
      opus_decoder_ctl(state.candidate.get(), OPUS_RESET_STATE) != OPUS_OK)
    state.fail();
  state.samples.fill(0);
  state.pcm.fill(0);
  state.have_timestamp = false;
  state.boundary = true;
}
std::uint64_t SoftwareOpusDecoder::decoded_packets() const noexcept { return state_->decoded; }
std::size_t SoftwareOpusDecoder::sdk_state_bytes() const noexcept { return state_->sdk_bytes; }
} // namespace bridge::audio
