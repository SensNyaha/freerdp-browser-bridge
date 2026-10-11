#include "audin_source.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <stdexcept>
#include <vector>

using namespace bridge::audio;
namespace {
AUDIO_FORMAT format(UINT16 channels = 2) {
  AUDIO_FORMAT value{};
  value.wFormatTag = WAVE_FORMAT_PCM;
  value.nSamplesPerSec = 48000;
  value.nChannels = channels;
  value.wBitsPerSample = 16;
  value.nBlockAlign = static_cast<UINT16>(channels * 2);
  value.nAvgBytesPerSec = value.nSamplesPerSec * value.nBlockAlign;
  return value;
}
struct Receiver {
  std::vector<std::uint8_t> bytes;
  AUDIO_FORMAT format{};
  unsigned calls = 0;
  UINT error = CHANNEL_RC_OK;
  bool throws = false, reenter = false;
  AudinSource *source = nullptr;
  UINT close_result = 0, free_result = 0, open_result = 0, format_result = 0;
  AudinPumpStatus nested = AudinPumpStatus::inactive;
  bool retired = true;
  CaptureStatus submitted = CaptureStatus::accepted;
  CaptureStatus skipped = CaptureStatus::accepted;
  AudinCaptureReset reset{AudinCaptureResetStatus::reset};
  static UINT receive(const AUDIO_FORMAT *format, const BYTE *data, std::size_t size, void *user) {
    auto &self = *static_cast<Receiver *>(user);
    self.format = *format;
    self.bytes.assign(data, data + size);
    self.calls++;
    if (self.reenter) {
      auto &device = self.source->device();
      self.close_result = device.Close(&device);
      self.free_result = device.Free(&device);
      self.open_result = device.Open(&device, receive, user);
      self.format_result = device.SetFormat(&device, format, 960);
      self.nested = self.source->pump();
      self.retired = self.source->retire();
      self.submitted = self.source->submit({1, 0, true, self.bytes});
      self.skipped = self.source->skip(960);
      self.reset = self.source->reset_capture(1);
    }
    if (self.throws)
      throw std::runtime_error("test-only callback exception");
    return self.error;
  }
};
std::vector<std::uint8_t> input() {
  std::vector<std::uint8_t> bytes(3840);
  for (std::size_t i = 0; i < 960; ++i) {
    bytes[i * 4] = 0x18;
    bytes[i * 4 + 1] = 0xfc; // -1000
    bytes[i * 4 + 2] = 0x48;
    bytes[i * 4 + 3] = 0xf4; // -3000
  }
  return bytes;
}
} // namespace

TEST_CASE("Public AUDIN capture reset preserves receiver and refuses stale input epochs") {
  AudinSource source;
  auto &device = source.device();
  Receiver receiver;
  const auto pcm = format();
  REQUIRE(source.reset_capture(1).status == AudinCaptureResetStatus::inactive);
  REQUIRE(device.SetFormat(&device, &pcm, 960) == CHANNEL_RC_OK);
  REQUIRE(device.Open(&device, Receiver::receive, &receiver) == CHANNEL_RC_OK);
  const auto samples = input();
  REQUIRE(source.submit({1, 0, true, samples}) == CaptureStatus::accepted);
  REQUIRE(source.submit({1, 20000, false, samples}) == CaptureStatus::accepted);
  REQUIRE(source.pump() == AudinPumpStatus::delivered);
  REQUIRE(receiver.bytes == samples);
  REQUIRE(source.stats()->capture.queue.queued_frames == 960);
  REQUIRE(source.reset_capture(0).status == AudinCaptureResetStatus::invalid);
  REQUIRE(source.reset_capture(2).status == AudinCaptureResetStatus::stale);
  REQUIRE(source.stats()->capture.queue.queued_frames == 960);
  const auto reset = source.reset_capture(1);
  REQUIRE(reset.status == AudinCaptureResetStatus::reset);
  REQUIRE(reset.epoch == 2);
  REQUIRE(source.stats()->capture_resets == 1);
  REQUIRE(source.stats()->opened);
  REQUIRE(source.stats()->capture.active);
  REQUIRE(source.stats()->capture.buffering);
  REQUIRE(source.stats()->capture.queue.queued_frames == 0);
  REQUIRE(source.stats()->capture.queue.reset_discarded_frames == 960);
  REQUIRE(source.reset_capture(1).status == AudinCaptureResetStatus::stale);
  REQUIRE(source.stats()->capture_resets == 1);
  REQUIRE(source.pump() == AudinPumpStatus::delivered);
  REQUIRE(receiver.calls == 2);
  REQUIRE(receiver.format.nChannels == 2);
  REQUIRE(std::all_of(receiver.bytes.begin(), receiver.bytes.end(), [](auto v) { return v == 0; }));
  REQUIRE(source.submit({1, 40000, false, samples}) == CaptureStatus::stale);
  REQUIRE(source.submit({2, 0, false, samples}) == CaptureStatus::invalid);
  REQUIRE(source.submit({2, 0, true, samples}) == CaptureStatus::accepted);
  REQUIRE(source.submit({2, 20000, false, samples}) == CaptureStatus::accepted);
  REQUIRE(source.pump() == AudinPumpStatus::delivered);
  REQUIRE(receiver.bytes == samples);
  REQUIRE(receiver.calls == 3);
  REQUIRE(device.Close(&device) == CHANNEL_RC_OK);
  REQUIRE(source.reset_capture(2).status == AudinCaptureResetStatus::inactive);
  REQUIRE(device.Open(&device, Receiver::receive, &receiver) == CHANNEL_RC_OK);
  REQUIRE(source.stats()->epoch == 3);
  REQUIRE(source.retire());
  REQUIRE(source.reset_capture(3).status == AudinCaptureResetStatus::inactive);
}

