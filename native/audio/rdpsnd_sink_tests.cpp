#include "rdpsnd_sink.hpp"
#include <catch2/catch_test_macros.hpp>
#include <vector>

using namespace bridge::audio;
namespace {
AUDIO_FORMAT format(UINT32 rate = 48000, UINT16 channels = 2, UINT16 bits = 16) {
  AUDIO_FORMAT value{};
  value.wFormatTag = WAVE_FORMAT_PCM;
  value.nChannels = channels;
  value.nSamplesPerSec = rate;
  value.wBitsPerSample = bits;
  value.nBlockAlign = static_cast<UINT16>(channels * (bits / 8U));
  value.nAvgBytesPerSec = rate * value.nBlockAlign;
  return value;
}
UINT play(rdpsndDevicePlugin &device, std::span<const std::uint8_t> bytes) {
  return device.Play(&device, bytes.data(), bytes.size());
}
} // namespace

TEST_CASE("RDPSND availability separates source samples from open device ownership") {
  RdpsndSink sink;
  auto &device = sink.device();
  const auto pcm = format();
  const std::array<std::uint8_t, 4> input{0, 128, 255, 127};
  REQUIRE(sink.stats()->availability == SourceAvailability::waiting);
  REQUIRE_FALSE(sink.ready());
  REQUIRE(device.Open(&device, &pcm, 0));
  REQUIRE(sink.ready());
  REQUIRE(sink.stats()->availability == SourceAvailability::waiting);
  const auto opened_revision = sink.stats()->stream_revision;
  REQUIRE(play(device, input) == 1);
  REQUIRE(sink.stats()->availability == SourceAvailability::ready);
  REQUIRE(sink.stats()->stream_revision == opened_revision);
  const auto invalid = format(96000);
  REQUIRE_FALSE(device.Open(&device, &invalid, 0));
  REQUIRE(sink.stats()->availability == SourceAvailability::ready);
  REQUIRE_FALSE(sink.reset_stream(SourceAvailability::ready));
  REQUIRE_FALSE(sink.reset_stream(static_cast<SourceAvailability>(99)));
  REQUIRE(sink.stats()->stream_revision == opened_revision);
  REQUIRE(sink.stats()->queue.queued_frames == 1);
  for (const auto state :
       {SourceAvailability::suspended, SourceAvailability::closed, SourceAvailability::failed,
        SourceAvailability::unavailable, SourceAvailability::waiting}) {
    REQUIRE(sink.reset_stream(state));
    REQUIRE(sink.stats()->availability == state);
    REQUIRE(sink.ready());
    REQUIRE(sink.stats()->queue.queued_frames == 0);
    REQUIRE(sink.packet(1000000).status == PacketStatus::idle);
    REQUIRE(play(device, input) == 1);
    REQUIRE(sink.stats()->availability == SourceAvailability::ready);
  }
  REQUIRE(device.Play(&device, nullptr, 4) == 0);
  REQUIRE(sink.stats()->availability == SourceAvailability::failed);
  REQUIRE(play(device, input) == 1);
  REQUIRE(sink.stats()->availability == SourceAvailability::ready);
  device.Close(&device);
  REQUIRE(sink.stats()->availability == SourceAvailability::closed);
  REQUIRE_FALSE(sink.ready());
  REQUIRE(device.Open(&device, &pcm, 0));
  REQUIRE(sink.stats()->availability == SourceAvailability::waiting);
  REQUIRE(sink.retire());
  REQUIRE(sink.stats()->availability == SourceAvailability::closed);
  REQUIRE_FALSE(sink.reset_stream());
}

