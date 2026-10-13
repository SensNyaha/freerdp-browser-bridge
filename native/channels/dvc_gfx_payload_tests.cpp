#include "dvc_channel_registry.hpp"
#include "gfx_pdu_admission.hpp"
#include <catch2/catch_test_macros.hpp>
#include <cstdlib>
#include <freerdp/channels/rdpgfx.h>
#include <freerdp/codec/zgfx.h>
#include <memory>
#include <stdexcept>
#include <vector>
#include <winpr/error.h>
#include <winpr/stream.h>
using namespace bridge::channels;
static_assert(RDPGFX_HEADER_SIZE == 8 && RDPGFX_WIRE_TO_SURFACE_PDU_1_SIZE == 17 &&
              RDPGFX_WIRE_TO_SURFACE_PDU_2_SIZE == 13);
static_assert(RDPGFX_CMDID_WIRETOSURFACE_1 == 1 && RDPGFX_CMDID_WIRETOSURFACE_2 == 2 &&
              RDPGFX_CMDID_SOLIDFILL == 4 && RDPGFX_CMDID_SURFACETOSURFACE == 5 &&
              RDPGFX_CMDID_CACHETOSURFACE == 7 && RDPGFX_CMDID_RESETGRAPHICS == 14 &&
              RDPGFX_CMDID_CACHEIMPORTREPLY == 17);
static_assert(RDPGFX_CODECID_AVC420 == 11 && RDPGFX_CODECID_AVC444 == 14 &&
              RDPGFX_CODECID_AVC444v2 == 15);
static_assert(sizeof(RECTANGLE_16) == 8 && sizeof(RDPGFX_POINT16) == 4 &&
              sizeof(RDPGFX_H264_QUANT_QUALITY) == 5);
