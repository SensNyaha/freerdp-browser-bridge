#include "opus_encoder.hpp"
#include <algorithm>
#include <array>
#include <bit>
#include <limits>
#include <opus/opus.h>
#include <stdexcept>

namespace bridge::audio {
namespace {
[[noreturn]] void sdk_failed() { throw std::runtime_error("Opus encoder failed"); }
void checked(int status) {
  if (status != OPUS_OK)
    sdk_failed();
}
// A build without these optional extensions cannot enable them. No caller knob.
void disabled_extension(int status) {
  if (status != OPUS_OK && status != OPUS_UNIMPLEMENTED)
    sdk_failed();
}
} // namespace
struct SoftwareOpusEncoder::State {
  std::unique_ptr<OpusEncoder, decltype(&opus_encoder_destroy)> encoder{nullptr,
                                                                        opus_encoder_destroy};
  std::array<opus_int16, packet_frames * 2> samples{};
  std::array<std::uint8_t, max_packet_bytes> packet{};
  std::uint64_t timestamp = 0, encoded = 0;
  std::uint16_t lookahead = 0;
  bool have_timestamp = false, boundary = true, failed = false;
  explicit State(OpusOptions options) {
    int error = OPUS_OK;
    encoder.reset(opus_encoder_create(48000, 2, OPUS_APPLICATION_AUDIO, &error));
    if (error != OPUS_OK || !encoder)
      sdk_failed();
    checked(opus_encoder_ctl(encoder.get(), OPUS_SET_BITRATE(options.bitrate)));
    checked(opus_encoder_ctl(encoder.get(), OPUS_SET_COMPLEXITY(5)));
    checked(opus_encoder_ctl(encoder.get(), OPUS_SET_FORCE_CHANNELS(2)));
    checked(opus_encoder_ctl(encoder.get(), OPUS_SET_VBR(1)));
    checked(opus_encoder_ctl(encoder.get(), OPUS_SET_VBR_CONSTRAINT(1)));
    checked(opus_encoder_ctl(encoder.get(), OPUS_SET_INBAND_FEC(0)));
    checked(opus_encoder_ctl(encoder.get(), OPUS_SET_DTX(0)));
    disabled_extension(opus_encoder_ctl(encoder.get(), OPUS_SET_DRED_DURATION(0)));
    disabled_extension(opus_encoder_ctl(encoder.get(), OPUS_SET_QEXT(0)));
    opus_int32 delay = 0;
    checked(opus_encoder_ctl(encoder.get(), OPUS_GET_LOOKAHEAD(&delay)));
    if (delay < 0 || delay > static_cast<opus_int32>(packet_frames))
      sdk_failed();
    lookahead = static_cast<std::uint16_t>(delay);
  }
  [[noreturn]] void fail() {
    failed = true;
    packet.fill(0);
    samples.fill(0);
    sdk_failed();
  }
};
SoftwareOpusEncoder::SoftwareOpusEncoder(OpusOptions options) {
  if (options.bitrate < 16000 || options.bitrate > 128000)
    throw std::invalid_argument("Invalid Opus encoder settings");
  state_ = std::make_unique<State>(options);
}
SoftwareOpusEncoder::~SoftwareOpusEncoder() = default;
OpusUnit SoftwareOpusEncoder::encode(const OpusFrame &frame) {
  auto &state = *state_;
  if (state.failed)
    sdk_failed();
  constexpr auto maximum_time = std::numeric_limits<std::uint64_t>::max() - 20000;
  if (frame.pcm.size() != pcm_bytes || frame.timestamp_us > maximum_time ||
      (state.have_timestamp &&
       (frame.timestamp_us <= state.timestamp ||
        (!frame.discontinuity && frame.timestamp_us != state.timestamp + 20000))))
    throw std::invalid_argument("Invalid Opus input");
  if (state.encoded == std::numeric_limits<std::uint64_t>::max())
    state.fail();
  if (frame.discontinuity)
    reset();
  static_assert(sizeof(opus_int16) == sizeof(std::uint16_t));
  for (std::size_t i = 0; i < state.samples.size(); ++i) {
    const auto word =
        static_cast<std::uint16_t>(static_cast<std::uint16_t>(frame.pcm[i * 2]) |
                                   (static_cast<std::uint16_t>(frame.pcm[i * 2 + 1]) << 8));
    state.samples[i] = std::bit_cast<opus_int16>(word);
  }
  const auto bytes =
      opus_encode(state.encoder.get(), state.samples.data(), static_cast<int>(packet_frames),
                  state.packet.data(), static_cast<opus_int32>(state.packet.size()));
  if (bytes <= 0 || static_cast<std::size_t>(bytes) > state.packet.size())
    state.fail();
  const bool boundary = state.boundary;
  state.have_timestamp = true;
  state.timestamp = frame.timestamp_us;
  state.boundary = false;
  ++state.encoded;
  return {{state.packet.data(), static_cast<std::size_t>(bytes)}, frame.timestamp_us, boundary};
}
void SoftwareOpusEncoder::reset() {
  auto &state = *state_;
  if (state.failed)
    sdk_failed();
  if (opus_encoder_ctl(state.encoder.get(), OPUS_RESET_STATE) != OPUS_OK)
    state.fail();
  state.packet.fill(0);
  state.samples.fill(0);
  state.have_timestamp = false;
  state.boundary = true;
}
std::uint16_t SoftwareOpusEncoder::lookahead_frames() const noexcept { return state_->lookahead; }
std::uint64_t SoftwareOpusEncoder::encoded_packets() const noexcept { return state_->encoded; }
} // namespace bridge::audio
