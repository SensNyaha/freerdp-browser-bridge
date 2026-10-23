#include "dvc_completion_hook.hpp"
#include <catch2/catch_test_macros.hpp>
#include <memory>
#include <stdexcept>
#include <vector>
#include <winpr/error.h>
#include <winpr/stream.h>
using namespace bridge::channels;
namespace {
struct Fixture {
  DvcMessageBudget budget{{2, 16, 16, 100}};
  struct Target {
    IWTSVirtualChannelCallback api{};
    Fixture *owner;
  };
  std::unique_ptr<Target> target = std::make_unique<Target>(Target{{}, this});
  std::unique_ptr<DvcCompletionHook> hook;
  IWTSVirtualChannelCallback *proxy = nullptr;
  unsigned opens = 0, deliveries = 0, closes = 0;
  UINT data_status = CHANNEL_RC_OK, open_status = CHANNEL_RC_OK, close_status = CHANNEL_RC_OK;
  UINT nested_status = 0;
  std::uint64_t now = 2;
  bool throw_data = false, throw_open = false, throw_close = false, throw_clock = false;
  bool delete_original = false;
  bool closed_during_close = false;
  enum class Reenter {
    none,
    data,
    open,
    close,
    retire,
    retire_during_close
  } reenter = Reenter::none;
  std::size_t charged_during_data = 0;
  wStream *observed_stream = nullptr;
  std::vector<unsigned> order;
  int interface_marker = 0;
  Fixture() {
    target->api.pInterface = &interface_marker;
    target->api.OnOpen = [](IWTSVirtualChannelCallback *p) -> UINT {
      auto &f = *reinterpret_cast<Target *>(p)->owner;
      ++f.opens;
      if (f.throw_open)
        throw std::runtime_error("fixture");
      return f.open_status;
    };
    target->api.OnDataReceived = [](IWTSVirtualChannelCallback *p, wStream *stream) -> UINT {
      auto &f = *reinterpret_cast<Target *>(p)->owner;
      ++f.deliveries;
      f.order.push_back(1);
      f.observed_stream = stream;
      f.charged_during_data = f.budget.stats().reserved_bytes;
      switch (f.reenter) {
      case Reenter::data:
        f.nested_status = f.proxy->OnDataReceived(f.proxy, stream);
        break;
      case Reenter::open:
        f.nested_status = f.proxy->OnOpen(f.proxy);
        break;
      case Reenter::close:
        f.nested_status = f.proxy->OnClose(f.proxy);
        break;
      case Reenter::retire:
        f.nested_status = f.hook->retire();
        break;
      default:
        break;
      }
      f.order.push_back(2);
      if (f.throw_data)
        throw std::runtime_error("fixture");
      return f.data_status;
    };
    target->api.OnClose = [](IWTSVirtualChannelCallback *p) -> UINT {
      auto &f = *reinterpret_cast<Target *>(p)->owner;
      ++f.closes;
      f.order.push_back(3);
      const auto status = f.close_status;
      if (f.reenter == Reenter::retire_during_close)
        f.nested_status = f.hook->retire();
      f.closed_during_close = f.hook->closed();
      if (f.delete_original)
        f.target.reset(); // Proxy must not read this callback again after return.
      if (f.throw_close)
        throw std::runtime_error("fixture");
      return status;
    };
    hook = std::make_unique<DvcCompletionHook>(budget, 7, target->api, clock, this);
    proxy = hook->interface();
  }
  ~Fixture() {
    (void)hook->retire();
    budget.close();
  }
  static std::uint64_t clock(void *context) {
    auto &f = *static_cast<Fixture *>(context);
    if (f.throw_clock)
      throw std::runtime_error("fixture");
    return f.now;
  }
  UINT data() {
    BYTE bytes[]{1, 2, 3, 4};
    std::unique_ptr<wStream, void (*)(wStream *)> stream(Stream_New(bytes, sizeof(bytes)),
                                                         [](wStream *s) { Stream_Free(s, FALSE); });
    if (!stream)
      return ERROR_NOT_ENOUGH_MEMORY;
    return proxy->OnDataReceived(proxy, stream.get());
  }
};
} // namespace
TEST_CASE(
    "Public DVC completion proxy preserves interface/stream and releases only after callback") {
  Fixture f;
  REQUIRE(f.proxy->pInterface == &f.interface_marker);
  REQUIRE(f.budget.reserve(7, 4, 1));
  REQUIRE(f.proxy->OnOpen(f.proxy) == CHANNEL_RC_OK);
  REQUIRE(f.budget.stats().reserved_bytes == 4);
  REQUIRE(f.data() == CHANNEL_RC_OK);
  REQUIRE(f.observed_stream);
  REQUIRE(f.charged_during_data == 4);
  REQUIRE(f.budget.stats().reserved_bytes == 0);
  REQUIRE(f.budget.stats().releases == 1);
  REQUIRE(f.data() == CHANNEL_RC_OK); // Standalone DATA completion has no reservation.
  REQUIRE_FALSE(f.hook->failed());
  REQUIRE(f.proxy->OnClose(f.proxy) == CHANNEL_RC_OK);
  REQUIRE(f.hook->retire() == CHANNEL_RC_OK);
  REQUIRE(f.closes == 1);
  REQUIRE(f.hook->closed());
  REQUIRE(f.data() == ERROR_INVALID_STATE);
}
TEST_CASE("Public DVC callback error/exception and completion clock faults never replay data") {
  for (unsigned failure = 0; failure < 4; ++failure) {
    Fixture f;
    REQUIRE(f.budget.reserve(7, 4, 1));
    f.data_status = failure == 0 ? ERROR_ACCESS_DENIED : CHANNEL_RC_OK;
    f.throw_data = failure == 1;
    f.throw_clock = failure == 2;
    f.now = failure == 3 ? 101 : 2;
    REQUIRE(f.data() != CHANNEL_RC_OK);
    REQUIRE(f.hook->failed());
    REQUIRE(f.data() == ERROR_INVALID_STATE);
    REQUIRE(f.deliveries == 1);
    REQUIRE(f.hook->retire() != CHANNEL_RC_OK);
    REQUIRE(f.closes == 1);
  }
}
TEST_CASE("Public DVC nested close waits for active data before destroying original callback") {
  for (const auto mode : {Fixture::Reenter::close, Fixture::Reenter::retire}) {
    Fixture f;
    f.reenter = mode;
    f.delete_original = true;
    REQUIRE(f.budget.reserve(7, 4, 1));
    REQUIRE(f.data() == CHANNEL_RC_OK);
    const UINT expected = mode == Fixture::Reenter::close ? CHANNEL_RC_OK : ERROR_IO_PENDING;
    REQUIRE(f.nested_status == expected);
    REQUIRE(f.order == std::vector<unsigned>{1, 2, 3});
    REQUIRE(f.target == nullptr);
    REQUIRE(f.hook->closed());
    REQUIRE_FALSE(f.hook->failed());
    REQUIRE(f.budget.stats().releases == 1);
    REQUIRE(f.hook->retire() == CHANNEL_RC_OK);
    REQUIRE(f.closes == 1);
  }
}
TEST_CASE(
    "Public DVC nested data/open faults cannot dispatch twice but still retire original once") {
  for (const auto mode : {Fixture::Reenter::data, Fixture::Reenter::open}) {
    Fixture f;
    f.reenter = mode;
    REQUIRE(f.data() == ERROR_INVALID_DATA);
    REQUIRE(f.nested_status == ERROR_INVALID_DATA);
    REQUIRE(f.deliveries == 1);
    REQUIRE(f.opens == 0);
    REQUIRE(f.hook->retire() == ERROR_INVALID_DATA);
    REQUIRE(f.closes == 1);
  }
}
TEST_CASE("Public DVC close joins pending self-retirement and releases partial ownership once") {
  Fixture f;
  f.reenter = Fixture::Reenter::retire_during_close;
  f.delete_original = true;
  REQUIRE(f.budget.reserve(7, 4, 1));
  REQUIRE(f.hook->retire() == CHANNEL_RC_OK);
  REQUIRE(f.nested_status == ERROR_IO_PENDING);
  REQUIRE_FALSE(f.closed_during_close);
  REQUIRE(f.budget.stats().releases == 1);
  REQUIRE(f.hook->retire() == CHANNEL_RC_OK);
  REQUIRE(f.closes == 1);
}
TEST_CASE(
    "Public DVC completion proxy preserves failed lifecycle statuses and validates delegates") {
  for (bool exception : {false, true}) {
    Fixture f;
    f.open_status = ERROR_ACCESS_DENIED;
    f.throw_open = exception;
    const UINT expected = exception ? ERROR_INTERNAL_ERROR : ERROR_ACCESS_DENIED;
    REQUIRE(f.proxy->OnOpen(f.proxy) == expected);
    REQUIRE(f.hook->failed());
    f.close_status = ERROR_ACCESS_DENIED;
    f.throw_close = exception;
    REQUIRE(f.hook->retire() == expected);
    REQUIRE(f.closes == 1);
    REQUIRE(f.hook->retire() == expected);
  }
  DvcMessageBudget budget;
  IWTSVirtualChannelCallback missing{};
  REQUIRE_THROWS_AS(DvcCompletionHook(budget, 0, missing, Fixture::clock), std::invalid_argument);
  missing.OnDataReceived = [](IWTSVirtualChannelCallback *, wStream *) -> UINT {
    return CHANNEL_RC_OK;
  };
  REQUIRE_THROWS_AS(DvcCompletionHook(budget, 0, missing, nullptr), std::invalid_argument);
}

