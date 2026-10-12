#include "microphone_opus_owner.hpp"
#include <exception>
#include <limits>
#include <stdexcept>

namespace bridge::audio {
using ipc::microphone::Result;
namespace {
void add(std::uint64_t &value, std::uint64_t amount = 1) noexcept {
  constexpr auto maximum = (std::numeric_limits<std::uint64_t>::max)();
  value = amount > maximum - value ? maximum : value + amount;
}
} // namespace
MicrophoneOpusOwner::MicrophoneOpusOwner(MicrophoneSession &owner)
    : owner_(owner), thread_(std::this_thread::get_id()) {
  const auto state = owner.stats();
  if (!state || state->retirement != MicrophoneRetirement::active || state->publication_failed)
    throw std::invalid_argument("Invalid Opus microphone owner");
}
MicrophoneOpusOwner::~MicrophoneOpusOwner() {
  if (busy_)
    std::terminate();
  clear(); // No FreeRDP/borrowed owner call during destruction.
}
bool MicrophoneOpusOwner::on_thread() const noexcept {
  return thread_ == std::this_thread::get_id();
}
void MicrophoneOpusOwner::clear() noexcept {
  if (decoder_)
    add(stats_.discarded_partial_frames, decoder_->stats().queued_frames);
  decoder_.reset();
}
Result MicrophoneOpusOwner::count(Result result) noexcept {
  switch (result) {
  case Result::accepted:
    add(stats_.accepted);
    break;
  case Result::stale:
    add(stats_.stale);
    break;
  case Result::unavailable:
    add(stats_.unavailable);
    break;
  case Result::busy:
    add(stats_.busy);
    break;
  case Result::invalid:
    add(stats_.invalid);
    break;
  }
  return result;
}
bool MicrophoneOpusOwner::synchronize() noexcept {
  if (!on_thread() || busy_ || stats_.failed || stats_.retired)
    return false;
  const auto state = owner_.stats();
  const bool ready = state && owner_.input_ready(state->source.epoch);
  if (!ready || (decoder_ && decoder_->stats().epoch != state->source.epoch))
    clear();
  return ready;
}
Result MicrophoneOpusOwner::submit(const ipc::microphone::opus::Packet &packet) noexcept {
  if (!on_thread())
    return Result::unavailable;
  if (busy_)
    return count(Result::busy);
  if (stats_.failed || stats_.retired)
    return count(Result::unavailable);
  const auto state = owner_.stats();
  if (!state)
    return count(Result::unavailable);
  if (!owner_.input_ready(state->source.epoch)) {
    clear();
    return count(Result::unavailable);
  }
  if (decoder_ && decoder_->stats().epoch != state->source.epoch) {
    if (state->source.epoch < decoder_->stats().epoch) {
      stats_.failed = true;
      clear();
      return count(Result::unavailable);
    }
    clear(); // Source changed: obsolete prediction is not retained by a refused new packet.
  }
  if (packet.epoch != state->source.epoch)
    return count(Result::stale);
  busy_ = true;
  Result result = Result::unavailable;
  try {
    if (packet.timestamp_us > UINT64_MAX - 20000 || packet.lookahead_frames > 960 ||
        (!decoder_ && !packet.discontinuity))
      throw std::invalid_argument("Invalid Opus microphone input");
    ipc::audio::opus::validate_payload(packet.encoded); // Before SDK allocation/decode.
    if (!decoder_)
      decoder_ = std::make_unique<OpusCaptureDecoder>(packet.epoch);
    const auto output = decoder_->decode(packet);
    add(stats_.decoded_packets);
    if (!output) {
      add(stats_.primed);
      result = Result::accepted;
    } else {
      result = owner_.submit(*output);
      if (result == Result::accepted)
        add(stats_.pcm_units);
      else {
        // Prediction advanced; refused/uncertain PCM cannot be automatically retried.
        if (result == Result::invalid || result == Result::busy)
          stats_.failed = true;
        clear();
      }
    }
  } catch (const ipc::ProtocolError &) {
    result = Result::invalid;
  } catch (const std::invalid_argument &) {
    result = Result::invalid;
  } catch (...) {
    stats_.failed = true;
    clear();
    result = Result::unavailable;
  }
  busy_ = false;
  return count(result);
}
bool MicrophoneOpusOwner::invalidate() noexcept {
  if (!on_thread() || busy_)
    return false;
  clear();
  return true;
}
bool MicrophoneOpusOwner::retire() noexcept {
  if (!invalidate())
    return false;
  stats_.retired = true;
  return true;
}
std::optional<MicrophoneOpusStats> MicrophoneOpusOwner::stats() const noexcept {
  if (!on_thread() || busy_)
    return {};
  auto result = stats_;
  if (decoder_) {
    result.epoch = decoder_->stats().epoch;
    result.partial_frames = decoder_->stats().queued_frames;
  }
  return result;
}
} // namespace bridge::audio
