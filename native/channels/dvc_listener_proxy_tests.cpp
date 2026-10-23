#include "dvc_listener_proxy.hpp"
#include <catch2/catch_test_macros.hpp>
#include <stdexcept>
#include <winpr/error.h>
using namespace bridge::channels;
namespace {
struct Fixture {
  struct Channel {
    IWTSVirtualChannel api{};
    UINT32 id = 1;
  } channel;
  struct Listener {
    IWTSListenerCallback api{};
    Fixture *owner;
  } listener{{}, this};
  struct Target {
    IWTSVirtualChannelCallback api{};
    Fixture *owner;
  } target{{}, this};
  IWTSVirtualChannelManager manager{};
  DvcChannelRegistry registry{clock, this, {1, 8, 8, 100}};
  std::unique_ptr<DvcListenerProxy> proxy;
  unsigned factories = 0, closes = 0;
  UINT factory_status = CHANNEL_RC_OK;
  bool accept_factory = true, null_target = false, throw_factory = false, throw_clock = false;
  enum class Reenter { none, close, factory } reenter = Reenter::none;
  UINT nested_status = 0;
  BYTE *received_data = nullptr;
  IWTSVirtualChannel *received_channel = nullptr;
  Fixture() {
    manager.GetChannelId = [](IWTSVirtualChannel *p) -> UINT32 {
      return reinterpret_cast<Channel *>(p)->id;
    };
    target.api.OnDataReceived = [](IWTSVirtualChannelCallback *, wStream *) -> UINT {
      return CHANNEL_RC_OK;
    };
    target.api.OnClose = [](IWTSVirtualChannelCallback *p) -> UINT {
      ++reinterpret_cast<Target *>(p)->owner->closes;
      return CHANNEL_RC_OK;
    };
    listener.api.pInterface = &listener;
    listener.api.OnNewChannelConnection = [](IWTSListenerCallback *p, IWTSVirtualChannel *channel,
                                             BYTE *data, BOOL *accept,
                                             IWTSVirtualChannelCallback **out) -> UINT {
      auto &f = *reinterpret_cast<Listener *>(p)->owner;
      ++f.factories;
      f.received_channel = channel;
      f.received_data = data;
      *accept = f.accept_factory ? TRUE : FALSE;
      *out = f.null_target ? nullptr : &f.target.api;
      if (f.reenter == Reenter::close)
        f.proxy->close();
      if (f.reenter == Reenter::factory) {
        BOOL nested_accept = TRUE;
        IWTSVirtualChannelCallback *nested_out = &f.target.api;
        f.nested_status = f.proxy->interface()->OnNewChannelConnection(
            f.proxy->interface(), channel, data, &nested_accept, &nested_out);
      }
      if (f.throw_factory)
        throw std::runtime_error("fixture");
      return f.factory_status;
    };
    proxy = std::make_unique<DvcListenerProxy>(registry, manager, listener.api, clock, this);
  }
  ~Fixture() {
    proxy->close();
    (void)registry.retire();
  }
  static std::uint64_t clock(void *p) {
    auto &f = *static_cast<Fixture *>(p);
    if (f.throw_clock)
      throw std::runtime_error("fixture");
    return 1;
  }
  UINT open(BOOL &accept, IWTSVirtualChannelCallback *&out, BYTE *data = nullptr) {
    return proxy->interface()->OnNewChannelConnection(proxy->interface(), &channel.api, data,
                                                      &accept, &out);
  }
};
} // namespace
TEST_CASE("Public listener proxy preserves factory arguments and publishes only accepted registry "
          "callback") {
  Fixture f;
  BOOL accept = FALSE;
  IWTSVirtualChannelCallback *out = nullptr;
  BYTE data = 5;
  REQUIRE(f.open(accept, out, &data) == CHANNEL_RC_OK);
  REQUIRE(accept);
  REQUIRE(out);
  REQUIRE(out != &f.target.api);
  REQUIRE(f.proxy->interface()->pInterface == f.listener.api.pInterface);
  REQUIRE(f.received_channel == &f.channel.api);
  REQUIRE(f.received_data == &data);
  REQUIRE(f.closes == 0);
  REQUIRE(f.proxy->stats().accepted == 1);
  REQUIRE(f.registry.retire() == CHANNEL_RC_OK);
  REQUIRE(f.closes == 1);
}
TEST_CASE(
    "Public listener failed/denied factories never transfer target ownership or invoke close") {
  for (unsigned refusal = 0; refusal < 3; ++refusal) {
    Fixture f;
    f.factory_status = refusal == 0 ? ERROR_ACCESS_DENIED : CHANNEL_RC_OK;
    f.accept_factory = refusal == 0;
    f.throw_factory = refusal == 2;
    BOOL accept = TRUE;
    IWTSVirtualChannelCallback *out = &f.target.api;
    const UINT expected =
        refusal == 0 ? ERROR_ACCESS_DENIED : (refusal == 2 ? ERROR_INTERNAL_ERROR : CHANNEL_RC_OK);
    REQUIRE(f.open(accept, out) == expected);
    REQUIRE_FALSE(accept);
    REQUIRE(out == nullptr);
    REQUIRE(f.closes == 0);
    REQUIRE(f.registry.stats().bindings == 0);
    REQUIRE(f.proxy->stats().failed == (refusal == 2));
  }
}
TEST_CASE(
    "Public listener missing accepted target fails without publishing an undefined callback") {
  Fixture f;
  f.null_target = true;
  BOOL accept = TRUE;
  IWTSVirtualChannelCallback *out = &f.target.api;
  REQUIRE(f.open(accept, out) == ERROR_INVALID_DATA);
  REQUIRE_FALSE(accept);
  REQUIRE(out == nullptr);
  REQUIRE(f.proxy->stats().failed);
  REQUIRE(f.registry.stats().bindings == 0);
}
TEST_CASE(
    "Public listener clock failure closes transferred accepted target once without publication") {
  Fixture f;
  f.throw_clock = true;
  BOOL accept = TRUE;
  IWTSVirtualChannelCallback *out = nullptr;
  REQUIRE(f.open(accept, out) == ERROR_INTERNAL_ERROR);
  REQUIRE_FALSE(accept);
  REQUIRE(out == nullptr);
  REQUIRE(f.closes == 1);
  REQUIRE(f.proxy->stats().cleanup_status == CHANNEL_RC_OK);
  REQUIRE(f.proxy->stats().failed);
}
TEST_CASE("Public listener reentrant close/factory cancels late transferred target and prevents "
          "double dispatch") {
  for (auto mode : {Fixture::Reenter::close, Fixture::Reenter::factory}) {
    Fixture f;
    f.reenter = mode;
    BOOL accept = TRUE;
    IWTSVirtualChannelCallback *out = nullptr;
    REQUIRE(f.open(accept, out) != CHANNEL_RC_OK);
    REQUIRE_FALSE(accept);
    REQUIRE(out == nullptr);
    REQUIRE(f.factories == 1);
    REQUIRE(f.closes == 1);
    REQUIRE(f.proxy->stats().closed);
    REQUIRE(f.proxy->stats().failed == (mode == Fixture::Reenter::factory));
    REQUIRE(f.registry.stats().bindings == 0);
    REQUIRE(f.open(accept, out) == ERROR_INVALID_STATE);
    REQUIRE(f.factories == 1);
  }
}
TEST_CASE(
    "Public listener duplicate accepted alias stays with registry owner without double close") {
  Fixture f;
  BOOL accept = FALSE;
  IWTSVirtualChannelCallback *out = nullptr;
  REQUIRE(f.open(accept, out) == CHANNEL_RC_OK);
  f.channel.id = 2;
  REQUIRE(f.open(accept, out) == ERROR_ALREADY_EXISTS);
  REQUIRE_FALSE(accept);
  REQUIRE(out == nullptr);
  REQUIRE(f.closes == 0);
  REQUIRE(f.registry.retire() == ERROR_ALREADY_EXISTS);
  REQUIRE(f.closes == 1);
}
TEST_CASE(
    "Public listener validates delegates and refuses malformed output pointers before factory") {
  Fixture f;
  BOOL accept = TRUE;
  IWTSVirtualChannelCallback *out = nullptr;
  REQUIRE(f.proxy->interface()->OnNewChannelConnection(f.proxy->interface(), nullptr, nullptr,
                                                       &accept, &out) == ERROR_INVALID_PARAMETER);
  REQUIRE_FALSE(accept);
  REQUIRE(f.factories == 0);
  IWTSListenerCallback missing{};
  REQUIRE_THROWS_AS(DvcListenerProxy(f.registry, f.manager, missing, Fixture::clock),
                    std::invalid_argument);
  REQUIRE_THROWS_AS(DvcListenerProxy(f.registry, f.manager, f.listener.api, nullptr),
                    std::invalid_argument);
}