TEST_CASE("RDPSND PCM packetization applies volume and resets epochs before borrowed playback") {
  RdpsndSink sink;
  auto &device = sink.device();
  const auto pcm = format(8000, 1, 8);
  REQUIRE(sink.packet(0).status == PacketStatus::invalid);
  REQUIRE(device.Open(&device, &pcm, 0));
  REQUIRE(sink.packet(0).status == PacketStatus::idle);
  REQUIRE(device.SetVolume(&device, 0x0000ffffU));
  const std::vector<std::uint8_t> input(160, 255);
  REQUIRE(play(device, input) == 20);
  const auto first = sink.packet(1000000);
  REQUIRE(first.status == PacketStatus::ready);
  REQUIRE(first.frames == 955);
  REQUIRE(first.silence_frames == 5);
  REQUIRE(first.discontinuity);
  REQUIRE(first.timestamp_us == 1000000);
  for (std::size_t at = 0; at < first.frames * 4; at += 4) {
    REQUIRE(first.bytes[at] == 0);
    REQUIRE(first.bytes[at + 1] == 127);
    REQUIRE(first.bytes[at + 2] == 0);
    REQUIRE(first.bytes[at + 3] == 0);
  }
  REQUIRE(sink.packet(1019999).status == PacketStatus::idle);
  REQUIRE(sink.packet(1020000).silence_frames == 960);
  REQUIRE(sink.reset_stream());
  REQUIRE(sink.packet(1040000).status == PacketStatus::idle);
  REQUIRE(play(device, input) == 20);
  REQUIRE(sink.packet(1040000).discontinuity);
  REQUIRE(sink.stats()->packets.packets == 3);
  REQUIRE(sink.stats()->packets.discontinuities == 2);
  device.Close(&device);
  REQUIRE(sink.packet(1060000).status == PacketStatus::invalid);
  REQUIRE(sink.retire());
  REQUIRE(sink.stats()->packets.packets == 3);
  REQUIRE(sink.packet(1060000).status == PacketStatus::invalid);
}

TEST_CASE("RDPSND public device validates PCM descriptors without mutating formats") {
  RdpsndSink sink;
  auto &device = sink.device();
  for (const auto rate : {8000U, 44100U, 48000U})
    for (const auto channels : {UINT16{1}, UINT16{2}})
      for (const auto bits : {UINT16{8}, UINT16{16}}) {
        auto valid = format(rate, channels, bits);
        REQUIRE(device.FormatSupported(&device, &valid));
        REQUIRE(valid.nBlockAlign == channels * bits / 8U);
      }
  REQUIRE_FALSE(device.FormatSupported(&device, nullptr));
  REQUIRE_FALSE(device.FormatSupported(nullptr, nullptr));
  auto invalid = format();
  SECTION("tag") { invalid.wFormatTag = WAVE_FORMAT_IEEE_FLOAT; }
  SECTION("rate") { invalid.nSamplesPerSec = 96000; }
  SECTION("channels") { invalid.nChannels = 6; }
  SECTION("width") { invalid.wBitsPerSample = 24; }
  SECTION("alignment") { invalid.nBlockAlign = 2; }
  SECTION("average") { invalid.nAvgBytesPerSec = 0; }
  SECTION("extra length") { invalid.cbSize = 1; }
  SECTION("extra pointer") {
    BYTE byte = 0;
    invalid.data = &byte;
    REQUIRE_FALSE(device.FormatSupported(&device, &invalid));
    return;
  }
  REQUIRE_FALSE(device.FormatSupported(&device, &invalid));
}

TEST_CASE("RDPSND default PCM uses source rate and layout without borrowed extra data") {
  RdpsndSink sink;
  auto &device = sink.device();
  auto desired = format(44100, 1, 4);
  desired.wFormatTag = WAVE_FORMAT_ADPCM;
  desired.cbSize = 1;
  BYTE extra = 42;
  desired.data = &extra;
  AUDIO_FORMAT result{};
  REQUIRE(device.DefaultFormat(&device, &desired, &result));
  REQUIRE(result.wFormatTag == WAVE_FORMAT_PCM);
  REQUIRE(result.nSamplesPerSec == 44100);
  REQUIRE(result.nChannels == 1);
  REQUIRE(result.wBitsPerSample == 16);
  REQUIRE(result.nBlockAlign == 2);
  REQUIRE(result.nAvgBytesPerSec == 88200);
  REQUIRE(result.cbSize == 0);
  REQUIRE(result.data == nullptr);
  REQUIRE(device.FormatSupported(&device, &result));
  REQUIRE(device.PlayEx == nullptr);
  REQUIRE_FALSE(device.DefaultFormat(&device, nullptr, &result));
  desired.nSamplesPerSec = 96000;
  REQUIRE_FALSE(device.DefaultFormat(&device, &desired, &result));
  REQUIRE(result.nSamplesPerSec == 44100);
}

TEST_CASE("RDPSND public Play returns bounded latency and copies PCM for the consumer") {
  RdpsndSink sink;
  auto &device = sink.device();
  const auto pcm = format();
  REQUIRE(device.Open(&device, &pcm, 500));
  const std::vector<std::uint8_t> first{0, 128, 255, 127, 255, 255, 0, 0}, second{1, 0, 254, 255};
  REQUIRE(play(device, first) == 1);
  REQUIRE(play(device, second) == 1);
  std::vector<std::uint8_t> output(12), expected = first;
  expected.insert(expected.end(), second.begin(), second.end());
  const auto result = sink.read(output);
  REQUIRE(result.status == QueueStatus::accepted);
  REQUIRE(result.frames == 3);
  REQUIRE(result.discontinuity);
  REQUIRE(output == expected);
  REQUIRE(sink.stats()->queue.consumed_frames == 3);
}