TEST_CASE("Public AUDIN virtual source validates pinned device format and callback budgets") {
  AudinSource source;
  auto &device = source.device();
  Receiver receiver;
  REQUIRE(device.Open);
  REQUIRE(device.Close);
  REQUIRE(device.Free);
  REQUIRE(device.FormatSupported);
  REQUIRE(device.SetFormat);
  REQUIRE(source.pump() == AudinPumpStatus::inactive);
  REQUIRE(device.Open(&device, Receiver::receive, &receiver) != CHANNEL_RC_OK);
  REQUIRE_FALSE(device.FormatSupported(&device, nullptr));
  for (const auto channels : {UINT16{1}, UINT16{2}}) {
    const auto pcm = format(channels);
    REQUIRE(device.FormatSupported(&device, &pcm));
    REQUIRE(device.SetFormat(&device, &pcm, 960) == CHANNEL_RC_OK);
  }
  auto invalid = format();
  invalid.nAvgBytesPerSec++;
  REQUIRE_FALSE(device.FormatSupported(&device, &invalid));
  REQUIRE(device.SetFormat(&device, &invalid, 960) != CHANNEL_RC_OK);
  invalid = format();
  invalid.nBlockAlign++;
  REQUIRE_FALSE(device.FormatSupported(&device, &invalid));
  invalid = format();
  invalid.cbSize = 1;
  REQUIRE_FALSE(device.FormatSupported(&device, &invalid));
  BYTE extra = 0;
  invalid = format();
  invalid.data = &extra;
  REQUIRE_FALSE(device.FormatSupported(&device, &invalid));
  invalid = format();
  invalid.nSamplesPerSec = 44100;
  REQUIRE_FALSE(device.FormatSupported(&device, &invalid));
  const auto pcm = format();
  REQUIRE(device.SetFormat(&device, &pcm, 0) != CHANNEL_RC_OK);
  REQUIRE(device.SetFormat(&device, &pcm, 4801) != CHANNEL_RC_OK);
  REQUIRE(device.Open(&device, nullptr, &receiver) != CHANNEL_RC_OK);
  REQUIRE(device.Open(&device, Receiver::receive, nullptr) != CHANNEL_RC_OK);
  REQUIRE(device.Open(&device, Receiver::receive, &receiver) == CHANNEL_RC_OK);
  REQUIRE(device.Open(&device, Receiver::receive, &receiver) != CHANNEL_RC_OK);
  REQUIRE(device.SetFormat(&device, &pcm, 960) != CHANNEL_RC_OK);
  REQUIRE(source.stats()->epoch == 1);
  REQUIRE(source.pump() == AudinPumpStatus::delivered);
  REQUIRE(receiver.calls == 1);
  REQUIRE(receiver.bytes.size() == 3840);
  REQUIRE(std::ranges::all_of(receiver.bytes, [](auto byte) { return byte == 0; }));
  REQUIRE(source.stats()->emitted_frames == 960);
  REQUIRE(source.stats()->capture.buffering_silence_frames == 960);
  REQUIRE(source.retire());
}

