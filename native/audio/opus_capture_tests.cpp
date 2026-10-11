#include "capture.hpp"
#include "capture_handoff.hpp"
#include "opus_capture.hpp"
#include "opus_encoder.hpp"
#include <algorithm>
#include <bit>
#include <catch2/catch_test_macros.hpp>
#include <stdexcept>
#include <vector>
using namespace bridge::audio;
namespace ipc = bridge::ipc;
namespace {
std::vector<std::uint8_t> pcm(std::size_t packet) {
  std::vector<std::uint8_t> result(3840);
  for (std::size_t i = 0; i < 1920; ++i) {
    const auto value =
        static_cast<std::int16_t>(static_cast<int>((packet * 1920 + i) % 24000) - 12000);
    const auto word = std::bit_cast<std::uint16_t>(value);
    result[i * 2] = static_cast<std::uint8_t>(word);
    result[i * 2 + 1] = static_cast<std::uint8_t>(word >> 8);
  }
  return result;
}
ipc::microphone::opus::Packet packet(std::span<const std::uint8_t> bytes, std::uint64_t pts,
                                     std::uint16_t delay, bool boundary = false,
                                     std::uint64_t epoch = 1) {
  return {epoch, pts, delay, boundary, bytes};
}
} // namespace
TEST_CASE("Opus capture removes measured delay and reblocks against an independent linear SDK PCM "
          "model") {
  for (const auto delay : {0U, 1U, 312U, 959U, 960U}) {
    SoftwareOpusEncoder encoder;
    SoftwareOpusDecoder reference;
    OpusCaptureDecoder capture(1);
    std::vector<std::uint8_t> expected, actual;
    std::size_t outputs = 0;
    for (std::size_t i = 0; i < 20; ++i) {
      const auto encoded = encoder.encode({pcm(i), i * 20000});
      const auto raw = reference.decode({encoded.bytes, i * 20000});
      expected.insert(expected.end(), raw.pcm.begin(), raw.pcm.end());
      const auto projected = capture.decode(
          packet(encoded.bytes, i * 20000, static_cast<std::uint16_t>(delay), i == 0));
      if (projected) {
        REQUIRE(projected->epoch == 1);
        REQUIRE(projected->timestamp_us == outputs * 20000);
        REQUIRE(projected->discontinuity == (outputs == 0));
        REQUIRE(projected->pcm.size() == 3840);
        actual.insert(actual.end(), projected->pcm.begin(), projected->pcm.end());
        ++outputs;
      } else
        REQUIRE(i == 0);
      REQUIRE(capture.stats().queued_frames < 960);
      REQUIRE(capture.stats().decoded_packets == i + 1);
    }
    REQUIRE(outputs == (delay == 0 ? 20U : 19U));
    REQUIRE(std::ranges::equal(actual, std::span(expected).subspan(delay * 4, actual.size())));
    REQUIRE(capture.stats().queued_frames == (delay == 0 ? 0U : 960 - delay));
    REQUIRE(capture.stats().skipped_delay_frames == delay);
    REQUIRE(capture.stats().output_packets == outputs);
    REQUIRE_FALSE(capture.stats().priming);
  }
}
TEST_CASE("Opus capture rejects epoch metadata and clock changes atomically before predictive "
          "continuation") {
  SoftwareOpusEncoder encoder;
  OpusCaptureDecoder capture(1), reference(1);
  const auto first = encoder.encode({pcm(0), 0});
  const std::vector<std::uint8_t> a(first.bytes.begin(), first.bytes.end());
  const auto second = encoder.encode({pcm(1), 20000});
  const std::vector<std::uint8_t> b(second.bytes.begin(), second.bytes.end());
  const auto third = encoder.encode({pcm(2), 40000});
  const std::vector<std::uint8_t> c(third.bytes.begin(), third.bytes.end());
  REQUIRE_FALSE(capture.decode(packet(a, 0, 312, true)));
  REQUIRE_FALSE(reference.decode(packet(a, 0, 312, true)));
  const auto borrowed = *capture.decode(packet(b, 20000, 312));
  reference.decode(packet(b, 20000, 312));
  const std::vector<std::uint8_t> saved(borrowed.pcm.begin(), borrowed.pcm.end());
  const auto stats = capture.stats();
  for (const auto bad : {packet(c, 40000, 312, false, 0), packet(c, 40000, 312, false, 2),
                         packet(c, 40000, 961), packet(c, 40000, 313), packet(c, 20000, 312, true),
                         packet(c, 40001, 312), packet(c, UINT64_MAX - 19999, 312)}) {
    REQUIRE_THROWS_AS(capture.decode(bad), std::invalid_argument);
    REQUIRE(std::ranges::equal(borrowed.pcm, saved));
    REQUIRE(capture.stats().queued_frames == stats.queued_frames);
    REQUIRE(capture.stats().decoded_packets == stats.decoded_packets);
    REQUIRE(capture.stats().output_packets == stats.output_packets);
    REQUIRE_FALSE(capture.stats().failed);
  }
  const auto actual = *capture.decode(packet(c, 40000, 312));
  const auto expected = *reference.decode(packet(c, 40000, 312));
  REQUIRE(std::ranges::equal(actual.pcm, expected.pcm));
  REQUIRE(actual.timestamp_us == 20000);
  OpusCaptureDecoder fresh(1);
  REQUIRE_THROWS_AS(fresh.decode(packet(a, 0, 312)), std::invalid_argument);
  REQUIRE(fresh.stats().decoded_packets == 0);
  REQUIRE_THROWS_AS(OpusCaptureDecoder(0), std::invalid_argument);
}
TEST_CASE("Opus capture forward discontinuity and new epochs wipe carry and keep first output "
          "capture time") {
  SoftwareOpusEncoder encoder;
  OpusCaptureDecoder capture(1), fresh(1);
  const auto first = encoder.encode({pcm(0), 0});
  const std::vector<std::uint8_t> a(first.bytes.begin(), first.bytes.end());
  const auto second = encoder.encode({pcm(1), 20000});
  const std::vector<std::uint8_t> b(second.bytes.begin(), second.bytes.end());
  capture.decode(packet(a, 0, 312, true));
  const auto borrowed = *capture.decode(packet(b, 20000, 312));
  REQUIRE(capture.stats().queued_frames == 648);
  REQUIRE_FALSE(capture.decode(packet(a, 200000, 312, true)));
  REQUIRE(std::ranges::all_of(borrowed.pcm, [](auto value) { return value == 0; }));
  REQUIRE(capture.stats().reset_discarded_frames == 648);
  fresh.decode(packet(a, 200000, 312, true));
  const auto restarted = *capture.decode(packet(b, 220000, 312));
  const auto expected = *fresh.decode(packet(b, 220000, 312));
  REQUIRE(std::ranges::equal(restarted.pcm, expected.pcm));
  REQUIRE(restarted.timestamp_us == 200000);
  REQUIRE(restarted.discontinuity);
  for (const auto epoch : {std::uint64_t{0}, std::uint64_t{1}}) {
    REQUIRE_THROWS_AS(capture.reset(epoch), std::invalid_argument);
    REQUIRE(std::ranges::equal(restarted.pcm, expected.pcm));
  }
  capture.reset(2);
  REQUIRE(capture.stats().epoch == 2);
  REQUIRE(capture.stats().queued_frames == 0);
  REQUIRE(capture.stats().priming);
  REQUIRE(std::ranges::all_of(restarted.pcm, [](auto value) { return value == 0; }));
  REQUIRE_THROWS_AS(capture.decode(packet(a, 0, 0, true)), std::invalid_argument);
  const auto immediate = *capture.decode(packet(a, 0, 0, true, 2));
  REQUIRE(immediate.timestamp_us == 0);
  REQUIRE(immediate.discontinuity);
  REQUIRE(capture.stats().decoded_packets == 5);
  capture.reset(UINT64_MAX);
  const auto ceiling = *capture.decode(packet(a, UINT64_MAX - 20000, 0, true, UINT64_MAX));
  REQUIRE(ceiling.timestamp_us == UINT64_MAX - 20000);
  REQUIRE_THROWS_AS(capture.decode(packet(b, UINT64_MAX, 0, false, UINT64_MAX)),
                    std::invalid_argument);
  REQUIRE_THROWS_AS(capture.reset(UINT64_MAX), std::invalid_argument);
}
TEST_CASE("Opus capture handoff primes and feeds the bounded PCM source while reset refuses old "
          "queued input") {
  struct Sink {
    OpusCaptureDecoder decoder{1};
    PcmCaptureSource source;
    unsigned calls = 0, outputs = 0;
    std::vector<std::uint8_t> first_pcm;
    static ipc::microphone::Result submit(void *owner,
                                          const ipc::microphone::opus::Packet &packet) {
      auto &sink = *static_cast<Sink *>(owner);
      ++sink.calls;
      const auto output = sink.decoder.decode(packet);
      if (!output)
        return ipc::microphone::Result::accepted;
      ++sink.outputs;
      if (sink.outputs == 1)
        sink.first_pcm.assign(output->pcm.begin(), output->pcm.end());
      return sink.source.submit({output->epoch, output->timestamp_us, output->discontinuity,
                                 output->pcm}) == CaptureStatus::accepted
                 ? ipc::microphone::Result::accepted
                 : ipc::microphone::Result::invalid;
    }
  } sink;
  REQUIRE(sink.source.configure({48000, 2, 16}, 960));
  REQUIRE(sink.source.start(1));
  SoftwareOpusEncoder encoder;
  CaptureHandoff handoff(CaptureCodec::opus);
  for (std::uint64_t index = 0; index < 3; ++index) {
    const auto unit = encoder.encode({pcm(static_cast<std::size_t>(index)), index * 20000});
    auto body = ipc::microphone::opus::encode_packet(
        {1, index * 20000, encoder.lookahead_frames(), index == 0, unit.bytes});
    REQUIRE_FALSE(handoff.enqueue(index + 1, body.bytes(), index * 20000, 1, true));
    body.storage.fill(0);
    REQUIRE(handoff.service_opus(index * 20000 + 1, 1, true, Sink::submit, &sink)->result ==
            ipc::microphone::Result::accepted);
    REQUIRE(handoff.stats().owned_bytes == 0);
    if (index < 2)
      REQUIRE(sink.source.read().silence_frames == 960);
  }
  REQUIRE(sink.calls == 3);
  REQUIRE(sink.outputs == 2);
  const auto read = sink.source.read();
  REQUIRE(read.frames == 960);
  REQUIRE(read.silence_frames == 0);
  REQUIRE(std::ranges::equal(read.bytes, sink.first_pcm));
  const auto old = encoder.encode({pcm(3), 60000});
  const auto queued = ipc::microphone::opus::encode_packet(
      {1, 60000, encoder.lookahead_frames(), false, old.bytes});
  REQUIRE_FALSE(handoff.enqueue(4, queued.bytes(), 60000, 1, true));
  sink.source.stop();
  REQUIRE(sink.source.start(2));
  sink.decoder.reset(2);
  REQUIRE(handoff.service_opus(60001, 2, true, Sink::submit, &sink)->result ==
          ipc::microphone::Result::stale);
  REQUIRE(sink.calls == 3);
  REQUIRE(sink.decoder.stats().queued_frames == 0);
  REQUIRE(sink.source.read().silence_frames == 960);
  encoder.reset();
  const auto fresh = encoder.encode({pcm(0), 0});
  const auto new_body =
      ipc::microphone::opus::encode_packet({2, 0, encoder.lookahead_frames(), true, fresh.bytes});
  REQUIRE_FALSE(handoff.enqueue(5, new_body.bytes(), 80000, 2, true));
  REQUIRE(handoff.service_opus(80001, 2, true, Sink::submit, &sink)->result ==
          ipc::microphone::Result::accepted);
  REQUIRE(sink.calls == 4);
  REQUIRE(sink.outputs == 2);
  REQUIRE(sink.source.read().silence_frames == 960);
  REQUIRE_FALSE(handoff.enqueue(6, new_body.bytes(), 100000, 2, true));
  REQUIRE(handoff.service_opus(100001, 2, false, Sink::submit, &sink)->result ==
          ipc::microphone::Result::unavailable);
  REQUIRE(sink.calls == 4);
  REQUIRE(handoff.retire());
}