TEST_CASE("RDPSND volume scales signed stereo independently with full gain identity") {
  RdpsndSink sink;
  auto &device = sink.device();
  const auto pcm = format(48000, 1);
  REQUIRE(device.Open(&device, &pcm, 0));
  REQUIRE(device.GetVolume(&device) == 0xffffffffU);
  REQUIRE(device.SetVolume(&device, 0xffff8000U));
  REQUIRE(device.GetVolume(&device) == 0xffff8000U);
  const std::vector<std::uint8_t> input{0, 128, 255, 127};
  REQUIRE(play(device, input) == 1);
  std::vector<std::uint8_t> output(8);
  REQUIRE(sink.read(output).frames == 2);
  const std::vector<std::uint8_t> expected{244, 251, 0, 128, 12, 4, 255, 127};
  REQUIRE(output == expected);
  REQUIRE(device.SetVolume(&device, 0));
  REQUIRE(play(device, input) == 1);
  REQUIRE(sink.read(output).frames == 2);
  REQUIRE(output == std::vector<std::uint8_t>(8));
}

TEST_CASE("RDPSND public Play normalizes low-rate unsigned mono into stereo PCM") {
  RdpsndSink sink;
  auto &device = sink.device();
  const auto pcm = format(8000, 1, 8);
  REQUIRE(device.Open(&device, &pcm, 0));
  const std::array<std::uint8_t, 2> input{0, 255};
  REQUIRE(play(device, input) == 1);
  std::vector<std::uint8_t> output(28);
  REQUIRE(sink.read(output).frames == 7);
  const std::array<std::array<std::uint8_t, 2>, 7> samples{
      {{0, 128}, {128, 170}, {0, 213}, {128, 255}, {0, 42}, {128, 84}, {0, 127}}};
  std::vector<std::uint8_t> expected;
  for (const auto sample : samples)
    for (unsigned channel = 0; channel < 2; ++channel)
      expected.insert(expected.end(), sample.begin(), sample.end());
  REQUIRE(output == expected);
}

TEST_CASE("RDPSND overflow clears stale PCM and marks recovery as discontinuous") {
  RdpsndSink sink;
  auto &device = sink.device();
  const auto pcm = format();
  REQUIRE(device.Open(&device, &pcm, 0));
  const std::vector<std::uint8_t> big(19200), rest(3840), one{0, 128, 255, 127};
  REQUIRE(play(device, big) == 100);
  REQUIRE(play(device, rest) == 120);
  REQUIRE(play(device, one) == 0);
  const auto stats = *sink.stats();
  REQUIRE(stats.overflow_resets == 1);
  REQUIRE(stats.queue.dropped_packets == 1);
  REQUIRE(stats.queue.dropped_frames == 1);
  REQUIRE(stats.queue.reset_discarded_frames == 5760);
  REQUIRE(stats.queue.queued_frames == 0);
  REQUIRE(stats.availability == SourceAvailability::waiting);
  REQUIRE(play(device, one) == 1);
  REQUIRE(sink.stats()->availability == SourceAvailability::ready);
  std::vector<std::uint8_t> output(4);
  REQUIRE(sink.read(output).discontinuity);
  REQUIRE(output == one);
}

TEST_CASE("RDPSND malformed or over-capacity packets reset interpolation history") {
  RdpsndSink sink;
  auto &device = sink.device();
  const auto pcm = format(8000, 1);
  REQUIRE(device.Open(&device, &pcm, 0));
  const std::array<std::uint8_t, 2> first{0, 128}, next{255, 127};
  REQUIRE(play(device, first) == 1);
  SECTION("misaligned") { REQUIRE(play(device, std::span(first).first(1)) == 0); }
  SECTION("normalized capacity") {
    const std::vector<std::uint8_t> input(1602);
    REQUIRE(play(device, input) == 0);
  }
  SECTION("input capacity") {
    const std::vector<std::uint8_t> input(65538);
    REQUIRE(play(device, input) == 0);
  }
  SECTION("null pointer") { REQUIRE(device.Play(&device, nullptr, 2) == 0); }
  SECTION("empty") { REQUIRE(device.Play(&device, first.data(), 0) == 0); }
  REQUIRE(sink.stats()->rejected_packets == 1);
  REQUIRE(sink.stats()->queue.queued_frames == 0);
  REQUIRE(play(device, next) == 1);
  std::vector<std::uint8_t> output(4);
  REQUIRE(sink.read(output).frames == 1);
  REQUIRE(output == std::vector<std::uint8_t>{255, 127, 255, 127});
}