TEST_CASE("Public AUDIN callback projects copied mono format and exact signed PCM bytes") {
  AudinSource source;
  auto &device = source.device();
  Receiver receiver;
  auto mono = format(1);
  REQUIRE(device.SetFormat(&device, &mono, 960) == CHANNEL_RC_OK);
  mono.nChannels = 2; // Backend owns an immutable PCM descriptor copy.
  REQUIRE(device.Open(&device, Receiver::receive, &receiver) == CHANNEL_RC_OK);
  const auto bytes = input();
  REQUIRE(source.submit({1, 0, true, bytes}) == CaptureStatus::accepted);
  REQUIRE(source.submit({1, 20000, false, bytes}) == CaptureStatus::accepted);
  REQUIRE(source.pump() == AudinPumpStatus::delivered);
  REQUIRE(receiver.format.nChannels == 1);
  REQUIRE(receiver.format.nBlockAlign == 2);
  REQUIRE(receiver.format.nAvgBytesPerSec == 96000);
  REQUIRE(receiver.bytes.size() == 1920);
  for (std::size_t i = 0; i < 960; ++i) {
    REQUIRE(receiver.bytes[i * 2] == 0x30); // -2000 S16LE.
    REQUIRE(receiver.bytes[i * 2 + 1] == 0xf8);
  }
  REQUIRE(device.Close(&device) == CHANNEL_RC_OK);
  REQUIRE(source.stats()->capture.queue.queued_frames == 0);
  REQUIRE(source.pump() == AudinPumpStatus::inactive);
  REQUIRE(source.retire());
}

TEST_CASE(
    "Public AUDIN repeated close reopen retires input epoch and never replays prior capture") {
  AudinSource source;
  auto &device = source.device();
  const auto pcm = format();
  Receiver first, second;
  const auto bytes = input();
  REQUIRE(device.SetFormat(&device, &pcm, 960) == CHANNEL_RC_OK);
  REQUIRE(device.Open(&device, Receiver::receive, &first) == CHANNEL_RC_OK);
  REQUIRE(source.submit({1, 0, true, bytes}) == CaptureStatus::accepted);
  REQUIRE(device.Close(&device) == CHANNEL_RC_OK);
  REQUIRE(device.Close(&device) == CHANNEL_RC_OK);
  REQUIRE(source.stats()->capture.queue.reset_discarded_frames == 960);
  REQUIRE(device.Open(&device, Receiver::receive, &second) == CHANNEL_RC_OK);
  REQUIRE(source.stats()->epoch == 2);
  REQUIRE(source.submit({1, 20000, false, bytes}) == CaptureStatus::stale);
  REQUIRE(source.pump() == AudinPumpStatus::delivered);
  REQUIRE(first.calls == 0);
  REQUIRE(second.calls == 1);
  REQUIRE(std::ranges::all_of(second.bytes, [](auto byte) { return byte == 0; }));
  REQUIRE(source.submit({2, 0, true, bytes}) == CaptureStatus::accepted);
  REQUIRE(source.submit({2, 20000, false, bytes}) == CaptureStatus::accepted);
  REQUIRE(source.pump() == AudinPumpStatus::delivered);
  REQUIRE(second.bytes == bytes);
  REQUIRE(source.retire());
}

TEST_CASE("Public AUDIN receive callback cannot reenter or release borrowed resources") {
  AudinSource source;
  auto &device = source.device();
  const auto pcm = format();
  Receiver receiver;
  receiver.reenter = true;
  receiver.source = &source;
  REQUIRE(device.SetFormat(&device, &pcm, 960) == CHANNEL_RC_OK);
  REQUIRE(device.Open(&device, Receiver::receive, &receiver) == CHANNEL_RC_OK);
  REQUIRE(source.pump() == AudinPumpStatus::delivered);
  REQUIRE(receiver.close_result != CHANNEL_RC_OK);
  REQUIRE(receiver.free_result != CHANNEL_RC_OK);
  REQUIRE(receiver.open_result != CHANNEL_RC_OK);
  REQUIRE(receiver.format_result != CHANNEL_RC_OK);
  REQUIRE(receiver.nested == AudinPumpStatus::invalid);
  REQUIRE_FALSE(receiver.retired);
  REQUIRE(receiver.submitted == CaptureStatus::inactive);
  REQUIRE(receiver.skipped == CaptureStatus::inactive);
  REQUIRE(receiver.reset.status == AudinCaptureResetStatus::busy);
  REQUIRE(receiver.reset.epoch == 0);
  REQUIRE(source.stats()->opened);
  REQUIRE(source.retire());
}

