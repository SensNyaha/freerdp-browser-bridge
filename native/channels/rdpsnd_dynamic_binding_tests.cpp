#include "dvc_channel_registry.hpp"
#include <catch2/catch_test_macros.hpp>
#include <freerdp/channels/rdpsnd.h>
#include <vector>
#include <winpr/error.h>
#include <winpr/stream.h>
using namespace bridge::channels;
namespace {
struct Fixture {
  IWTSVirtualChannelManager manager{};
  IWTSVirtualChannel channel{};
  IWTSVirtualChannelCallback original{};
  IWTSVirtualChannelCallback *proxy = nullptr;
  std::uint64_t now = 1;
  unsigned calls = 0, closes = 0;
  bool nested_close = false;
  std::vector<BYTE> copied;
  DvcChannelRegistry registry{
      [](void *p) -> std::uint64_t { return static_cast<Fixture *>(p)->now; }, this};
  Fixture() {
    manager.GetChannelId = [](IWTSVirtualChannel *) -> UINT32 { return 7; };
    manager.GetChannelName = [](IWTSVirtualChannel *) { return RDPSND_DVC_CHANNEL_NAME; };
    original.pInterface = this;
    original.OnDataReceived = [](IWTSVirtualChannelCallback *callback, wStream *stream) -> UINT {
      auto &f = *static_cast<Fixture *>(callback->pInterface);
      ++f.calls;
      if (f.nested_close) {
        REQUIRE(f.registry.retire() == ERROR_IO_PENDING);
        REQUIRE(f.closes == 0);
      }
      const auto *bytes = static_cast<const BYTE *>(Stream_ConstPointer(stream));
      f.copied.assign(bytes, bytes + Stream_GetRemainingLength(stream));
      return CHANNEL_RC_OK;
    };
    original.OnClose = [](IWTSVirtualChannelCallback *callback) -> UINT {
      ++static_cast<Fixture *>(callback->pInterface)->closes;
      return CHANNEL_RC_OK;
    };
    const auto binding = registry.bind(manager, channel, original, now);
    REQUIRE(binding.status == CHANNEL_RC_OK);
    proxy = binding.callback;
  }
  ~Fixture() { (void)registry.retire(); }
  bool claim(std::uint32_t length) {
    std::vector<BYTE> packet{0x28, 7};
    for (unsigned i = 0; i < 4; ++i)
      packet.push_back(static_cast<BYTE>(length >> (i * 8U)));
    return registry.admit(packet, now);
  }
  UINT data(std::span<const BYTE> bytes) {
    wStream stream{};
    REQUIRE(Stream_StaticConstInit(&stream, bytes.data(), bytes.size()));
    const auto status = proxy->OnDataReceived(proxy, &stream);
    REQUIRE(Stream_GetPosition(&stream) == 0);
    return status;
  }
};
constexpr BYTE volume[]{3, 0, 4, 0, 1, 2, 3, 4};
constexpr BYTE info[]{2, 0, 16, 0, 1, 0, 0, 0, 1, 0, 0, 0, 10, 11, 12, 13};
} // namespace
TEST_CASE("Named dynamic RDPSND refuses DATA_FIRST above audio capacity before reservation") {
  Fixture f;
  REQUIRE_FALSE(f.claim(65537));
  REQUIRE(f.calls == 0);
  REQUIRE(f.registry.stats().budget.reservations == 0);
  Fixture exact;
  REQUIRE(exact.claim(65536));
  REQUIRE(exact.registry.stats().budget.reserved_bytes == 65536);
}
TEST_CASE(
    "Named dynamic RDPSND rejects excessive compressed output and encoded input before host") {
  const std::vector<BYTE> compressed{0x70, 7,    0xe1, 2, 0, 1, 0, 1, 0,    3, 0, 0,
                                     0,    0x24, 0,    0, 3, 0, 0, 0, 0x24, 0, 0};
  REQUIRE(inspect_dvc_allocations(compressed)); // Generic 16 MiB profile accepts the claim.
  Fixture output;
  REQUIRE_FALSE(output.registry.admit(compressed, 1));
  REQUIRE(output.calls == 0);
  std::vector<BYTE> large(131073);
  large[0] = 0x70;
  large[1] = 7;
  large[2] = 0xe0;
  large[3] = 0x24;
  REQUIRE(inspect_dvc_allocations(large));
  Fixture encoded;
  REQUIRE_FALSE(encoded.registry.admit(large, 1));
  REQUIRE(encoded.calls == 0);
}
TEST_CASE("Named dynamic RDPSND complete PDU validation precedes original callback") {
  Fixture f;
  REQUIRE(f.claim(sizeof(volume)));
  REQUIRE(f.data(volume) == CHANNEL_RC_OK);
  REQUIRE(f.calls == 1);
  REQUIRE(f.copied == std::vector<BYTE>(std::begin(volume), std::end(volume)));
  REQUIRE(f.registry.stats().budget.reserved_bytes == 0);
  const BYTE malformed[]{7, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0};
  REQUIRE(f.data(malformed) == ERROR_INVALID_DATA);
  REQUIRE(f.calls == 1);
}
TEST_CASE("Named dynamic RDPSND legacy pair expires under unrelated registry polling") {
  Fixture f;
  REQUIRE(f.data(info) == CHANNEL_RC_OK);
  REQUIRE(f.calls == 1);
  f.now = 2000;
  REQUIRE(f.registry.poll(f.now));
  f.now = 2001;
  REQUIRE_FALSE(f.registry.poll(f.now));
  REQUIRE(f.calls == 1);
}
TEST_CASE("Named dynamic RDPSND retirement preserves validated sample borrow and closes once") {
  Fixture f;
  f.nested_close = true;
  REQUIRE(f.data(volume) == CHANNEL_RC_OK);
  REQUIRE(f.copied == std::vector<BYTE>(std::begin(volume), std::end(volume)));
  REQUIRE(f.closes == 1);
  REQUIRE(f.registry.stats().resources_retired);
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
}