TEST_CASE("RDPSND close, failed open and reopen preserve the explicit lifetime contract") {
  RdpsndSink sink;
  auto &device = sink.device();
  const std::vector<std::uint8_t> input{0, 128, 255, 127};
  std::vector<std::uint8_t> output(4, 42);
  REQUIRE(play(device, input) == 0);
  REQUIRE(sink.read(output).status == QueueStatus::invalid);
  REQUIRE(output == std::vector<std::uint8_t>(4, 42));
  const auto pcm = format();
  REQUIRE(device.Open(&device, &pcm, 0));
  REQUIRE(play(device, input) == 1);
  const auto invalid = format(96000);
  REQUIRE_FALSE(device.Open(&device, &invalid, 0));
  REQUIRE(sink.read(output).frames == 1);
  REQUIRE(output == input);
  REQUIRE(play(device, input) == 1);
  device.Close(&device);
  device.Close(&device);
  REQUIRE(play(device, input) == 0);
  REQUIRE(sink.stats()->queue.queued_frames == 0);
  REQUIRE(sink.stats()->queue.reset_discarded_frames == 1);
  REQUIRE(device.Open(&device, &pcm, 0));
  REQUIRE(play(device, input) == 1);
  REQUIRE(sink.read(output).discontinuity);
}

TEST_CASE("RDPSND callbacks refuse foreign threads and retire before delayed host Free") {
  RdpsndSink sink;
  auto &device = sink.device();
  const auto pcm = format();
  REQUIRE(device.Open(&device, &pcm, 0));
  const std::vector<std::uint8_t> input{0, 128, 255, 127};
  REQUIRE(play(device, input) == 1);
  BOOL foreign_open = TRUE, foreign_volume = TRUE, foreign_supported = TRUE;
  UINT foreign_play = 99;
  QueueStatus foreign_read = QueueStatus::accepted;
  PacketStatus foreign_packet = PacketStatus::ready;
  bool foreign_stats = true, foreign_retire = true, foreign_reset = true;
  std::vector<std::uint8_t> output(4, 77);
  std::thread foreign([&] {
    foreign_open = device.Open(&device, &pcm, 0);
    foreign_volume = device.SetVolume(&device, 0);
    foreign_supported = device.FormatSupported(&device, &pcm);
    foreign_play = play(device, input);
    foreign_read = sink.read(output).status;
    foreign_packet = sink.packet(0).status;
    foreign_stats = sink.stats().has_value();
    foreign_retire = sink.retire();
    foreign_reset = sink.reset_stream(SourceAvailability::closed);
    device.Close(&device);
    device.Free(&device);
  });
  foreign.join();
  REQUIRE_FALSE(foreign_open);
  REQUIRE_FALSE(foreign_volume);
  REQUIRE_FALSE(foreign_supported);
  REQUIRE(foreign_play == 0);
  REQUIRE(foreign_read == QueueStatus::invalid);
  REQUIRE(foreign_packet == PacketStatus::invalid);
  REQUIRE_FALSE(foreign_stats);
  REQUIRE_FALSE(foreign_retire);
  REQUIRE_FALSE(foreign_reset);
  REQUIRE_FALSE(sink.retired());
  REQUIRE(output == std::vector<std::uint8_t>(4, 77));
  REQUIRE(device.GetVolume(&device) == 0xffffffffU);
  REQUIRE(sink.stats()->queue.queued_frames == 1);
  REQUIRE(sink.stats()->availability == SourceAvailability::ready);
  REQUIRE(sink.retire());
  REQUIRE(sink.retired());
  REQUIRE(sink.stats()->queue.queued_frames == 0);
  REQUIRE(sink.stats()->queue.reset_discarded_frames == 1);
  std::thread delayed([&] { device.Free(&device); });
  delayed.join();
  device.Free(&device);
  REQUIRE_FALSE(device.Open(&device, &pcm, 0));
  REQUIRE_FALSE(device.SetVolume(&device, 0));
  REQUIRE(play(device, input) == 0);
  REQUIRE(sink.read(output).status == QueueStatus::invalid);
}
