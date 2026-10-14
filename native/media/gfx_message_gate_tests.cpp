#include "gfx_message_gate.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <vector>
#include <winpr/error.h>
#include <winpr/stream.h>
using namespace bridge::media;
namespace {
const std::vector<BYTE> caps{19, 0, 0, 0, 20, 0, 0, 0, 4, 0, 8, 0, 4, 0, 0, 0, 0, 0, 0, 0};
struct Bits {
  std::vector<BYTE> bytes{0xe0, 0x24};
  unsigned used = 0;
  void fixed(std::uint32_t value, unsigned count) {
    for (unsigned i = count; i; --i) {
      if (!used)
        bytes.push_back(0);
      bytes.back() |= static_cast<BYTE>(((value >> (i - 1U)) & 1U) << (7U - used));
      used = (used + 1U) % 8U;
    }
  }
  std::vector<BYTE> finish() {
    bytes.push_back(static_cast<BYTE>(used ? 8U - used : 0));
    return bytes;
  }
};
std::vector<BYTE> compressed(std::span<const BYTE> payload) {
  Bits bits;
  for (auto byte : payload) {
    bits.fixed(0, 1);
    bits.fixed(byte, 8);
  }
  return bits.finish();
}
std::vector<BYTE> history_caps() {
  Bits bits;
  bits.fixed(17, 5); // First match-distance token.
  bits.fixed(20, 5);
  bits.fixed(0b1110, 4); // count base 16, four additional bits.
  bits.fixed(4, 4);      // count = 20.
  return bits.finish();
}
struct Fixture {
  IWTSVirtualChannelCallback target{};
  GfxMessageGate gate;
  std::unique_ptr<ZGFX_CONTEXT, decltype(&zgfx_context_free)> original{zgfx_context_new(FALSE),
                                                                       zgfx_context_free};
  std::vector<BYTE> decoded;
  unsigned calls = 0;
  UINT status = CHANNEL_RC_OK, nested_status = 0;
  bool throw_target = false, nested_forward = false, nested_retire = false;
  bool foreign_forward = false;
  wStream *input = nullptr;
  Fixture() {
    REQUIRE(original);
    target.pInterface = this;
    target.OnDataReceived = [](IWTSVirtualChannelCallback *p, wStream *stream) -> UINT {
      auto &f = *static_cast<Fixture *>(p->pInterface);
      ++f.calls;
      REQUIRE(stream != f.input);
      if (f.nested_forward)
        f.nested_status = f.gate.forward(f.target, *f.input);
      if (f.nested_retire) {
        f.nested_status = f.gate.retire();
        REQUIRE_FALSE(f.gate.retired());
      }
      if (f.foreign_forward) {
        std::thread foreign([&] { f.nested_status = f.gate.forward(f.target, *f.input); });
        foreign.join();
      }
      BYTE *raw = nullptr;
      UINT32 size = 0;
      const auto result =
          zgfx_decompress(f.original.get(), static_cast<const BYTE *>(Stream_ConstPointer(stream)),
                          static_cast<UINT32>(Stream_GetRemainingLength(stream)), &raw, &size, 0);
      const std::unique_ptr<BYTE, decltype(&std::free)> allocation(raw, std::free);
      REQUIRE(result >= 0);
      REQUIRE((raw || size == 0));
      if (size)
        f.decoded.assign(raw, raw + size);
      else
        f.decoded.clear();
      REQUIRE(Stream_SetPosition(stream, Stream_Length(stream)));
      if (f.throw_target)
        throw std::runtime_error("fixture");
      return f.status;
    };
  }
  UINT data(std::span<const BYTE> bytes, std::size_t position = 0) {
    wStream stream{};
    const BYTE empty_marker = 0;
    REQUIRE(Stream_StaticConstInit(&stream, bytes.empty() ? &empty_marker : bytes.data(),
                                   bytes.size()));
    REQUIRE(Stream_SetPosition(&stream, position));
    input = &stream;
    const auto result = gate.forward(target, stream);
    input = nullptr;
    REQUIRE(Stream_GetPosition(&stream) == position);
    return result;
  }
};
} // namespace
TEST_CASE(
    "Isolated GFX message owner preserves compressed dictionary progression and input borrow") {
  Fixture f;
  auto bytes = compressed(caps);
  bytes.insert(bytes.begin(), {0xaa, 0xbb});
  REQUIRE(f.data(bytes, 2) == CHANNEL_RC_OK);
  REQUIRE(f.decoded == caps);
  REQUIRE(f.data(history_caps()) == CHANNEL_RC_OK);
  REQUIRE(f.decoded == caps);
  REQUIRE(f.calls == 2);
  REQUIRE_FALSE(f.gate.failed());
  Fixture fresh;
  REQUIRE(fresh.data(history_caps()) == ERROR_INVALID_DATA);
  REQUIRE(fresh.calls == 0); // A history-only message cannot replace the ingress dictionary.
}
TEST_CASE("Isolated GFX message owner rejects framing and metadata before original parser") {
  for (const auto &payload :
       std::vector<std::vector<BYTE>>{{},
                                      {0xe0},
                                      {0xe1, 1, 0, 0xff, 0xff, 0xff, 0xff},
                                      compressed(std::vector<BYTE>{1, 0, 0, 0, 7, 0, 0, 0})}) {
    Fixture f;
    REQUIRE(f.data(payload) == ERROR_INVALID_DATA);
    REQUIRE(f.calls == 0);
    REQUIRE(f.gate.failed());
    REQUIRE(f.data(compressed(caps)) == ERROR_INVALID_STATE);
    REQUIRE(f.calls == 0);
  }
  std::vector<BYTE> body(8 + 17 + 4 + 1025 * 10);
  body[0] = 1;
  const auto put = [&](std::size_t at, std::uint32_t value) {
    for (unsigned i = 0; i < 4; ++i)
      body[at + i] = static_cast<BYTE>(value >> (i * 8U));
  };
  put(4, static_cast<std::uint32_t>(body.size()));
  body[10] = 11;
  put(21, static_cast<std::uint32_t>(body.size() - 25));
  put(25, 1025);
  Fixture f;
  REQUIRE(f.data(compressed(body)) == ERROR_INVALID_DATA);
  REQUIRE(f.calls == 0);
}
TEST_CASE("Isolated GFX message owner keeps callback failures sticky without predictive retries") {
  for (const auto throwing : {false, true}) {
    Fixture f;
    f.throw_target = throwing;
    f.status = ERROR_BAD_CONFIGURATION;
    const UINT expected = throwing ? ERROR_INTERNAL_ERROR : ERROR_BAD_CONFIGURATION;
    REQUIRE(f.data(compressed(caps)) == expected);
    REQUIRE(f.gate.failed());
    REQUIRE(f.data(history_caps()) == ERROR_INVALID_STATE);
    REQUIRE(f.calls == 1);
    REQUIRE(f.gate.retire() == CHANNEL_RC_OK);
    REQUIRE(f.gate.retired());
  }
}
TEST_CASE(
    "Isolated GFX message owner retains codec and forwarded storage through nested retirement") {
  Fixture f;
  f.nested_retire = true;
  REQUIRE(f.data(compressed(caps)) == CHANNEL_RC_OK);
  REQUIRE(f.nested_status == ERROR_IO_PENDING);
  REQUIRE(f.gate.retired());
  REQUIRE(f.decoded == caps);
  REQUIRE_FALSE(f.gate.failed());
  REQUIRE(f.data(history_caps()) == ERROR_INVALID_STATE);
  Fixture reentrant;
  reentrant.nested_forward = true;
  REQUIRE(reentrant.data(compressed(caps)) == ERROR_INVALID_STATE);
  REQUIRE(reentrant.nested_status == ERROR_INVALID_STATE);
  REQUIRE(reentrant.gate.failed());
  REQUIRE(reentrant.calls == 1);
  REQUIRE(reentrant.decoded == caps);
}
TEST_CASE("Isolated GFX message owner preserves zero-output messages without metadata allocation") {
  Fixture f;
  const std::vector<BYTE> empty{0xe1, 0, 0, 0, 0, 0, 0};
  REQUIRE(f.data(empty) == CHANNEL_RC_OK);
  REQUIRE(f.decoded.empty());
  REQUIRE(f.data(compressed({})) == CHANNEL_RC_OK);
  REQUIRE(f.decoded.empty());
  REQUIRE(f.calls == 0); // Empty decoded batches cannot enter pinned rdpgfx's null stream init.
  REQUIRE(f.data(compressed(caps)) == CHANNEL_RC_OK);
  REQUIRE(f.data(history_caps()) == CHANNEL_RC_OK);
  REQUIRE(f.decoded == caps);
}
TEST_CASE("Isolated GFX message owner refuses foreign calls without mutating active owner") {
  Fixture f;
  f.foreign_forward = true;
  REQUIRE(f.data(compressed(caps)) == CHANNEL_RC_OK);
  REQUIRE(f.nested_status == ERROR_INVALID_STATE);
  REQUIRE_FALSE(f.gate.failed());
  REQUIRE(f.decoded == caps);
  REQUIRE(f.data(history_caps()) == CHANNEL_RC_OK);
  REQUIRE(f.calls == 2);
}
TEST_CASE("Isolated GFX message owner keeps reduced metadata limits and refuses raised policy") {
  bridge::channels::DvcAllocationLimits allocations;
  ++allocations.codec_bytes;
  REQUIRE_THROWS_AS(GfxMessageGate(allocations), std::invalid_argument);
  GfxPduLimits pdus;
  ++pdus.bytes;
  REQUIRE_THROWS_AS((GfxMessageGate({}, pdus)), std::invalid_argument);
  pdus = {};
  pdus.bytes = caps.size() - 1;
  GfxMessageGate gate({}, pdus);
  Fixture f;
  const auto bytes = compressed(caps);
  wStream stream{};
  REQUIRE(Stream_StaticConstInit(&stream, bytes.data(), bytes.size()));
  REQUIRE(gate.forward(f.target, stream) == ERROR_INVALID_DATA);
  REQUIRE(f.calls == 0);
}
TEST_CASE("Isolated GFX message owner measures bounded twelve MiB literal forwarding overhead") {
  constexpr std::size_t bitmap_size = 6U * 1024U * 1024U;
  std::vector<BYTE> chunk(25 + bitmap_size, 0);
  const auto put = [&](std::size_t at, std::uint32_t value, unsigned count = 4) {
    for (unsigned i = 0; i < count; ++i)
      chunk[at + i] = static_cast<BYTE>(value >> (i * 8U));
  };
  put(0, 1, 2);
  put(4, static_cast<std::uint32_t>(chunk.size()));
  chunk[12] = 0x21;
  put(17, 1536, 2);
  put(19, 1024, 2);
  put(21, bitmap_size);
  std::fill(chunk.begin() + 25, chunk.end(), 0x5a);
  std::vector<BYTE> batch(chunk.size() * 2);
  std::copy(chunk.begin(), chunk.end(), batch.begin());
  chunk[8] = 1;
  std::copy(chunk.begin(), chunk.end(), batch.data() + chunk.size());
  REQUIRE(admit_gfx_pdus(batch));
  std::unique_ptr<ZGFX_CONTEXT, decltype(&zgfx_context_free)> encoder(zgfx_context_new(TRUE),
                                                                      zgfx_context_free);
  REQUIRE(encoder);
  std::unique_ptr<wStream, void (*)(wStream *)> wire(
      Stream_New(nullptr, batch.size() + 65536),
      [](wStream *stream) { Stream_Free(stream, TRUE); });
  REQUIRE(wire);
  UINT32 flags = 0;
  REQUIRE(zgfx_compress_to_stream(encoder.get(), wire.get(), batch.data(),
                                  static_cast<UINT32>(batch.size()), &flags) >= 0);
  const std::span<const BYTE> encoded(Stream_Buffer(wire.get()), Stream_Length(wire.get()));
  Fixture f;
  constexpr unsigned iterations = 6;
  const auto measure = [&](bool guarded) {
    const auto began = std::chrono::steady_clock::now();
    for (unsigned i = 0; i < iterations; ++i) {
      wStream borrow{};
      REQUIRE(Stream_StaticConstInit(&borrow, encoded.data(), encoded.size()));
      const auto status =
          guarded ? f.gate.forward(f.target, borrow) : f.target.OnDataReceived(&f.target, &borrow);
      REQUIRE(status == CHANNEL_RC_OK);
      REQUIRE(f.decoded == batch);
    }
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - began)
        .count();
  };
  const auto direct = measure(false);
  const auto guarded = measure(true);
  std::cout << "gfx_gate_benchmark bytes=" << batch.size() << " iterations=" << iterations
            << " direct_ms=" << direct << " guarded_ms=" << guarded << '\n';
}
