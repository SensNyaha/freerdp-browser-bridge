#include "avc_decode_probe.hpp"
#include "gfx_message_gate.hpp"
#include "video_encoder.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <vector>
#include <winpr/error.h>
#include <winpr/stream.h>
using namespace bridge::media;
namespace {
struct Target {
  IWTSVirtualChannelCallback api{};
  std::unique_ptr<ZGFX_CONTEXT, decltype(&zgfx_context_free)> codec{zgfx_context_new(FALSE),
                                                                    zgfx_context_free};
  std::vector<BYTE> output;
  Target() {
    REQUIRE(codec);
    api.pInterface = this;
    api.OnDataReceived = [](IWTSVirtualChannelCallback *p, wStream *stream) -> UINT {
      auto &self = *static_cast<Target *>(p->pInterface);
      BYTE *raw = nullptr;
      UINT32 size = 0;
      const auto status =
          zgfx_decompress(self.codec.get(), static_cast<const BYTE *>(Stream_ConstPointer(stream)),
                          static_cast<UINT32>(Stream_GetRemainingLength(stream)), &raw, &size, 0);
      const std::unique_ptr<BYTE, decltype(&std::free)> allocation(raw, std::free);
      if (status < 0 || !raw || !size)
        return ERROR_INVALID_DATA;
      self.output.assign(raw, raw + size);
      return CHANNEL_RC_OK;
    };
  }
};
} // namespace
TEST_CASE(
    "GFX message owner measures actual SDK 1080p AVC wire forwarding without remote capture") {
  SoftwareH264Encoder encoder;
  std::vector<BYTE> desktop(1920U * 1080U * 4U, 0x60);
  const auto unit = encoder.encode({desktop, 1920, 1080, 1920 * 4, 1000}, true);
  const auto annex = bridge::diagnostics::AvcDecodeProbe::annex_b(unit);
  std::vector<BYTE> pdu(8 + 17 + 14 + annex.size());
  const auto put = [&](std::size_t at, std::uint32_t value, unsigned count = 4) {
    for (unsigned i = 0; i < count; ++i)
      pdu[at + i] = static_cast<BYTE>(value >> (i * 8U));
  };
  put(0, 1, 2);
  put(4, static_cast<std::uint32_t>(pdu.size()));
  put(10, 11, 2);
  pdu[12] = 0x21;
  put(17, 1920, 2);
  put(19, 1080, 2);
  put(21, static_cast<std::uint32_t>(14 + annex.size()));
  put(25, 1);
  put(33, 1920, 2);
  put(35, 1080, 2);
  std::copy(annex.begin(), annex.end(), pdu.begin() + 39);
  REQUIRE(admit_gfx_pdus(pdu));
  std::unique_ptr<ZGFX_CONTEXT, decltype(&zgfx_context_free)> compressor(zgfx_context_new(TRUE),
                                                                         zgfx_context_free);
  REQUIRE(compressor);
  std::unique_ptr<wStream, void (*)(wStream *)> encoded(
      Stream_New(nullptr, pdu.size() + 65536), [](wStream *value) { Stream_Free(value, TRUE); });
  REQUIRE(encoded);
  UINT32 flags = 0;
  REQUIRE(zgfx_compress_to_stream(compressor.get(), encoded.get(), pdu.data(),
                                  static_cast<UINT32>(pdu.size()), &flags) >= 0);
  Target target;
  GfxMessageGate gate;
  constexpr unsigned iterations = 100;
  const auto measure = [&](bool guarded) {
    const auto began = std::chrono::steady_clock::now();
    for (unsigned i = 0; i < iterations; ++i) {
      wStream borrow{};
      REQUIRE(Stream_StaticConstInit(&borrow, Stream_Buffer(encoded.get()),
                                     Stream_Length(encoded.get())));
      const auto status = guarded ? gate.forward(target.api, borrow)
                                  : target.api.OnDataReceived(&target.api, &borrow);
      REQUIRE(status == CHANNEL_RC_OK);
      REQUIRE(target.output == pdu);
    }
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - began)
        .count();
  };
  const auto direct = measure(false);
  const auto guarded = measure(true);
  std::cout << "gfx_gate_avc_benchmark bytes=" << pdu.size() << " iterations=" << iterations
            << " direct_ms=" << direct << " guarded_ms=" << guarded << '\n';
}
