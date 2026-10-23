#include "addin_scope.hpp"
#include <catch2/catch_test_macros.hpp>
#include <thread>
#include <winpr/error.h>

using bridge::channels::AddinScope;
namespace {
BOOL VCAPITYPE unused_entry(PCHANNEL_ENTRY_POINTS) { return FALSE; }
template <DWORD Index> PVIRTUALCHANNELENTRY loader(LPCSTR, LPCSTR, LPCSTR, DWORD flags) {
  return flags == Index ? unused_entry : nullptr;
}
constexpr std::array<FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN, 9> callbacks{
    loader<1>, loader<2>, loader<3>, loader<4>, loader<5>,
    loader<6>, loader<7>, loader<8>, loader<9>};
struct Fixture {
  FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN original = freerdp_get_current_addin_provider();
  rdpContext context{}, other{};
  std::array<AddinScope, 9> scopes;
  ~Fixture() {
    for (auto it = scopes.rbegin(); it != scopes.rend(); ++it)
      (void)it->close();
    (void)freerdp_register_addin_provider(original, 0);
  }
};
} // namespace
TEST_CASE("Owned addin scopes delegate through a bounded LIFO chain") {
  Fixture f;
  REQUIRE(f.scopes[0].bind(f.context, callbacks[0]) == CHANNEL_RC_OK);
  REQUIRE(f.scopes[0].previous() == f.original);
  REQUIRE(f.scopes[1].bind(f.context, callbacks[1]) == CHANNEL_RC_OK);
  REQUIRE(f.scopes[1].previous() == callbacks[0]);
  REQUIRE(f.scopes[0].active());
  REQUIRE(f.scopes[1].active());
  REQUIRE_FALSE(f.scopes[0].top());
  REQUIRE(f.scopes[0].close() == ERROR_INVALID_STATE);
  REQUIRE(f.scopes[0].bound());
  REQUIRE(freerdp_get_current_addin_provider() == callbacks[1]);
  REQUIRE(f.scopes[1].close() == CHANNEL_RC_OK);
  REQUIRE_FALSE(f.scopes[1].active());
  REQUIRE(f.scopes[0].top());
  REQUIRE(freerdp_get_current_addin_provider() == callbacks[0]);
  REQUIRE(f.scopes[1].bind(f.context, callbacks[1]) == ERROR_INVALID_STATE);
  REQUIRE(f.scopes[0].close() == CHANNEL_RC_OK);
  REQUIRE(f.scopes[0].close() == CHANNEL_RC_OK);
  REQUIRE(freerdp_get_current_addin_provider() == f.original);
}
TEST_CASE("Addin scope capacity and duplicate callbacks fail before registry mutation") {
  Fixture f;
  REQUIRE(f.scopes[0].bind(f.context, nullptr) == ERROR_INVALID_STATE);
  REQUIRE(f.scopes[0].bind(f.context, callbacks[0]) == CHANNEL_RC_OK);
  REQUIRE(f.scopes[1].bind(f.context, callbacks[0]) == ERROR_INVALID_STATE);
  for (std::size_t i = 1; i < 8; ++i) {
    REQUIRE(f.scopes[i].bind(f.context, callbacks[i]) == CHANNEL_RC_OK);
    REQUIRE(f.scopes[0].active());
  }
  REQUIRE(f.scopes[8].bind(f.context, callbacks[8]) == ERROR_NOT_ENOUGH_MEMORY);
  REQUIRE_FALSE(f.scopes[8].bound());
  REQUIRE(freerdp_get_current_addin_provider() == callbacks[7]);
  for (std::size_t i = 8; i > 0; --i)
    REQUIRE(f.scopes[i - 1].close() == CHANNEL_RC_OK);
  REQUIRE(freerdp_get_current_addin_provider() == f.original);
}
TEST_CASE("Addin scopes require one context and serialized owner thread") {
  Fixture f;
  REQUIRE(f.scopes[0].bind(f.context, callbacks[0]) == CHANNEL_RC_OK);
  REQUIRE(f.scopes[1].bind(f.other, callbacks[1]) == ERROR_INVALID_PARAMETER);
  UINT bind_result = CHANNEL_RC_OK, close_result = CHANNEL_RC_OK;
  bool active = true, top = true;
  FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN previous = callbacks[0];
  std::thread foreign([&] {
    active = f.scopes[0].active();
    top = f.scopes[0].top();
    previous = f.scopes[0].previous();
    close_result = f.scopes[0].close();
    bind_result = f.scopes[1].bind(f.context, callbacks[1]);
  });
  foreign.join();
  REQUIRE_FALSE(active);
  REQUIRE_FALSE(top);
  REQUIRE(previous == nullptr);
  REQUIRE(close_result == ERROR_INVALID_STATE);
  REQUIRE(bind_result == ERROR_INVALID_STATE);
  REQUIRE(f.scopes[0].active());
  REQUIRE(f.scopes[1].bind(f.context, callbacks[1]) == CHANNEL_RC_OK);
}
TEST_CASE("Foreign provider replacement disables delegation and survives owner teardown") {
  Fixture f;
  REQUIRE(f.scopes[0].bind(f.context, callbacks[0]) == CHANNEL_RC_OK);
  REQUIRE(f.scopes[1].bind(f.context, callbacks[1]) == CHANNEL_RC_OK);
  REQUIRE(freerdp_register_addin_provider(callbacks[8], 0) == 0);
  REQUIRE_FALSE(f.scopes[0].active());
  REQUIRE_FALSE(f.scopes[1].active());
  REQUIRE(f.scopes[2].bind(f.context, callbacks[2]) == ERROR_INVALID_STATE);
  REQUIRE(f.scopes[0].close() == ERROR_INVALID_STATE);
  REQUIRE(f.scopes[0].bound());
  REQUIRE(f.scopes[1].close() == ERROR_INVALID_STATE);
  REQUIRE_FALSE(f.scopes[1].bound());
  REQUIRE(freerdp_get_current_addin_provider() == callbacks[8]);
  REQUIRE(f.scopes[0].close() == ERROR_INVALID_STATE);
  REQUIRE_FALSE(f.scopes[0].bound());
  REQUIRE(freerdp_get_current_addin_provider() == callbacks[8]);
}
