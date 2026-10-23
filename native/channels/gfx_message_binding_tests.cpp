#include "../compat/span.hpp"
#include "dvc_channel_registry.hpp"
#include <catch2/catch_test_macros.hpp>
#include <freerdp/channels/rdpgfx.h>
#include <vector>
#include <winpr/error.h>
#include <winpr/stream.h>
using namespace bridge::channels;
namespace {
struct Fixture {
  IWTSVirtualChannelManager manager{};
  IWTSVirtualChannel channel{};
  IWTSVirtualChannelCallback target{};
  IWTSVirtualChannelCallback *proxy = nullptr;
  DvcChannelRegistry registry{[](void *) -> std::uint64_t { return 1; }};
  unsigned calls = 0, closes = 0;
  std::size_t observed_position = 0;
  bool original_buffer = false;
  const BYTE *input = nullptr;
  bool retire_during_data = false;
  Fixture() {
    manager.GetChannelId = [](IWTSVirtualChannel *) -> UINT32 { return 1; };
    manager.GetChannelName = [](IWTSVirtualChannel *) -> const char * {
      return RDPGFX_DVC_CHANNEL_NAME;
    };
    target.pInterface = this;
    target.OnDataReceived = [](IWTSVirtualChannelCallback *p, wStream *stream) -> UINT {
      auto &f = *static_cast<Fixture *>(p->pInterface);
      ++f.calls;
      f.original_buffer = Stream_ConstPointer(stream) == f.input;
      f.observed_position = Stream_GetPosition(stream);
      if (f.retire_during_data) {
        REQUIRE(f.registry.retire() == ERROR_IO_PENDING);
        REQUIRE(f.closes == 0);
        REQUIRE(Stream_GetRemainingLength(stream) > 0);
      }
      return CHANNEL_RC_OK;
    };
    target.OnClose = [](IWTSVirtualChannelCallback *p) -> UINT {
      ++static_cast<Fixture *>(p->pInterface)->closes;
      return CHANNEL_RC_OK;
    };
    const auto binding = registry.bind(manager, channel, target, 1);
    REQUIRE(binding.status == CHANNEL_RC_OK);
    proxy = binding.callback;
  }
  ~Fixture() { (void)registry.retire(); }
  UINT data(::bridge::compat::span<const BYTE> bytes) {
    std::vector<BYTE> first{0x28, 1};
    for (unsigned i = 0; i < 4; ++i)
      first.push_back(static_cast<BYTE>(bytes.size() >> (i * 8U)));
    REQUIRE(registry.admit(first, 1));
    wStream stream{};
    REQUIRE(Stream_StaticConstInit(&stream, bytes.data(), bytes.size()));
    input = bytes.data();
    const auto status = proxy->OnDataReceived(proxy, &stream);
    input = nullptr;
    REQUIRE(Stream_GetPosition(&stream) == 0);
    return status;
  }
};
std::vector<BYTE> caps() {
  return {0xe0, 4, 19, 0, 0, 0, 20, 0, 0, 0, 4, 0, 8, 0, 4, 0, 0, 0, 0, 0, 0, 0};
}
} // namespace
TEST_CASE("Named graphics completion owner rejects decoded metadata before original dispatch") {
  std::vector<BYTE> decoded(8 + 17 + 4 + 1025 * 10);
  decoded[0] = 1;
  const auto put = [&](std::size_t at, std::uint32_t value) {
    for (unsigned i = 0; i < 4; ++i)
      decoded[at + i] = static_cast<BYTE>(value >> (i * 8U));
  };
  put(4, static_cast<std::uint32_t>(decoded.size()));
  decoded[10] = 11;
  put(21, static_cast<std::uint32_t>(decoded.size() - 25));
  put(25, 1025);
  std::vector<BYTE> encoded{0xe0, 4};
  encoded.insert(encoded.end(), decoded.begin(), decoded.end());
  Fixture f;
  REQUIRE(f.data(encoded) == ERROR_INVALID_DATA);
  REQUIRE(f.calls == 0);
  REQUIRE(f.registry.stats().budget.reserved_bytes == 0);
  REQUIRE(f.registry.stats().budget.releases == 1);
  REQUIRE_FALSE(f.registry.poll(1));
  REQUIRE(f.registry.retire() != CHANNEL_RC_OK);
  REQUIRE(f.closes == 1);
  REQUIRE(f.registry.stats().resources_retired);
}
TEST_CASE("Named graphics completion owner keeps transformed stream through pending retirement") {
  Fixture f;
  f.retire_during_data = true;
  REQUIRE(f.data(caps()) == CHANNEL_RC_OK);
  REQUIRE(f.calls == 1);
  REQUIRE_FALSE(f.original_buffer);
  REQUIRE(f.observed_position == 0);
  REQUIRE(f.closes == 1);
  REQUIRE(f.registry.stats().resources_retired);
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
  REQUIRE(f.closes == 1);
}
