#include "dvc_channel_handoff.hpp"
#include <catch2/catch_test_macros.hpp>
#include <memory>
#include <stdexcept>
#include <winpr/error.h>
using namespace bridge::channels;
namespace {
struct Fixture {
  struct Channel {
    IWTSVirtualChannel api{};
    UINT32 id;
  } channel{{}, 1};
  struct Target {
    IWTSVirtualChannelCallback api{};
    Fixture *owner;
  };
  IWTSVirtualChannelManager manager{};
  DvcChannelRegistry registry{[](void *) -> std::uint64_t { return 1; }, nullptr, {1, 8, 8, 100}};
  std::unique_ptr<Target> target = std::make_unique<Target>(Target{{}, this});
  unsigned closes = 0;
  UINT close_status = CHANNEL_RC_OK;
  bool destroy_self = false, throw_close = false;
  Fixture() {
    manager.GetChannelId = [](IWTSVirtualChannel *p) -> UINT32 {
      return reinterpret_cast<Channel *>(p)->id;
    };
    target->api.OnDataReceived = [](IWTSVirtualChannelCallback *, wStream *) -> UINT {
      return CHANNEL_RC_OK;
    };
    target->api.OnClose = [](IWTSVirtualChannelCallback *p) -> UINT {
      auto &f = *reinterpret_cast<Target *>(p)->owner;
      ++f.closes;
      const auto status = f.close_status;
      if (f.destroy_self)
        f.target.reset();
      if (f.throw_close)
        throw std::runtime_error("fixture");
      return status;
    };
  }
  ~Fixture() { (void)registry.retire(); }
  DvcAcceptedChannelResult handoff() {
    return handoff_accepted_channel(registry, manager, channel.api, target->api, 1);
  }
};
} // namespace
TEST_CASE("Accepted DVC handoff transfers live callback to registry without closing it early") {
  Fixture f;
  const auto result = f.handoff();
  REQUIRE(result.status == CHANNEL_RC_OK);
  REQUIRE(result.callback);
  REQUIRE_FALSE(result.close_invoked);
  REQUIRE_FALSE(result.already_owned);
  REQUIRE(f.registry.owns_callback(f.target->api));
  REQUIRE(f.closes == 0);
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
  REQUIRE(f.closes == 1);
}
TEST_CASE("Rejected accepted DVC handoff closes new callback once even when it destroys itself") {
  Fixture f;
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
  f.destroy_self = true;
  const auto result = f.handoff();
  REQUIRE(result.status == ERROR_INVALID_STATE);
  REQUIRE(result.callback == nullptr);
  REQUIRE(result.close_invoked);
  REQUIRE(result.cleanup_status == CHANNEL_RC_OK);
  REQUIRE(f.target == nullptr);
  REQUIRE(f.closes == 1);
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
  REQUIRE(f.closes == 1);
}
TEST_CASE("Accepted DVC alias handoff preserves existing owner and never closes its target twice") {
  Fixture f;
  REQUIRE(f.handoff().status == CHANNEL_RC_OK);
  f.channel.id = 2;
  const auto rejected = f.handoff();
  REQUIRE(rejected.status == ERROR_ALREADY_EXISTS);
  REQUIRE(rejected.already_owned);
  REQUIRE_FALSE(rejected.close_invoked);
  REQUIRE(f.closes == 0);
  REQUIRE(f.registry.retire() == ERROR_ALREADY_EXISTS);
  REQUIRE(f.closes == 1);
  REQUIRE_FALSE(f.registry.owns_callback(f.target->api));
}
TEST_CASE("Rejected accepted DVC handoff preserves uncertain close status without retry") {
  for (bool exception : {false, true}) {
    Fixture f;
    REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
    f.close_status = ERROR_ACCESS_DENIED;
    f.throw_close = exception;
    const auto rejected = f.handoff();
    const UINT expected = exception ? ERROR_INTERNAL_ERROR : ERROR_ACCESS_DENIED;
    REQUIRE(rejected.status == ERROR_INVALID_STATE);
    REQUIRE(rejected.cleanup_status == expected);
    REQUIRE(rejected.close_invoked);
    REQUIRE(f.closes == 1);
    REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
    REQUIRE(f.closes == 1);
  }
}
TEST_CASE("Accepted DVC handoff reports missing close obligation instead of claiming release") {
  Fixture f;
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
  f.target->api.OnClose = nullptr;
  const auto rejected = f.handoff();
  REQUIRE(rejected.status == ERROR_INVALID_STATE);
  REQUIRE(rejected.cleanup_status == ERROR_NOT_SUPPORTED);
  REQUIRE_FALSE(rejected.close_invoked);
  REQUIRE(f.closes == 0);
}
