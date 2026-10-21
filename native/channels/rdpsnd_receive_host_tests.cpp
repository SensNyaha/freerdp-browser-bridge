#include "../compat/bit.hpp"
#include "../compat/span.hpp"
#include "dvc_receive_guard.hpp"
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <cstring>
#include <freerdp/client.h>
#include <freerdp/client/channels.h>
#include <freerdp/svc.h>
#include <memory>
#include <stdexcept>
#include <winpr/error.h>
#include <winpr/wtsapi.h>
using namespace bridge::channels;
namespace {
struct Host {
  struct Context {
    rdpClientContext base;
    Host *owner;
  };
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{
      nullptr, freerdp_client_context_free};
  CHANNEL_ENTRY_POINTS_FREERDP_EX points{};
  LPVOID plugin = nullptr;
  PCHANNEL_INIT_EVENT_EX_FN init = nullptr;
  PCHANNEL_OPEN_EVENT_EX_FN opened = nullptr;
  char name[7] = "rdpsnd", selection[9] = "sys:fake";
  char *values[2]{name, selection};
  ADDIN_ARGV args{2, values};
  unsigned deliveries = 0, writes = 0, closes = 0;
  std::unique_ptr<DvcReceiveGuard> guard;
  static Host &get(freerdp *instance) {
    return *reinterpret_cast<Context *>(instance->context)->owner;
  }
  static BOOL delegate(freerdp *instance, UINT16 channel, const BYTE *bytes, std::size_t size,
                       UINT32 flags, std::size_t total) {
    auto &host = get(instance);
    if (channel != 1006 || size > UINT32_MAX || total > UINT32_MAX)
      return FALSE;
    ++host.deliveries;
    host.opened(host.plugin, 1, CHANNEL_EVENT_DATA_RECEIVED, const_cast<BYTE *>(bytes),
                static_cast<UINT32>(size), static_cast<UINT32>(total), flags);
    return getChannelError(instance->context) == CHANNEL_RC_OK;
  }
  Host() {
    RDP_CLIENT_ENTRY_POINTS entry{};
    entry.Size = sizeof(entry);
    entry.Version = RDP_CLIENT_INTERFACE_VERSION;
    entry.ContextSize = sizeof(Context);
    context.reset(freerdp_client_context_new(&entry));
    REQUIRE(context);
    reinterpret_cast<Context *>(context.get())->owner = this;
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_SynchronousStaticChannels, TRUE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_AsyncChannels, FALSE));
    points.cbSize = sizeof(points);
    points.protocolVersion = VIRTUAL_CHANNEL_VERSION_WIN2000;
    points.MagicNumber = FREERDP_CHANNEL_MAGIC_NUMBER;
    points.context = context.get();
    points.pExtendedData = &args;
    points.pVirtualChannelInitEx = [](LPVOID param, LPVOID, LPVOID handle, PCHANNEL_DEF channels,
                                      INT count, ULONG,
                                      PCHANNEL_INIT_EVENT_EX_FN callback) -> UINT {
      auto &host = *static_cast<Host *>(handle);
      if (count != 1 || !channels || std::strcmp(channels->name, "rdpsnd") || !callback)
        return ERROR_INVALID_PARAMETER;
      host.plugin = param;
      host.init = callback;
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelOpenEx = [](LPVOID handle, LPDWORD result, PCHAR,
                                      PCHANNEL_OPEN_EVENT_EX_FN callback) -> UINT {
      auto &host = *static_cast<Host *>(handle);
      host.opened = callback;
      *result = 1;
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelCloseEx = [](LPVOID handle, DWORD) -> UINT {
      ++static_cast<Host *>(handle)->closes;
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelWriteEx = [](LPVOID handle, DWORD, LPVOID, ULONG,
                                       LPVOID completion) -> UINT {
      auto &host = *static_cast<Host *>(handle);
      ++host.writes;
      host.opened(host.plugin, 1, CHANNEL_EVENT_WRITE_COMPLETE, completion, 0, 0, 0);
      return CHANNEL_RC_OK;
    };
    const auto callback = freerdp_channels_load_static_addin_entry(
        "rdpsnd", nullptr, nullptr, FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX);
    REQUIRE(callback);
    REQUIRE(::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(callback)(
        reinterpret_cast<PCHANNEL_ENTRY_POINTS_EX>(&points), this));
    REQUIRE(plugin);
    if (!init)
      throw std::runtime_error("Missing fixture init callback");
    init(plugin, this, CHANNEL_EVENT_INITIALIZED, nullptr, 0);
    init(plugin, this, CHANNEL_EVENT_CONNECTED, nullptr, 0);
    init(plugin, this, CHANNEL_EVENT_ATTACHED, nullptr, 0);
    REQUIRE(opened);
    REQUIRE(getChannelError(context.get()) == CHANNEL_RC_OK);
    guard = std::make_unique<DvcReceiveGuard>(
        *context->instance, delegate, DvcAllocationLimits{},
        [](freerdp *) -> UINT16 { return 1004; }, [](freerdp *) -> UINT16 { return 1006; });
  }
  ~Host() {
    if (guard)
      guard->close();
    if (plugin) {
      init(plugin, this, CHANNEL_EVENT_DISCONNECTED, nullptr, 0);
      init(plugin, this, CHANNEL_EVENT_TERMINATED, nullptr, 0);
    }
  }
  bool receive(::bridge::compat::span<const BYTE> bytes, UINT32 flags = CHANNEL_FLAG_ONLY, std::size_t total = 8,
               std::uint64_t now = 1) {
    return guard->receive(1006, bytes.data(), bytes.size(), flags, total, now);
  }
};
constexpr BYTE volume[]{3, 0, 4, 0, 1, 2, 3, 4};
} // namespace
TEST_CASE("Actual static RDPSND fake backend receives only complete admitted records") {
  Host host;
  REQUIRE(host.receive(::bridge::compat::span(volume).first(3), CHANNEL_FLAG_FIRST));
  REQUIRE(host.deliveries == 0);
  REQUIRE(host.receive(::bridge::compat::span(volume).subspan(3), CHANNEL_FLAG_LAST, 8, 2));
  REQUIRE(host.deliveries == 1);
  REQUIRE(host.guard->stats().audio.forwarded == 1);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
  REQUIRE_FALSE(host.receive(::bridge::compat::span(volume).first(1), CHANNEL_FLAG_FIRST, 65537, 3));
  REQUIRE(host.deliveries == 1);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
}
TEST_CASE("Actual static RDPSND fake backend cannot parse refused format-table claims") {
  Host host;
  const BYTE bad[]{7, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0};
  REQUIRE_FALSE(host.receive(bad, CHANNEL_FLAG_ONLY, sizeof(bad)));
  REQUIRE(host.deliveries == 0);
  REQUIRE(host.writes == 0);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
}
TEST_CASE("Actual static RDPSND fake backend negotiates PCM and consumes a legacy Wave pair") {
  Host host;
  constexpr BYTE formats[]{7,   0,   38, 0, 3, 0,   0, 0, 255, 255, 255, 255, 0, 0,
                           0,   0,   0,  0, 1, 0,   0, 6, 0,   0,   1,   0,   2, 0,
                           128, 187, 0,  0, 0, 238, 2, 0, 4,   0,   16,  0,   0, 0};
  REQUIRE(host.receive(formats, CHANNEL_FLAG_ONLY, sizeof(formats)));
  REQUIRE(host.writes >= 1);
  const auto writes = host.writes;
  constexpr BYTE info[]{2, 0, 16, 0, 1, 0, 0, 0, 1, 0, 0, 0, 10, 11, 12, 13};
  constexpr BYTE wave[]{0, 0, 0, 0, 14, 15, 16, 17};
  REQUIRE(host.receive(info, CHANNEL_FLAG_ONLY, sizeof(info), 2));
  REQUIRE(host.guard->stats().audio.awaiting_wave);
  REQUIRE(host.receive(wave, CHANNEL_FLAG_ONLY, sizeof(wave), 3));
  REQUIRE_FALSE(host.guard->stats().audio.awaiting_wave);
  REQUIRE(host.writes > writes);
  REQUIRE(host.deliveries == 3);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
}
