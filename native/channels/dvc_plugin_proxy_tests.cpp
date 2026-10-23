#include "dvc_plugin_proxy.hpp"
#include <catch2/catch_test_macros.hpp>
#include <memory>
#include <stdexcept>
#include <vector>
#include <winpr/error.h>
using namespace bridge::channels;
namespace {
struct Fixture {
  IWTSPlugin original{};
  IWTSVirtualChannelManager native{}, facade{};
  IWTSVirtualChannelManager *received = nullptr;
  std::unique_ptr<DvcPluginProxy> proxy;
  std::vector<unsigned> calls;
  DWORD disconnect_code = 0;
  UINT status = CHANNEL_RC_OK, nested = 0;
  bool cancel_resolve = false, null_resolve = false, throw_resolve = false,
       terminate_reentrant = false;
  Fixture() {
    original.pInterface = this;
    original.Initialize = [](IWTSPlugin *p, IWTSVirtualChannelManager *m) -> UINT {
      auto &f = *static_cast<Fixture *>(p->pInterface);
      f.calls.push_back(0);
      f.received = m;
      if (f.terminate_reentrant)
        f.nested = f.proxy->interface()->Terminated(f.proxy->interface());
      return f.status;
    };
    original.Connected = [](IWTSPlugin *p) -> UINT {
      auto &f = *static_cast<Fixture *>(p->pInterface);
      f.calls.push_back(1);
      return f.status;
    };
    original.Disconnected = [](IWTSPlugin *p, DWORD code) -> UINT {
      auto &f = *static_cast<Fixture *>(p->pInterface);
      f.calls.push_back(2);
      f.disconnect_code = code;
      return f.status;
    };
    original.Attached = [](IWTSPlugin *p) -> UINT {
      auto &f = *static_cast<Fixture *>(p->pInterface);
      f.calls.push_back(3);
      return f.status;
    };
    original.Detached = [](IWTSPlugin *p) -> UINT {
      auto &f = *static_cast<Fixture *>(p->pInterface);
      f.calls.push_back(4);
      return f.status;
    };
    original.Terminated = [](IWTSPlugin *p) -> UINT {
      auto &f = *static_cast<Fixture *>(p->pInterface);
      f.calls.push_back(5);
      return f.status;
    };
    proxy = std::make_unique<DvcPluginProxy>(original, resolve, this);
  }
  static IWTSVirtualChannelManager *resolve(void *p, IWTSVirtualChannelManager &m) {
    auto &f = *static_cast<Fixture *>(p);
    if (&m != &f.native)
      return nullptr;
    if (f.throw_resolve)
      throw std::runtime_error("fixture");
    if (f.cancel_resolve)
      f.proxy->close();
    return f.null_resolve ? nullptr : &f.facade;
  }
};
} // namespace
TEST_CASE("Public DVC plugin proxy delegates original identity and resolved shared manager") {
  Fixture f;
  auto *api = f.proxy->interface();
  REQUIRE(api->pInterface == f.original.pInterface);
  REQUIRE(api->Initialize(api, &f.native) == CHANNEL_RC_OK);
  REQUIRE(f.received == &f.facade);
  REQUIRE(api->Initialize(api, &f.native) == ERROR_INVALID_STATE);
  REQUIRE(api->Connected(api) == CHANNEL_RC_OK);
  REQUIRE(api->Attached(api) == CHANNEL_RC_OK);
  f.proxy->close();
  REQUIRE(api->Connected(api) == ERROR_INVALID_STATE);
  REQUIRE(api->Attached(api) == ERROR_INVALID_STATE);
  REQUIRE(api->Disconnected(api, 42) == CHANNEL_RC_OK);
  REQUIRE(f.disconnect_code == 42);
  REQUIRE(api->Detached(api) == CHANNEL_RC_OK);
  REQUIRE(api->Terminated(api) == CHANNEL_RC_OK);
  REQUIRE(api->Terminated(api) == CHANNEL_RC_OK);
  REQUIRE(f.calls == std::vector<unsigned>{0, 1, 3, 2, 4, 5});
  REQUIRE(api->Detached(api) == ERROR_INVALID_STATE);
}
TEST_CASE(
    "Public DVC plugin manager resolution failure and cancellation never initialize raw plugin") {
  for (unsigned mode = 0; mode < 3; ++mode) {
    Fixture f;
    f.null_resolve = mode == 0;
    f.throw_resolve = mode == 1;
    f.cancel_resolve = mode == 2;
    auto *api = f.proxy->interface();
    REQUIRE(api->Initialize(api, &f.native) != CHANNEL_RC_OK);
    REQUIRE(f.calls.empty());
    REQUIRE(f.proxy->stats().closed);
    REQUIRE(f.proxy->stats().failed == (mode != 2));
    REQUIRE(api->Initialize(api, &f.native) == ERROR_INVALID_STATE);
    REQUIRE(api->Terminated(api) == CHANNEL_RC_OK);
    REQUIRE(f.calls == std::vector<unsigned>{5});
  }
}
TEST_CASE(
    "Public DVC plugin proxy refuses termination during borrowed callback then terminates once") {
  Fixture f;
  f.terminate_reentrant = true;
  auto *api = f.proxy->interface();
  REQUIRE(api->Initialize(api, &f.native) == CHANNEL_RC_OK);
  REQUIRE(f.nested == ERROR_IO_PENDING);
  REQUIRE_FALSE(f.proxy->stats().ended);
  REQUIRE(api->Terminated(api) == CHANNEL_RC_OK);
  REQUIRE(f.calls == std::vector<unsigned>{0, 5});
}
TEST_CASE(
    "Public DVC plugin proxy retains failed notification and never retries uncertain termination") {
  Fixture f;
  f.status = ERROR_ACCESS_DENIED;
  auto *api = f.proxy->interface();
  REQUIRE(api->Connected(api) == ERROR_ACCESS_DENIED);
  REQUIRE(f.proxy->stats().failed);
  REQUIRE(api->Connected(api) == ERROR_INVALID_STATE);
  REQUIRE(api->Terminated(api) == ERROR_ACCESS_DENIED);
  REQUIRE(api->Terminated(api) == ERROR_ACCESS_DENIED);
  REQUIRE(f.calls == std::vector<unsigned>{1, 5});
}
TEST_CASE("Public DVC plugin proxy survives self-deleting and throwing terminal callback") {
  for (bool exception : {false, true}) {
    unsigned terminal_calls = 0;
    auto *raw = new IWTSPlugin{};
    raw->pInterface = &terminal_calls;
    raw->Terminated = [](IWTSPlugin *p) -> UINT {
      ++*static_cast<unsigned *>(p->pInterface);
      delete p;
      return ERROR_ACCESS_DENIED;
    };
    if (exception)
      raw->Terminated = [](IWTSPlugin *p) -> UINT {
        ++*static_cast<unsigned *>(p->pInterface);
        delete p;
        throw std::runtime_error("fixture");
      };
    DvcPluginProxy proxy(*raw, [](void *, IWTSVirtualChannelManager &m) { return &m; });
    auto *api = proxy.interface();
    const UINT expected = exception ? ERROR_INTERNAL_ERROR : ERROR_ACCESS_DENIED;
    REQUIRE(api->Terminated(api) == expected);
    REQUIRE(api->Terminated(api) == expected);
    REQUIRE(terminal_calls == 1);
    REQUIRE(proxy.stats().ended);
    REQUIRE(proxy.stats().failed);
  }
}
TEST_CASE("Public DVC plugin proxy handles absent optional callbacks and invalid input") {
  IWTSPlugin raw{};
  DvcPluginProxy proxy(raw, [](void *, IWTSVirtualChannelManager &m) { return &m; });
  auto *api = proxy.interface();
  IWTSVirtualChannelManager manager{};
  REQUIRE(api->Initialize(api, nullptr) == ERROR_INVALID_PARAMETER);
  REQUIRE(api->Initialize(api, &manager) == CHANNEL_RC_OK);
  REQUIRE(api->Connected(api) == CHANNEL_RC_OK);
  REQUIRE(api->Attached(api) == CHANNEL_RC_OK);
  REQUIRE(api->Disconnected(api, 0) == CHANNEL_RC_OK);
  REQUIRE(api->Detached(api) == CHANNEL_RC_OK);
  REQUIRE(api->Terminated(api) == CHANNEL_RC_OK);
  REQUIRE_THROWS_AS(DvcPluginProxy(raw, nullptr), std::invalid_argument);
}