TEST_CASE("Public DVC optional lifecycle delegates and normal global retirement preserve success") {
  DvcMessageBudget budget;
  IWTSVirtualChannelCallback target{};
  target.OnDataReceived = [](IWTSVirtualChannelCallback *, wStream *) -> UINT {
    return CHANNEL_RC_OK;
  };
  DvcCompletionHook hook(budget, 0, target, [](void *) -> std::uint64_t { return 1; });
  auto *proxy = hook.interface();
  REQUIRE(proxy->OnOpen(proxy) == CHANNEL_RC_OK);
  REQUIRE(budget.reserve(0, 1, 1));
  budget.close(); // Table retirement alone is not host close: original must still be retired.
  REQUIRE(proxy->OnClose(proxy) == CHANNEL_RC_OK);
  REQUIRE(hook.closed());
  REQUIRE_FALSE(hook.failed());
  REQUIRE(hook.retire() == CHANNEL_RC_OK);
}
TEST_CASE(
    "Public DVC null stream is refused before application dispatch and retains close obligation") {
  Fixture f;
  REQUIRE(f.proxy->OnDataReceived(f.proxy, nullptr) == ERROR_INVALID_DATA);
  REQUIRE(f.deliveries == 0);
  REQUIRE(f.hook->failed());
  REQUIRE(f.hook->retire() == ERROR_INVALID_DATA);
  REQUIRE(f.closes == 1);
}