TEST_CASE(
    "Public AUDIN callback status or exception stops capture and clears receiver before reopen") {
  for (const auto throws : {false, true}) {
    AudinSource source;
    auto &device = source.device();
    const auto pcm = format();
    Receiver failed, recovered;
    failed.throws = throws;
    failed.error = CHANNEL_RC_NOT_CONNECTED;
    REQUIRE(device.SetFormat(&device, &pcm, 960) == CHANNEL_RC_OK);
    REQUIRE(device.Open(&device, Receiver::receive, &failed) == CHANNEL_RC_OK);
    REQUIRE(source.pump() == AudinPumpStatus::failed);
    REQUIRE_FALSE(source.stats()->opened);
    REQUIRE(source.stats()->callback_failures == 1);
    REQUIRE(source.stats()->last_error != CHANNEL_RC_OK);
    REQUIRE(source.pump() == AudinPumpStatus::inactive);
    REQUIRE(failed.calls == 1);
    REQUIRE(device.Open(&device, Receiver::receive, &recovered) == CHANNEL_RC_OK);
    REQUIRE(source.stats()->epoch == 2);
    REQUIRE(source.pump() == AudinPumpStatus::delivered);
    REQUIRE(recovered.calls == 1);
    REQUIRE(source.stats()->last_error == CHANNEL_RC_OK);
    REQUIRE(source.retire());
  }
}

TEST_CASE(
    "Public AUDIN retirement belongs to owner and delayed host Free is idempotent across threads") {
  AudinSource source;
  auto &device = source.device();
  const auto pcm = format();
  Receiver receiver;
  REQUIRE(device.SetFormat(&device, &pcm, 960) == CHANNEL_RC_OK);
  REQUIRE(device.Open(&device, Receiver::receive, &receiver) == CHANNEL_RC_OK);
  bool retired = true, supported = true, stats = true;
  UINT closed = 0, freed = 0;
  AudinPumpStatus pumped = AudinPumpStatus::delivered;
  AudinCaptureReset reset{AudinCaptureResetStatus::reset};
  std::thread wrong([&] {
    retired = source.retire();
    supported = device.FormatSupported(&device, &pcm) != FALSE;
    stats = source.stats().has_value();
    closed = device.Close(&device);
    freed = device.Free(&device);
    pumped = source.pump();
    reset = source.reset_capture(1);
  });
  wrong.join();
  REQUIRE_FALSE(retired);
  REQUIRE_FALSE(supported);
  REQUIRE_FALSE(stats);
  REQUIRE(closed != CHANNEL_RC_OK);
  REQUIRE(freed != CHANNEL_RC_OK);
  REQUIRE(pumped == AudinPumpStatus::inactive);
  REQUIRE(reset.status == AudinCaptureResetStatus::inactive);
  REQUIRE(reset.epoch == 0);
  REQUIRE(source.stats()->opened);
  REQUIRE(source.retire());
  REQUIRE(source.retired());
  std::thread host([&] {
    freed = device.Free(&device);
    closed = device.Close(&device);
  });
  host.join();
  REQUIRE(freed == CHANNEL_RC_OK);
  REQUIRE(closed == CHANNEL_RC_OK);
  REQUIRE(device.Free(&device) == CHANNEL_RC_OK);
  REQUIRE_FALSE(device.FormatSupported(&device, &pcm));
  REQUIRE(device.Open(&device, Receiver::receive, &receiver) != CHANNEL_RC_OK);
  REQUIRE(device.SetFormat(&device, &pcm, 960) != CHANNEL_RC_OK);
  REQUIRE_FALSE(source.stats()->opened);
  REQUIRE(source.pump() == AudinPumpStatus::inactive);
}
