#include "dvc_channel_registry.hpp"
#include <catch2/catch_test_macros.hpp>
#include <freerdp/channels/audin.h>
#include <vector>
#include <winpr/error.h>
#include <winpr/stream.h>
using namespace bridge::channels;
namespace {
struct Fixture {
  struct Channel {
    IWTSVirtualChannel api{};
    const char *name;
  } channel;
  IWTSVirtualChannelManager manager{};
  IWTSVirtualChannelCallback target{};
  IWTSVirtualChannelCallback *proxy = nullptr;
  unsigned calls = 0;
  bool original_buffer = false;
  const BYTE *input = nullptr;
  DvcChannelRegistry registry{[](void *) -> std::uint64_t { return 1; }};
  explicit Fixture(const char *name = AUDIN_DVC_CHANNEL_NAME) : channel{{}, name} {
    manager.GetChannelId = [](IWTSVirtualChannel *) -> UINT32 { return 7; };
    manager.GetChannelName = [](IWTSVirtualChannel *p) {
      return reinterpret_cast<Channel *>(p)->name;
    };
    target.pInterface = this;
    target.OnDataReceived = [](IWTSVirtualChannelCallback *callback, wStream *stream) -> UINT {
      auto &f = *static_cast<Fixture *>(callback->pInterface);
      ++f.calls;
      f.original_buffer = Stream_ConstPointer(stream) == f.input;
      return CHANNEL_RC_OK;
    };
    target.OnClose = [](IWTSVirtualChannelCallback *) -> UINT { return CHANNEL_RC_OK; };
    const auto bound = registry.bind(manager, channel.api, target, 1);
    REQUIRE(bound.status == CHANNEL_RC_OK);
    proxy = bound.callback;
  }
  ~Fixture() { (void)registry.retire(); }
  bool claim(std::uint32_t size) {
    std::vector<BYTE> record{0x28, 7};
    for (unsigned i = 0; i < 4; ++i)
      record.push_back(static_cast<BYTE>(size >> (i * 8U)));
    return registry.admit(record, 1);
  }
  UINT data(std::span<const BYTE> bytes) {
    wStream stream{};
    REQUIRE(Stream_StaticConstInit(&stream, bytes.data(), bytes.size()));
    input = bytes.data();
    return proxy->OnDataReceived(proxy, &stream);
  }
};
} // namespace
TEST_CASE("Named AUDIN admits exact incoming capacity and rejects larger DATA_FIRST before host") {
  Fixture exact;
  REQUIRE(exact.claim(65536));
  REQUIRE(exact.registry.stats().budget.reserved_bytes == 65536);
  Fixture large;
  REQUIRE_FALSE(large.claim(65537));
  REQUIRE(large.calls == 0);
  REQUIRE(large.registry.stats().budget.reservations == 0);
}
TEST_CASE("Named AUDIN complete callback preserves original public parser ownership below limit") {
  Fixture f;
  const BYTE version[]{1, 1, 0, 0, 0};
  REQUIRE(f.claim(sizeof(version)));
  REQUIRE(f.data(version) == CHANNEL_RC_OK);
  REQUIRE(f.calls == 1);
  REQUIRE(f.original_buffer);
  REQUIRE(f.registry.stats().budget.reserved_bytes == 0);
  std::vector<BYTE> oversized(65537);
  REQUIRE(f.data(oversized) == ERROR_INVALID_DATA);
  REQUIRE(f.calls == 1);
}
TEST_CASE("AUDIN allocation profile requires exact endpoint identity") {
  for (const char *name : {"AUDIO_INPUT-extra", "audio_input", "bridge-fixture"}) {
    Fixture f(name);
    REQUIRE(f.claim(65537));
    REQUIRE_FALSE(f.registry.stats().failed);
  }
}
TEST_CASE("Named AUDIN compressed claim is checked before SDK decompression") {
  const std::vector<BYTE> compressed{0x70, 7,    0xe1, 2, 0, 1, 0, 1, 0,    3, 0, 0,
                                     0,    0x24, 0,    0, 3, 0, 0, 0, 0x24, 0, 0};
  REQUIRE(inspect_dvc_allocations(compressed));
  Fixture f;
  REQUIRE_FALSE(f.registry.admit(compressed, 1));
  REQUIRE(f.calls == 0);
}
