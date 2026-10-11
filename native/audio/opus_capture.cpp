#include "opus_capture.hpp"
#include "microphone.hpp"
#include <algorithm>
#include <array>
#include <limits>
#include <stdexcept>

namespace bridge::audio {
namespace {
[[noreturn]] void invalid() { throw std::invalid_argument("Invalid Opus capture packet"); }
void add(std::uint64_t &value, std::uint64_t amount) noexcept {
  constexpr auto maximum = std::numeric_limits<std::uint64_t>::max();
  value = amount > maximum - value ? maximum : value + amount;
}
} // namespace
struct OpusCaptureDecoder::State {
  SoftwareOpusDecoder decoder;
  std::array<std::uint8_t, SoftwareOpusDecoder::pcm_bytes> carry{}, output{};
  OpusCaptureStats stats;
  std::uint64_t next_timestamp = 0;
  bool have_input = false, boundary = true;
  explicit State(std::uint64_t epoch) { stats.epoch = epoch; }
  ~State() {
    carry.fill(0);
    output.fill(0);
  }
  void clear() noexcept {
    add(stats.reset_discarded_frames, stats.queued_frames);
    carry.fill(0);
    output.fill(0);
    stats.queued_frames = 0;
    stats.priming = true;
    boundary = true;
  }
  [[noreturn]] void fail() {
    stats.failed = true;
    clear();
    throw std::runtime_error("Opus capture decoder failed");
  }
};
OpusCaptureDecoder::OpusCaptureDecoder(std::uint64_t epoch) {
  if (!epoch)
    invalid();
  state_ = std::make_unique<State>(epoch);
}
OpusCaptureDecoder::~OpusCaptureDecoder() = default;
std::optional<ipc::microphone::PcmPacket>
OpusCaptureDecoder::decode(const ipc::microphone::opus::Packet &packet) {
  auto &s = *state_;
  if (s.stats.failed)
    s.fail();
  if (packet.epoch != s.stats.epoch || packet.lookahead_frames > 960 ||
      (!s.have_input && !packet.discontinuity) ||
      (s.have_input && !packet.discontinuity &&
       packet.lookahead_frames != s.stats.lookahead_frames))
    invalid();
  // Successful SDK decode is the last fallible operation before fixed copies.
  OpusPcmUnit decoded;
  try {
    decoded = s.decoder.decode({packet.encoded, packet.timestamp_us, packet.discontinuity});
  } catch (const std::invalid_argument &) {
    throw;
  } catch (...) {
    s.fail();
  }
  std::size_t skip = 0;
  if (packet.discontinuity) {
    s.clear();
    s.stats.lookahead_frames = packet.lookahead_frames;
    s.next_timestamp = packet.timestamp_us;
    skip = packet.lookahead_frames;
    add(s.stats.skipped_delay_frames, skip);
  }
  s.have_input = true;
  s.stats.decoded_packets = s.decoder.decoded_packets();
  s.output.fill(0);
  const auto usable = decoded.pcm.subspan(skip * 4);
  const auto carried = s.stats.queued_frames;
  if (carried + usable.size() / 4 < 960) {
    std::copy(usable.begin(), usable.end(),
              s.carry.begin() + static_cast<std::ptrdiff_t>(carried * 4));
    s.stats.queued_frames += usable.size() / 4;
    return {};
  }
  const auto from_packet = (960 - carried) * 4;
  std::copy_n(s.carry.begin(), carried * 4, s.output.begin());
  std::copy_n(usable.begin(), from_packet,
              s.output.begin() + static_cast<std::ptrdiff_t>(carried * 4));
  const auto tail = usable.subspan(from_packet);
  std::copy(tail.begin(), tail.end(), s.carry.begin());
  std::fill(s.carry.begin() + static_cast<std::ptrdiff_t>(tail.size()), s.carry.end(), 0);
  s.stats.queued_frames = tail.size() / 4;
  s.stats.priming = false;
  add(s.stats.output_packets, 1);
  const ipc::microphone::PcmPacket output{s.stats.epoch, s.next_timestamp, s.boundary, s.output};
  s.boundary = false;
  s.next_timestamp += 20000; // Output time is at most the already-validated input time.
  return output;
}
void OpusCaptureDecoder::reset(std::uint64_t epoch) {
  auto &s = *state_;
  if (s.stats.failed)
    s.fail();
  if (!epoch || epoch <= s.stats.epoch)
    invalid();
  try {
    s.decoder.reset();
  } catch (...) {
    s.fail();
  }
  s.clear();
  s.stats.epoch = epoch;
  s.stats.lookahead_frames = 0;
  s.have_input = false;
  s.next_timestamp = 0;
}
OpusCaptureStats OpusCaptureDecoder::stats() const noexcept { return state_->stats; }
} // namespace bridge::audio