namespace {
struct Fixture {
  struct Channel {
    IWTSVirtualChannel api{};
    Fixture *owner;
  } channel{{}, this};
  IWTSVirtualChannelManager manager{};
  IWTSVirtualChannelCallback target{};
  IWTSVirtualChannelCallback *proxy = nullptr;
  std::unique_ptr<ZGFX_CONTEXT, decltype(&zgfx_context_free)> codec{zgfx_context_new(FALSE),
                                                                    zgfx_context_free};
  DvcChannelRegistry registry;
  const char *name = RDPGFX_DVC_CHANNEL_NAME;
  bool throw_name = false;
  unsigned deliveries = 0, closes = 0;
  std::vector<BYTE> output;
  const BYTE *observed = nullptr;
  explicit Fixture(DvcAllocationLimits limits = {}) : registry(clock, nullptr, {}, limits) {
    if (!codec)
      throw std::runtime_error("Missing public ZGFX fixture codec");
    manager.GetChannelId = [](IWTSVirtualChannel *) -> UINT32 { return 1; };
    manager.GetChannelName = [](IWTSVirtualChannel *p) -> const char * {
      auto &f = *reinterpret_cast<Channel *>(p)->owner;
      if (f.throw_name)
        throw std::runtime_error("fixture");
      return f.name;
    };
    target.pInterface = this;
    target.OnDataReceived = [](IWTSVirtualChannelCallback *p, wStream *stream) -> UINT {
      auto &f = *static_cast<Fixture *>(p->pInterface);
      ++f.deliveries;
      f.observed = static_cast<const BYTE *>(Stream_ConstPointer(stream));
      BYTE *decoded = nullptr;
      UINT32 length = 0;
      const auto status = zgfx_decompress(f.codec.get(), f.observed,
                                          static_cast<UINT32>(Stream_GetRemainingLength(stream)),
                                          &decoded, &length, 0);
      const std::unique_ptr<BYTE, decltype(&std::free)> allocation(decoded, std::free);
      if (status < 0)
        return ERROR_INVALID_DATA;
      if (length)
        f.output.assign(decoded, decoded + length);
      else
        f.output.clear();
      return CHANNEL_RC_OK;
    };
    target.OnClose = [](IWTSVirtualChannelCallback *p) -> UINT {
      ++static_cast<Fixture *>(p->pInterface)->closes;
      return CHANNEL_RC_OK;
    };
  }
  ~Fixture() { (void)registry.retire(); }
  static std::uint64_t clock(void *) { return 1; }
  UINT bind() {
    const auto result = registry.bind(manager, channel.api, target, 1);
    proxy = result.callback;
    return result.status;
  }
  UINT data(std::span<const BYTE> bytes) {
    const auto length = static_cast<UINT32>(bytes.size());
    std::vector<BYTE> first{0x28, 1};
    for (unsigned at = 0; at < 4; ++at)
      first.push_back(static_cast<BYTE>(length >> (8 * at)));
    if (!registry.admit(first, 1) || !proxy)
      return ERROR_INVALID_STATE;
    wStream stream{};
    auto *borrow = Stream_StaticConstInit(&stream, bytes.data(), bytes.size());
    if (!borrow)
      return ERROR_INVALID_PARAMETER;
    const auto status = proxy->OnDataReceived(proxy, borrow);
    REQUIRE(Stream_GetPosition(borrow) == 0);
    return status;
  }
};
} // namespace
TEST_CASE(
    "Named graphics DVC inspects nested ZGFX before actual public decoder and preserves stream") {
  Fixture f;
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  const BYTE raw[]{0xe0, 4, 'a', 'b', 'c'};
  REQUIRE(f.data(raw) == CHANNEL_RC_OK);
  REQUIRE(f.deliveries == 1);
  REQUIRE(f.observed == raw);
  REQUIRE(f.output == std::vector<BYTE>{'a', 'b', 'c'});
  REQUIRE(f.registry.stats().budget.releases == 1);
  REQUIRE_FALSE(f.registry.stats().failed);
}
TEST_CASE("Named graphics DVC refuses huge malformed segment and contradictory nested claims "
          "without decoding") {
  const std::vector<std::vector<BYTE>> invalid{
      {0xe0},
      {0xe2, 4, 1},
      {0xe1, 1, 0, 0xff, 0xff, 0xff, 0xff},
      {0xe1, 1, 0x10, 0, 0, 0, 0},
      {0xe1, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 4, 1},
      {0xe1, 1, 0, 1, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 4, 1},
  };
  for (const auto &bytes : invalid) {
    Fixture f;
    REQUIRE(f.bind() == CHANNEL_RC_OK);
    REQUIRE(f.data(bytes) == ERROR_INVALID_DATA);
    REQUIRE(f.deliveries == 0);
    REQUIRE(f.registry.stats().budget.releases == 1); // Host completion returns even after refusal.
    REQUIRE(f.registry.stats().budget.reserved_bytes == 0);
    REQUIRE_FALSE(f.registry.poll(1));
    REQUIRE(f.registry.stats().failed);
    REQUIRE(f.registry.retire() != CHANNEL_RC_OK);
    REQUIRE(f.closes == 1);
  }
}
TEST_CASE("Named graphics DVC honors trusted smaller nested output budget before codec callback") {
  DvcAllocationLimits limits;
  limits.codec_bytes = 2;
  Fixture f(limits);
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  const BYTE raw[]{0xe0, 4, 1, 2, 3};
  REQUIRE(f.data(raw) == ERROR_INVALID_DATA);
  REQUIRE(f.deliveries == 0);
}
TEST_CASE("Named graphics DVC preserves a legitimate twelve MiB multipart codec payload") {
  Fixture f;
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  constexpr UINT32 length = 12U * 1024U * 1024U;
  constexpr UINT32 segment_bytes = 65536;
  constexpr UINT32 count = length / segment_bytes;
  std::vector<BYTE> encoded{0xe1, static_cast<BYTE>(count), static_cast<BYTE>(count >> 8)};
  for (unsigned at = 0; at < 4; ++at)
    encoded.push_back(static_cast<BYTE>(length >> (8 * at)));
  for (UINT32 index = 0; index < count; ++index) {
    for (unsigned at = 0; at < 4; ++at)
      encoded.push_back(static_cast<BYTE>((segment_bytes + 1) >> (8 * at)));
    encoded.push_back(4);
    encoded.insert(encoded.end(), segment_bytes, 0x5a);
  }
  REQUIRE(f.data(encoded) == CHANNEL_RC_OK);
  REQUIRE(f.deliveries == 1);
  REQUIRE(f.output.size() == length);
  REQUIRE(f.output.front() == 0x5a);
  REQUIRE(f.output.back() == 0x5a);
  REQUIRE(f.registry.stats().budget.releases == 1);
}
TEST_CASE("Graphics payload classification uses exact public DVC name rather than addin name") {
  Fixture f;
  f.name = RDPGFX_CHANNEL_NAME;
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  const BYTE arbitrary[]{1, 2, 3, 4};
  REQUIRE(f.data(arbitrary) == ERROR_INVALID_DATA); // Decoder owns ordinary opaque channel errors.
  REQUIRE(f.deliveries == 1); // Nested guard was not selected for a different public channel name.
}
TEST_CASE("Public DVC channel name failure cannot publish a graphics proxy with uncertain policy") {
  for (unsigned failure = 0; failure < 3; ++failure) {
    Fixture f;
    f.name = failure == 0 ? nullptr : "";
    f.throw_name = failure == 2;
    const UINT expected = failure == 2 ? ERROR_INTERNAL_ERROR : ERROR_INVALID_DATA;
    REQUIRE(f.bind() == expected);
    REQUIRE(f.proxy == nullptr);
    REQUIRE(f.registry.stats().failed);
    REQUIRE(f.deliveries == 0);
    REQUIRE(f.closes == 0); // Direct rejected bind leaves original callback with caller.
  }
}
TEST_CASE("Prepared GFX metadata admission inspects actual public ZGFX decoded output") {
  const BYTE caps[]{0xe0, 4, 19, 0, 0, 0, 20, 0, 0, 0, 4, 0, 8, 0, 4, 0, 0, 0, 0, 0, 0, 0};
  Fixture valid;
  REQUIRE(valid.bind() == CHANNEL_RC_OK);
  REQUIRE(valid.data(caps) == CHANNEL_RC_OK);
  REQUIRE(bridge::media::admit_gfx_pdus(valid.output));
  std::vector<BYTE> invalid{0xe0, 4};
  // WireToSurface1, 4-byte bitmap containing an excessive metadata count.
  const BYTE prefix[]{1, 0, 0, 0, 29, 0, 0, 0, 0, 0, 11, 0, 0x21,
                      0, 0, 0, 0, 0,  0, 0, 0, 4, 0, 0,  0};
  invalid.insert(invalid.end(), std::begin(prefix), std::end(prefix));
  invalid.insert(invalid.end(), {0xff, 0xff, 0xff, 0xff});
  Fixture malformed;
  REQUIRE(malformed.bind() == CHANNEL_RC_OK);
  REQUIRE(malformed.data(invalid) == CHANNEL_RC_OK); // Valid ZGFX, opaque codec fixture.
  REQUIRE_FALSE(bridge::media::admit_gfx_pdus(malformed.output));
  REQUIRE(malformed.deliveries == 1); // No production metadata placement is claimed yet.
}
