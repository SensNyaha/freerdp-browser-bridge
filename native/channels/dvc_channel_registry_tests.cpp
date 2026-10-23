#include "dvc_channel_registry.hpp"
#include <catch2/catch_test_macros.hpp>
#include <memory>
#include <stdexcept>
#include <vector>
#include <winpr/error.h>
#include <winpr/stream.h>
using namespace bridge::channels;
namespace {
std::vector<BYTE> claim(std::uint32_t id, std::uint32_t bytes) {
  std::vector<BYTE> data{0x2a};
  for (unsigned at = 0; at < 4; ++at)
    data.push_back(static_cast<BYTE>(id >> (8 * at)));
  for (unsigned at = 0; at < 4; ++at)
    data.push_back(static_cast<BYTE>(bytes >> (8 * at)));
  data.push_back(1);
  return data;
}
struct Fixture {
  struct Channel {
    IWTSVirtualChannel api{};
    Fixture *owner;
    UINT32 id = 0;
  } channels[3];
  struct Target {
    IWTSVirtualChannelCallback api{};
    Fixture *owner;
    IWTSVirtualChannelCallback *proxy = nullptr;
    unsigned data = 0, closes = 0;
    std::size_t charged = 0;
  } targets[3];
  IWTSVirtualChannelManager manager{};
  std::uint64_t now = 1;
  bool throw_id = false, resolve_retire = false, data_retire = false, data_error = false;
  UINT nested_status = 0;
  bool retired_during_callback = false;
  DvcChannelRegistry registry;
  explicit Fixture(DvcMessageBudgetLimits limits = {2, 8, 8, 100}) : registry(clock, this, limits) {
    manager.GetChannelId = [](IWTSVirtualChannel *p) -> UINT32 {
      auto &channel = *reinterpret_cast<Channel *>(p);
      auto &f = *channel.owner;
      if (f.throw_id)
        throw std::runtime_error("fixture");
      if (f.resolve_retire)
        f.nested_status = f.registry.retire();
      return channel.id;
    };
    for (auto &channel : channels)
      channel.owner = this;
    for (auto &target : targets) {
      target.owner = this;
      target.api.pInterface = &target;
      target.api.OnDataReceived = [](IWTSVirtualChannelCallback *p, wStream *) -> UINT {
        auto &target_state = *reinterpret_cast<Target *>(p);
        auto &f = *target_state.owner;
        ++target_state.data;
        target_state.charged = f.registry.stats().budget.reserved_bytes;
        if (f.data_retire) {
          f.nested_status = f.registry.retire();
          f.retired_during_callback = f.registry.stats().resources_retired;
        }
        return f.data_error ? ERROR_ACCESS_DENIED : CHANNEL_RC_OK;
      };
      target.api.OnClose = [](IWTSVirtualChannelCallback *p) -> UINT {
        ++reinterpret_cast<Target *>(p)->closes;
        return CHANNEL_RC_OK;
      };
    }
  }
  ~Fixture() { (void)registry.retire(); }
  static std::uint64_t clock(void *context) { return static_cast<Fixture *>(context)->now; }
  DvcChannelBinding bind(unsigned index, std::uint32_t id, std::uint64_t time = 1) {
    now = time;
    channels[index].id = id;
    const auto result = registry.bind(manager, channels[index].api, targets[index].api, time);
    targets[index].proxy = result.callback;
    return result;
  }
  bool admit(std::uint32_t id, std::uint32_t size, std::uint64_t time = 1) {
    now = time;
    return registry.admit(claim(id, size), time);
  }
  UINT data(unsigned index) {
    BYTE bytes[]{1, 2, 3, 4};
    std::unique_ptr<wStream, void (*)(wStream *)> stream(Stream_New(bytes, sizeof(bytes)),
                                                         [](wStream *p) { Stream_Free(p, FALSE); });
    if (!stream || !targets[index].proxy)
      return ERROR_INVALID_PARAMETER;
    return targets[index].proxy->OnDataReceived(targets[index].proxy, stream.get());
  }
};
} // namespace
TEST_CASE("Public DVC registry binds public zero/wide IDs and charges only live declared owners") {
  Fixture f;
  REQUIRE(f.bind(0, 0).status == CHANNEL_RC_OK);
  REQUIRE(f.bind(1, UINT32_MAX).status == CHANNEL_RC_OK);
  REQUIRE(f.targets[0].proxy->pInterface == &f.targets[0]);
  REQUIRE(f.registry.contains(0));
  REQUIRE(f.registry.contains(UINT32_MAX));
  REQUIRE(f.admit(0, 4));
  REQUIRE(f.admit(UINT32_MAX, 4));
  REQUIRE(f.registry.stats().budget.reserved_bytes == 8);
  REQUIRE(f.data(0) == CHANNEL_RC_OK);
  REQUIRE(f.targets[0].charged == 8);
  REQUIRE(f.registry.stats().budget.reserved_bytes == 4);
  REQUIRE(f.data(1) == CHANNEL_RC_OK);
  REQUIRE(f.targets[1].charged == 4);
  REQUIRE(f.registry.stats().budget.releases == 2);
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
  REQUIRE(f.registry.stats().resources_retired);
  REQUIRE(f.targets[0].closes == 1);
  REQUIRE(f.targets[1].closes == 1);
}
TEST_CASE("Public DVC registry does not charge ignored channels but still rejects huge metadata") {
  Fixture f;
  REQUIRE(f.bind(0, 1).status == CHANNEL_RC_OK);
  REQUIRE(f.admit(99, 8));
  REQUIRE(f.registry.stats().budget.reservations == 0);
  REQUIRE_FALSE(f.registry.contains(99));
  REQUIRE_FALSE(f.admit(99, UINT32_MAX));
  REQUIRE(f.registry.stats().failed);
  REQUIRE(f.registry.retire() == ERROR_INVALID_DATA);
  REQUIRE(f.targets[0].closes == 1);
}
TEST_CASE("Public DVC registry bounds callback slots and never adopts rejected originals") {
  Fixture f({1, 8, 8, 100});
  REQUIRE(f.bind(0, 1).status == CHANNEL_RC_OK);
  const auto refused = f.bind(1, 2);
  REQUIRE(refused.status == ERROR_TOO_MANY_OPEN_FILES);
  REQUIRE(refused.callback == nullptr);
  REQUIRE(f.targets[1].closes == 0);
  REQUIRE(f.registry.retire() == ERROR_TOO_MANY_OPEN_FILES);
  REQUIRE(f.registry.stats().resources_retired);
  REQUIRE(f.targets[0].closes == 1);
  REQUIRE(f.targets[1].closes == 0);
  REQUIRE(f.targets[1].api.OnClose(&f.targets[1].api) ==
          CHANNEL_RC_OK); // Caller-owned rejected target.
  REQUIRE(f.registry.retire() == ERROR_TOO_MANY_OPEN_FILES);
  REQUIRE(f.targets[1].closes == 1);
  Fixture duplicate;
  REQUIRE(duplicate.bind(0, 1).status == CHANNEL_RC_OK);
  REQUIRE(duplicate.bind(1, 1).status == ERROR_ALREADY_EXISTS);
  REQUIRE(duplicate.registry.retire() == ERROR_ALREADY_EXISTS);
  REQUIRE(duplicate.targets[0].closes == 1);
  REQUIRE(duplicate.targets[1].closes == 0);
}
TEST_CASE("Public DVC registry reuses an unpublished closed slot with fresh claim ownership") {
  Fixture f({1, 8, 8, 100});
  REQUIRE(f.bind(0, 1).status == CHANNEL_RC_OK);
  REQUIRE(f.admit(1, 4));
  REQUIRE(f.targets[0].proxy->OnClose(f.targets[0].proxy) == CHANNEL_RC_OK);
  REQUIRE_FALSE(f.registry.contains(1));
  REQUIRE(f.registry.stats().budget.releases == 1);
  REQUIRE(f.bind(1, 2, 50).status == CHANNEL_RC_OK);
  REQUIRE(f.registry.stats().reused_slots == 1);
  REQUIRE(f.registry.stats().active_channels == 1);
  REQUIRE(f.admit(2, 8, 50));
  REQUIRE(f.data(1) == CHANNEL_RC_OK);
  REQUIRE(f.registry.stats().budget.releases == 2);
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
  REQUIRE(f.targets[0].closes == 1);
  REQUIRE(f.targets[1].closes == 1);
}
TEST_CASE("Public DVC registry joins reentrant retirement without freeing an active callback") {
  Fixture f;
  REQUIRE(f.bind(0, 1).status == CHANNEL_RC_OK);
  REQUIRE(f.bind(1, 2).status == CHANNEL_RC_OK);
  REQUIRE(f.admit(1, 4));
  f.data_retire = true;
  REQUIRE(f.data(0) == CHANNEL_RC_OK);
  REQUIRE(f.nested_status == ERROR_IO_PENDING);
  REQUIRE_FALSE(f.retired_during_callback);
  REQUIRE(f.registry.stats().resources_retired);
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
  REQUIRE(f.targets[0].closes == 1);
  REQUIRE(f.targets[1].closes == 1);
}
TEST_CASE(
    "Public DVC registry detects aggregate/deadline/callback failures before another admission") {
  for (unsigned failure = 0; failure < 3; ++failure) {
    Fixture f;
    REQUIRE(f.bind(0, 1).status == CHANNEL_RC_OK);
    REQUIRE(f.bind(1, 2).status == CHANNEL_RC_OK);
    REQUIRE(f.admit(1, 6));
    if (failure == 0)
      REQUIRE_FALSE(f.admit(2, 3));
    else if (failure == 1) {
      f.now = 101;
      REQUIRE_FALSE(f.registry.poll(101));
    } else {
      f.data_error = true;
      REQUIRE(f.data(0) == ERROR_ACCESS_DENIED);
      REQUIRE_FALSE(f.admit(2, 1));
    }
    REQUIRE(f.registry.stats().failed);
    REQUIRE(f.registry.stats().failures == 1);
    REQUIRE(f.registry.retire() != CHANNEL_RC_OK);
    REQUIRE(f.registry.stats().resources_retired);
    REQUIRE(f.targets[0].closes == 1);
    REQUIRE(f.targets[1].closes == 1);
    REQUIRE_FALSE(f.admit(1, 1));
    REQUIRE(f.registry.stats().failures == 1);
  }
}
TEST_CASE("Public DVC registry validates public delegates and cancels reentrant ID resolution") {
  Fixture cancelled;
  cancelled.resolve_retire = true;
  REQUIRE(cancelled.bind(0, 1).status == ERROR_INVALID_STATE);
  REQUIRE(cancelled.nested_status == ERROR_IO_PENDING);
  REQUIRE(cancelled.targets[0].closes == 0);
  REQUIRE(cancelled.registry.stats().resources_retired);
  REQUIRE_FALSE(cancelled.registry.stats().failed);
  Fixture exception;
  exception.throw_id = true;
  REQUIRE(exception.bind(0, 1).status == ERROR_INTERNAL_ERROR);
  REQUIRE(exception.registry.stats().failed);
  REQUIRE(exception.targets[0].closes == 0);
  Fixture missing;
  missing.manager.GetChannelId = nullptr;
  REQUIRE(missing.bind(0, 1).status == ERROR_INVALID_PARAMETER);
  REQUIRE(missing.targets[0].closes == 0);
  REQUIRE_THROWS_AS(DvcChannelRegistry(nullptr), std::invalid_argument);
  DvcAllocationLimits limits;
  limits.encoded_bytes = 0;
  REQUIRE_THROWS_AS(DvcChannelRegistry(Fixture::clock, nullptr, {}, limits), std::invalid_argument);
}
