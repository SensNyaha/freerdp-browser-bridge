#include "addin_scope.hpp"
#include "dvc_channel_handoff.hpp"
#include "dvc_channel_registry.hpp"
#include "dvc_completion_hook.hpp"
#include "dvc_listener_manager.hpp"
#include "dvc_listener_proxy.hpp"
#include "dvc_plugin_proxy.hpp"
#include "dvc_plugin_registry.hpp"
#include "dvc_provider.hpp"
#include "dvc_receive_guard.hpp"
#include "pinned_dvc_manager.hpp"
#include <algorithm>
#include <array>
#include <bit>
#include <catch2/catch_test_macros.hpp>
#include <cstring>
#include <freerdp/channels/rdpgfx.h>
#include <freerdp/client.h>
#include <freerdp/client/channels.h>
#include <freerdp/client/cmdline.h>
#include <freerdp/svc.h>
#include <memory>
#include <stdexcept>
#include <vector>
#include <winpr/error.h>
#include <winpr/stream.h>
#include <winpr/wtsapi.h>
using namespace bridge::channels;
namespace {
constexpr const char *plugin_name = "bridge-bounds-fixture";
constexpr const char *channel_name = "bridge-bounds";
struct Host {
  struct Context {
    rdpClientContext base;
    Host *owner;
  };
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{
      nullptr, freerdp_client_context_free};
  AddinScope provider;
  std::unique_ptr<DvcReceiveGuard> guard;
  DvcMessageBudget budget{{2, 8, 8, 100}};
  std::array<std::unique_ptr<DvcCompletionHook>, 2> completion_hooks;
  std::unique_ptr<DvcChannelRegistry> registry;
  std::unique_ptr<PinnedDvcManager> manager_facade;
  IWTSVirtualChannelManager *actual_manager = nullptr;
  bool wrap_manager = false;
  bool use_handoff = false;
  bool wrap_listener = false;
  std::unique_ptr<DvcListenerProxy> listener_proxy;
  std::unique_ptr<DvcListenerManager> listener_manager;
  bool wrap_listeners = false;
  bool wrap_plugin = false;
  std::unique_ptr<DvcPluginProxy> plugin_proxy;
  std::unique_ptr<DvcPluginRegistry> plugin_registry;
  bool wrap_registration = false;
  bool scoped_registration = false;
  std::unique_ptr<DvcProvider> dvc_provider;
  bool actual_gfx = false;
  UINT plugin_registry_retirement_status = CHANNEL_RC_OK;
  DvcAcceptedChannelResult handoff_result{CHANNEL_RC_OK, CHANNEL_RC_OK, nullptr};
  UINT registry_retirement_status = CHANNEL_RC_OK;
  bool observe_completion = false;
  std::uint64_t now_ms = 1;
  CHANNEL_ENTRY_POINTS_FREERDP_EX points{};
  LPVOID plugin = nullptr;
  PCHANNEL_INIT_EVENT_EX_FN init = nullptr;
  PCHANNEL_OPEN_EVENT_EX_FN opened = nullptr;
  bool connected = false;
  unsigned deliveries = 0, writes = 0, closes = 0, terminated = 0;
  IWTSPlugin dynamic{};
  IWTSListenerCallback listener_callback{};
  IWTSVirtualChannelManager *manager = nullptr;
  IWTSListener *listener = nullptr;
  struct Channel {
    IWTSVirtualChannelCallback api{};
    Host *owner = nullptr;
    std::size_t charged_during_callback = 0;
    unsigned opens = 0, closes = 0, packets = 0;
    std::size_t size = 0;
    BYTE first = 0, last = 0;
    bool uniform = false;
    std::vector<BYTE> small_copy;
  };
  std::array<Channel, 2> channels;
  static inline thread_local Host *active = nullptr;
  static Host &owner(freerdp *instance) {
    return *reinterpret_cast<Context *>(instance->context)->owner;
  }
  static BOOL delegate(freerdp *instance, UINT16 id, const BYTE *data, std::size_t size,
                       UINT32 flags, std::size_t total) {
    auto &host = owner(instance);
    if (id != 1004 || !host.opened || size > UINT32_MAX || total > UINT32_MAX)
      return FALSE;
    if (host.registry) {
      if (!host.registry->admit({data, size}, host.now_ms))
        return FALSE;
    } else if (host.observe_completion) {
      const auto info = inspect_dvc_allocations({data, size});
      if (!info)
        return FALSE;
      if (info->declared_message && info->channel_id && *info->channel_id >= 0x42 &&
          *info->channel_id <= 0x43 && host.channels[*info->channel_id - 0x42].opens &&
          !host.budget.reserve(*info->channel_id, *info->declared_message, host.now_ms))
        return FALSE;
    }
    ++host.deliveries;
    host.opened(host.plugin, 1, CHANNEL_EVENT_DATA_RECEIVED, const_cast<BYTE *>(data),
                static_cast<UINT32>(size), static_cast<UINT32>(total), flags);
    // Match the real core's void-event dispatch result: errors are reported separately.
    return TRUE;
  }
  static PVIRTUALCHANNELENTRY load(LPCSTR name, LPCSTR subsystem, LPCSTR type, DWORD flags) {
    if (active && name && std::strcmp(name, plugin_name) == 0 &&
        flags == FREERDP_ADDIN_CHANNEL_DYNAMIC)
      return std::bit_cast<PVIRTUALCHANNELENTRY>(&Host::entry);
    return active && active->provider.previous()
               ? active->provider.previous()(name, subsystem, type, flags)
               : nullptr;
  }
  static UINT VCAPITYPE entry(IDRDYNVC_ENTRY_POINTS *entries) {
    if (active && active->plugin_registry && !active->scoped_registration)
      return active->plugin_registry->install(*entries, raw_entry);
    return raw_entry(entries);
  }
  static UINT VCAPITYPE raw_entry(IDRDYNVC_ENTRY_POINTS *entries) {
    if (!active || entries->GetRdpContext(entries) != active->context.get())
      return ERROR_INVALID_PARAMETER;
    return entries->RegisterPlugin(entries, plugin_name,
                                   active->plugin_proxy ? active->plugin_proxy->interface()
                                                        : &active->dynamic);
  }
  explicit Host(bool completion_observation = false, bool registry_observation = false,
                bool pinned_manager_observation = false, bool handoff_observation = false,
                bool listener_proxy_observation = false, bool listener_manager_observation = false,
                bool plugin_proxy_observation = false, bool plugin_registry_observation = false,
                bool provider_observation = false, bool gfx_observation = false)
      : observe_completion(completion_observation), wrap_manager(pinned_manager_observation),
        use_handoff(handoff_observation), wrap_listener(listener_proxy_observation),
        wrap_listeners(listener_manager_observation), wrap_plugin(plugin_proxy_observation),
        wrap_registration(plugin_registry_observation), scoped_registration(provider_observation),
        actual_gfx(gfx_observation) {
    if (registry_observation)
      registry = std::make_unique<DvcChannelRegistry>(
          [](void *p) -> std::uint64_t { return static_cast<Host *>(p)->now_ms; }, this,
          DvcMessageBudgetLimits{handoff_observation || listener_proxy_observation ? 1U : 2U,
                                 actual_gfx ? 1024U * 1024U : 8U, actual_gfx ? 1024U * 1024U : 8U,
                                 100});
    RDP_CLIENT_ENTRY_POINTS entry_points{};
    entry_points.Size = sizeof(entry_points);
    entry_points.Version = RDP_CLIENT_INTERFACE_VERSION;
    entry_points.ContextSize = sizeof(Context);
    context.reset(freerdp_client_context_new(&entry_points));
    REQUIRE(context);
    reinterpret_cast<Context *>(context.get())->owner = this;
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_SynchronousDynamicChannels, TRUE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_AsyncChannels, FALSE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_AsyncUpdate, FALSE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_BitmapCachePersistEnabled, FALSE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_GfxSmallCache, TRUE));
    const char *arguments[]{actual_gfx ? RDPGFX_CHANNEL_NAME : plugin_name};
    REQUIRE(freerdp_client_add_dynamic_channel(context->settings, 1, arguments));
    dynamic.pInterface = listener_callback.pInterface = this;
    dynamic.Initialize = [](IWTSPlugin *p, IWTSVirtualChannelManager *m) -> UINT {
      auto &host = *static_cast<Host *>(p->pInterface);
      host.actual_manager = m;
      host.manager = m;
      if (host.wrap_listeners) {
        try {
          host.listener_manager = std::make_unique<DvcListenerManager>(
              *m, *host.registry,
              [](void *p) -> std::uint64_t { return static_cast<Host *>(p)->now_ms; }, &host);
          host.manager = host.listener_manager->interface();
        } catch (...) {
          return ERROR_NOT_ENOUGH_MEMORY;
        }
      }
      if (host.wrap_manager) {
        try {
          host.manager_facade = std::make_unique<PinnedDvcManager>(*m);
          host.manager = host.manager_facade->interface();
        } catch (...) {
          return ERROR_NOT_ENOUGH_MEMORY;
        }
      }
      auto *receiver = &host.listener_callback;
      if (host.wrap_listener) {
        if (!host.registry)
          return ERROR_INVALID_STATE;
        try {
          host.listener_proxy = std::make_unique<DvcListenerProxy>(
              *host.registry, *host.manager, host.listener_callback,
              [](void *p) -> std::uint64_t { return static_cast<Host *>(p)->now_ms; }, &host);
          receiver = host.listener_proxy->interface();
        } catch (...) {
          return ERROR_NOT_ENOUGH_MEMORY;
        }
      }
      return host.manager->CreateListener(host.manager, channel_name, 0, receiver, &host.listener);
    };
    dynamic.Terminated = [](IWTSPlugin *p) -> UINT {
      auto &host = *static_cast<Host *>(p->pInterface);
      ++host.terminated;
      const auto result = host.listener ? host.manager->DestroyListener(host.manager, host.listener)
                                        : CHANNEL_RC_OK;
      host.listener = nullptr;
      return result;
    };
    listener_callback.OnNewChannelConnection = [](IWTSListenerCallback *p,
                                                  IWTSVirtualChannel *channel, BYTE *, BOOL *accept,
                                                  IWTSVirtualChannelCallback **callback) -> UINT {
      auto &host = *static_cast<Host *>(p->pInterface);
      const auto id = host.manager->GetChannelId(channel);
      if (id < 0x42 || id > 0x43)
        return ERROR_INVALID_PARAMETER;
      *accept = TRUE;
      *callback = &host.channels[id - 0x42].api;
      if (host.registry && !host.listener_proxy && !host.listener_manager &&
          !host.plugin_registry) {
        DvcChannelBinding binding{CHANNEL_RC_OK, nullptr};
        if (host.use_handoff) {
          host.handoff_result = handoff_accepted_channel(*host.registry, *host.manager, *channel,
                                                         **callback, host.now_ms);
          binding = {host.handoff_result.status, host.handoff_result.callback};
        } else {
          binding = host.registry->bind(*host.manager, *channel, **callback, host.now_ms);
        }
        if (binding.status != CHANNEL_RC_OK) {
          *accept = FALSE;
          *callback = nullptr;
          return binding.status;
        }
        *callback = binding.callback;
      } else if (host.observe_completion) {
        try {
          auto &hook = host.completion_hooks[id - 0x42];
          hook = std::make_unique<DvcCompletionHook>(
              host.budget, id, **callback,
              [](void *p) -> std::uint64_t { return static_cast<Host *>(p)->now_ms; }, &host);
          *callback = hook->interface();
        } catch (...) {
          *accept = FALSE;
          return ERROR_NOT_ENOUGH_MEMORY;
        }
      }
      return CHANNEL_RC_OK;
    };
    for (auto &channel : channels) {
      channel.owner = this;
      channel.api.pInterface = &channel;
      channel.api.OnOpen = [](IWTSVirtualChannelCallback *p) -> UINT {
        ++static_cast<Channel *>(p->pInterface)->opens;
        return CHANNEL_RC_OK;
      };
      channel.api.OnClose = [](IWTSVirtualChannelCallback *p) -> UINT {
        ++static_cast<Channel *>(p->pInterface)->closes;
        return CHANNEL_RC_OK;
      };
      channel.api.OnDataReceived = [](IWTSVirtualChannelCallback *p, wStream *stream) -> UINT {
        auto &channel_state = *static_cast<Channel *>(p->pInterface);
        auto &host = *channel_state.owner;
        channel_state.charged_during_callback = host.registry
                                                    ? host.registry->stats().budget.reserved_bytes
                                                    : host.budget.stats().reserved_bytes;
        const auto size = Stream_GetRemainingLength(stream);
        const auto *data = static_cast<const BYTE *>(Stream_Pointer(stream));
        ++channel_state.packets;
        channel_state.size = size;
        if (size) {
          channel_state.first = data[0];
          channel_state.last = data[size - 1];
          channel_state.uniform =
              std::all_of(data, data + size, [data](auto byte) { return byte == data[0]; });
          if (size <= 64)
            channel_state.small_copy.assign(data, data + size);
        }
        return CHANNEL_RC_OK;
      };
    }
    if (wrap_plugin)
      plugin_proxy = std::make_unique<DvcPluginProxy>(
          dynamic,
          [](void *p, IWTSVirtualChannelManager &manager) -> IWTSVirtualChannelManager * {
            auto &host = *static_cast<Host *>(p);
            if (!host.registry || host.listener_manager)
              return nullptr;
            host.listener_manager = std::make_unique<DvcListenerManager>(
                manager, *host.registry,
                [](void *p) -> std::uint64_t { return static_cast<Host *>(p)->now_ms; }, &host);
            return host.listener_manager->interface();
          },
          this);
    if (wrap_registration || scoped_registration)
      plugin_registry = std::make_unique<DvcPluginRegistry>(
          *registry, [](void *p) -> std::uint64_t { return static_cast<Host *>(p)->now_ms; }, this);
    points.cbSize = sizeof(points);
    points.protocolVersion = VIRTUAL_CHANNEL_VERSION_WIN2000;
    points.MagicNumber = FREERDP_CHANNEL_MAGIC_NUMBER;
    points.context = context.get();
    points.pVirtualChannelInitEx = [](LPVOID user, LPVOID, LPVOID handle, PCHANNEL_DEF definitions,
                                      INT count, ULONG,
                                      PCHANNEL_INIT_EVENT_EX_FN callback) -> UINT {
      auto &host = *static_cast<Host *>(handle);
      if (count != 1 || std::strcmp(definitions->name, "drdynvc") != 0)
        return ERROR_INVALID_PARAMETER;
      host.plugin = user;
      host.init = callback;
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelOpenEx = [](LPVOID handle, LPDWORD result, PCHAR name,
                                      PCHANNEL_OPEN_EVENT_EX_FN callback) -> UINT {
      if (std::strcmp(name, "drdynvc") != 0)
        return ERROR_INVALID_PARAMETER;
      static_cast<Host *>(handle)->opened = callback;
      *result = 1;
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelCloseEx = [](LPVOID handle, DWORD id) -> UINT {
      if (id != 1)
        return ERROR_INVALID_PARAMETER;
      ++static_cast<Host *>(handle)->closes;
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelWriteEx = [](LPVOID handle, DWORD id, LPVOID data, ULONG size,
                                       LPVOID completion) -> UINT {
      auto &host = *static_cast<Host *>(handle);
      if (id != 1 || !data || !size || !host.opened)
        return ERROR_INVALID_PARAMETER;
      ++host.writes;
      host.opened(host.plugin, 1, CHANNEL_EVENT_WRITE_COMPLETE, completion, 0, 0, 0);
      return CHANNEL_RC_OK;
    };
    REQUIRE(active == nullptr);
    REQUIRE(provider.bind(*context, load) == CHANNEL_RC_OK);
    active = this;
    try {
      if (scoped_registration) {
        dvc_provider = std::make_unique<DvcProvider>(*plugin_registry);
        REQUIRE(dvc_provider->bind(*context) == CHANNEL_RC_OK);
      }
      const auto static_entry = freerdp_channels_load_static_addin_entry(
          "drdynvc", nullptr, nullptr,
          FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX);
      REQUIRE(static_entry);
      REQUIRE(std::bit_cast<PVIRTUALCHANNELENTRYEX>(static_entry)(
          reinterpret_cast<PCHANNEL_ENTRY_POINTS_EX>(&points), this));
      if (!plugin || !init)
        throw std::runtime_error("Missing fixture channel callbacks");
      init(plugin, this, CHANNEL_EVENT_INITIALIZED, nullptr, 0);
      REQUIRE(getChannelError(context.get()) == CHANNEL_RC_OK);
      init(plugin, this, CHANNEL_EVENT_CONNECTED, nullptr, 0);
      connected = true;
      REQUIRE(getChannelError(context.get()) == CHANNEL_RC_OK);
      REQUIRE(opened);
      guard = std::make_unique<DvcReceiveGuard>(*context->instance, delegate, DvcAllocationLimits{},
                                                [](freerdp *) -> UINT16 { return 1004; });
      const BYTE capabilities[]{0x50, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0};
      REQUIRE(send(capabilities));
      create(0x42);
    } catch (...) {
      shutdown();
      (void)provider.close();
      active = nullptr;
      throw;
    }
  }
  ~Host() {
    shutdown();
    (void)provider.close();
    active = nullptr;
  }
  void shutdown() noexcept {
    if (guard)
      guard->close();
    if (dvc_provider)
      (void)dvc_provider->close(); // Retire borrowed channel targets before plugin state is freed.
    if (plugin && init) {
      if (connected)
        init(plugin, this, CHANNEL_EVENT_DISCONNECTED, nullptr, 0);
      init(plugin, this, CHANNEL_EVENT_TERMINATED, nullptr, 0);
      plugin = nullptr;
      connected = false;
    }
    if (registry)
      registry_retirement_status = registry->retire();
    if (listener_proxy)
      listener_proxy->close();
    if (listener_manager)
      (void)listener_manager->retire();
    if (manager_facade)
      manager_facade->retire();
    if (plugin_registry) {
      plugin_registry_retirement_status = plugin_registry->retire();
      (void)plugin_registry->host_unpublished();
    }
    budget.close();
  }
  bool send(std::span<const BYTE> bytes, UINT32 flags = CHANNEL_FLAG_ONLY, std::size_t total = 0,
            std::uint64_t now = 1) {
    if (!guard)
      return false;
    now_ms = now;
    return guard->receive(1004, bytes.data(), bytes.size(), flags, total ? total : bytes.size(),
                          now);
  }
  void create(BYTE id) {
    std::vector<BYTE> bytes{0x10, id};
    const auto *endpoint = actual_gfx ? RDPGFX_DVC_CHANNEL_NAME : channel_name;
    bytes.insert(bytes.end(), endpoint, endpoint + std::strlen(endpoint) + 1);
    REQUIRE(send(bytes));
    REQUIRE(getChannelError(context.get()) == CHANNEL_RC_OK);
    if (actual_gfx)
      REQUIRE(registry->contains(id));
    else
      REQUIRE(channels[id - 0x42].opens == 1);
  }
};
std::vector<BYTE> first(BYTE command, BYTE id, UINT32 size, std::span<const BYTE> body) {
  std::vector<BYTE> bytes{static_cast<BYTE>((command << 4) | 8), id};
  for (unsigned index = 0; index < 4; ++index)
    bytes.push_back(static_cast<BYTE>(size >> (index * 8)));
  bytes.insert(bytes.end(), body.begin(), body.end());
  return bytes;
}
} // namespace

TEST_CASE(
    "Actual synchronous drdynvc host receives inspected outer fragments and logical DATA_FIRST") {
  Host host;
  const auto baseline = host.deliveries;
  const BYTE initial[]{1, 2};
  const auto begin = first(2, 0x42, 8, initial);
  REQUIRE(host.send(std::span(begin).first(3), CHANNEL_FLAG_FIRST, begin.size()));
  REQUIRE(host.deliveries == baseline);
  REQUIRE(host.send(std::span(begin).subspan(3), CHANNEL_FLAG_LAST, begin.size(), 2));
  REQUIRE(host.deliveries == baseline + 1);
  REQUIRE(host.channels[0].packets == 0);
  const BYTE end[]{0x30, 0x42, 3, 4, 5, 6, 7, 8};
  REQUIRE(host.send(end, CHANNEL_FLAG_ONLY, 0, 3));
  REQUIRE(host.channels[0].small_copy == std::vector<BYTE>{1, 2, 3, 4, 5, 6, 7, 8});
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
  host.shutdown();
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.terminated == 1);
  REQUIRE(host.closes == 1);
}
TEST_CASE("Actual drdynvc host decompresses inspected first and continuation compressed literals") {
  Host host;
  const BYTE literal[]{0xe0, 0x24, 0, 0, 7};
  REQUIRE(host.send(first(6, 0x42, 2, literal)));
  const BYTE next[]{0x70, 0x42, 0xe0, 0x24, 0, 0, 7};
  REQUIRE(host.send(next));
  REQUIRE(host.channels[0].small_copy == std::vector<BYTE>{0, 0});
  REQUIRE(host.channels[0].packets == 1);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
}
TEST_CASE(
    "Actual drdynvc host never sees refused huge logical and independent decompression claims") {
  for (bool compressed : {false, true}) {
    Host host;
    const auto baseline = host.deliveries;
    const BYTE payload[]{0xe1, 1, 0, 0xff, 0xff, 0xff, 0xff, 2, 0, 0, 0, 4, 0};
    REQUIRE_FALSE(host.send(first(compressed ? 6 : 2, 0x42, compressed ? 8 : UINT32_MAX, payload)));
    REQUIRE(host.deliveries == baseline);
    REQUIRE(host.channels[0].packets == 0);
    REQUIRE(host.guard->stats().failed);
    REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
  }
}
TEST_CASE("Actual drdynvc host preserves a legitimate inspected twelve MiB payload") {
  Host host;
  constexpr std::size_t size = 12U * 1024U * 1024U;
  std::vector<BYTE> bytes(size + 2, 0x5a);
  bytes[0] = 0x30;
  bytes[1] = 0x42;
  REQUIRE(host.send(bytes));
  REQUIRE(host.channels[0].packets == 1);
  REQUIRE(host.channels[0].size == size);
  REQUIRE(host.channels[0].uniform);
  REQUIRE(host.channels[0].first == 0x5a);
  REQUIRE(host.channels[0].last == 0x5a);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
}
TEST_CASE("Actual drdynvc host keeps two legitimate partial logical channels independent") {
  Host host;
  host.create(0x43);
  const BYTE a[]{1, 2}, b[]{3, 4};
  REQUIRE(host.send(first(2, 0x42, 4, a)));
  REQUIRE(host.send(first(2, 0x43, 4, b)));
  const BYTE end_b[]{0x30, 0x43, 5, 6}, end_a[]{0x30, 0x42, 7, 8};
  REQUIRE(host.send(end_b));
  REQUIRE(host.send(end_a));
  REQUIRE(host.channels[0].small_copy == std::vector<BYTE>{1, 2, 7, 8});
  REQUIRE(host.channels[1].small_copy == std::vector<BYTE>{3, 4, 5, 6});
  REQUIRE(host.channels[0].packets == 1);
  REQUIRE(host.channels[1].packets == 1);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
}
TEST_CASE("Actual drdynvc host shutdown retires logical partials after outer abandonment") {
  Host host;
  const BYTE initial[]{1, 2};
  REQUIRE(host.send(first(2, 0x42, 8, initial)));
  const auto baseline = host.deliveries;
  const BYTE next[]{0x30, 0x42, 3, 4, 5, 6, 7, 8};
  REQUIRE(host.send(std::span(next).first(1), CHANNEL_FLAG_FIRST, sizeof(next)));
  REQUIRE_FALSE(host.guard->poll(2001));
  REQUIRE(host.deliveries == baseline);
  REQUIRE(host.guard->stats().assembly.allocated_bytes == 0);
  REQUIRE(host.channels[0].packets == 0);
  host.shutdown();
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.terminated == 1);
  REQUIRE(host.closes == 1);
}

TEST_CASE("Actual drdynvc completion proxy holds fragmented claim until real complete callback") {
  Host host(true);
  const BYTE initial[]{1, 2};
  REQUIRE(host.send(first(2, 0x42, 4, initial)));
  REQUIRE(host.budget.stats().reserved_bytes == 4);
  REQUIRE(host.budget.stats().releases == 0);
  const BYTE end[]{0x30, 0x42, 3, 4};
  REQUIRE(host.send(end));
  REQUIRE(host.channels[0].charged_during_callback == 4);
  REQUIRE(host.channels[0].small_copy == std::vector<BYTE>{1, 2, 3, 4});
  REQUIRE(host.budget.stats().reserved_bytes == 0);
  REQUIRE(host.budget.stats().releases == 1);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
  host.shutdown();
  REQUIRE(host.completion_hooks[0]->closed());
  REQUIRE_FALSE(host.completion_hooks[0]->failed());
  REQUIRE(host.channels[0].closes == 1);
}
TEST_CASE("Actual drdynvc cumulative fixture refuses second claim before entering the host") {
  Host host(true);
  host.create(0x43);
  const BYTE initial[]{1, 2};
  REQUIRE(host.send(first(2, 0x42, 6, initial)));
  const auto deliveries = host.deliveries;
  REQUIRE_FALSE(host.send(first(2, 0x43, 3, initial)));
  REQUIRE(host.deliveries == deliveries);
  REQUIRE(host.channels[0].packets == 0);
  REQUIRE(host.channels[1].packets == 0);
  REQUIRE(host.budget.stats().failed);
  host.shutdown();
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.channels[1].closes == 1);
  REQUIRE(host.terminated == 1);
}

TEST_CASE("Actual drdynvc entry registry binds public plugins listeners and cumulative channel "
          "ownership") {
  Host host(false, true, false, false, false, false, false, true);
  REQUIRE(host.plugin_registry);
  REQUIRE(host.plugin_registry->stats().retained_plugins == 1);
  REQUIRE_FALSE(host.plugin_registry->stats().failed);
  REQUIRE(host.registry->owns_callback(host.channels[0].api));
  const BYTE initial[]{1, 2, 3, 4};
  REQUIRE(host.send(first(2, 0x42, 4, initial)));
  REQUIRE(host.registry->stats().budget.releases == 1);
  host.create(0x43);
  REQUIRE(host.registry->owns_callback(host.channels[1].api));
  host.shutdown();
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.channels[1].closes == 1);
  REQUIRE(host.terminated == 1);
  REQUIRE(host.plugin_registry_retirement_status == CHANNEL_RC_OK);
  REQUIRE(host.plugin_registry->stats().host_unpublished);
}

TEST_CASE("Actual scoped DVC provider wraps public host loading and retires callbacks before "
          "plugin cleanup") {
  Host host(false, true, false, false, false, false, false, false, true);
  REQUIRE(host.dvc_provider);
  REQUIRE(host.dvc_provider->bound());
  REQUIRE(host.plugin_registry->stats().retained_plugins == 1);
  REQUIRE(host.registry->owns_callback(host.channels[0].api));
  const BYTE initial[]{1, 2, 3, 4};
  REQUIRE(host.send(first(2, 0x42, 4, initial)));
  REQUIRE(host.registry->stats().budget.releases == 1);
  REQUIRE(host.dvc_provider->close() == CHANNEL_RC_OK);
  REQUIRE_FALSE(host.dvc_provider->bound());
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.terminated == 0);
  REQUIRE(host.registry->stats().resources_retired);
  host.shutdown();
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.terminated == 1);
  REQUIRE(host.plugin_registry->stats().host_unpublished);
}
TEST_CASE("Actual drdynvc completion proxy releases after compressed continuation and raw final "
          "outer fragment") {
  Host host(true);
  const BYTE literal[]{0xe0, 0x24, 0, 0, 7};
  REQUIRE(host.send(first(6, 0x42, 2, literal)));
  REQUIRE(host.budget.stats().reserved_bytes == 2);
  const BYTE next[]{0x70, 0x42, 0xe0, 0x24, 0, 0, 7};
  REQUIRE(host.send(next));
  REQUIRE(host.channels[0].charged_during_callback == 2);
  REQUIRE(host.budget.stats().releases == 1);
  const BYTE initial[]{1, 2, 3, 4};
  const auto whole = first(2, 0x42, 4, initial);
  REQUIRE(host.send(std::span(whole).first(3), CHANNEL_FLAG_FIRST, whole.size()));
  REQUIRE(host.budget.stats().active == 0); // Outer staging has not forwarded a logical claim.
  REQUIRE(host.send(std::span(whole).subspan(3), CHANNEL_FLAG_LAST, whole.size()));
  REQUIRE(host.channels[0].charged_during_callback == 4);
  REQUIRE(host.budget.stats().active == 0);
  REQUIRE(host.budget.stats().releases == 2);
}
TEST_CASE("Actual drdynvc unknown ignored channel is not charged by completion fixture") {
  Host host(true);
  const BYTE initial[]{1};
  REQUIRE(host.send(first(2, 0x99, 8, initial)));
  REQUIRE(host.budget.stats().active == 0);
  REQUIRE(host.budget.stats().reservations == 0);
  host.now_ms = 101;
  REQUIRE(host.budget.poll(101));
  REQUIRE_FALSE(host.budget.stats().failed);
  REQUIRE(host.channels[0].packets == 0);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
}
TEST_CASE("Actual drdynvc close proxy releases incomplete logical claim during host shutdown") {
  Host host(true);
  const BYTE initial[]{1, 2};
  REQUIRE(host.send(first(2, 0x42, 4, initial)));
  REQUIRE(host.budget.stats().reserved_bytes == 4);
  host.shutdown();
  REQUIRE(host.budget.stats().releases == 1);
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.completion_hooks[0]->closed());
  REQUIRE_FALSE(host.completion_hooks[0]->failed());
  REQUIRE(host.terminated == 1);
}

TEST_CASE("Actual drdynvc public ID registry owns claim until observed complete host delivery") {
  Host host(false, true);
  REQUIRE(host.registry->contains(0x42));
  const BYTE initial[]{1, 2};
  REQUIRE(host.send(first(2, 0x42, 4, initial)));
  REQUIRE(host.registry->stats().budget.reserved_bytes == 4);
  const BYTE end[]{0x30, 0x42, 3, 4};
  REQUIRE(host.send(end));
  REQUIRE(host.channels[0].charged_during_callback == 4);
  REQUIRE(host.registry->stats().budget.releases == 1);
  REQUIRE(host.registry->stats().budget.reserved_bytes == 0);
  host.shutdown();
  REQUIRE(host.registry_retirement_status == CHANNEL_RC_OK);
  REQUIRE(host.registry->stats().resources_retired);
  REQUIRE(host.channels[0].closes == 1);
}
TEST_CASE("Actual drdynvc public ID registry rejects aggregate claim before second host dispatch") {
  Host host(false, true);
  host.create(0x43);
  const BYTE initial[]{1, 2};
  REQUIRE(host.send(first(2, 0x42, 6, initial)));
  const auto delivered = host.deliveries;
  REQUIRE_FALSE(host.send(first(2, 0x43, 3, initial)));
  REQUIRE(host.deliveries == delivered);
  REQUIRE(host.registry->stats().failed);
  host.shutdown();
  REQUIRE(host.registry_retirement_status == ERROR_INVALID_DATA);
  REQUIRE(host.registry->stats().resources_retired);
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.channels[1].closes == 1);
}
TEST_CASE("Actual drdynvc public ID registry leaves ignored unknown claims uncharged") {
  Host host(false, true);
  const BYTE initial[]{1};
  REQUIRE(host.send(first(2, 0x99, 8, initial)));
  REQUIRE(host.registry->stats().budget.reservations == 0);
  REQUIRE(host.registry->stats().active_channels == 1);
  host.now_ms = 101;
  REQUIRE(host.registry->poll(101));
  REQUIRE_FALSE(host.registry->stats().failed);
  host.shutdown();
  REQUIRE(host.registry_retirement_status == CHANNEL_RC_OK);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
}
TEST_CASE(
    "Actual drdynvc public ID registry observes compressed message completion without prediction") {
  Host host(false, true);
  const BYTE literal[]{0xe0, 0x24, 0, 0, 7};
  REQUIRE(host.send(first(6, 0x42, 2, literal)));
  REQUIRE(host.registry->stats().budget.reserved_bytes == 2);
  const BYTE end[]{0x70, 0x42, 0xe0, 0x24, 0, 0, 7};
  REQUIRE(host.send(end));
  REQUIRE(host.channels[0].charged_during_callback == 2);
  REQUIRE(host.channels[0].small_copy == std::vector<BYTE>{0, 0});
  REQUIRE(host.registry->stats().budget.releases == 1);
  REQUIRE(host.registry->stats().budget.reserved_bytes == 0);
  REQUIRE_FALSE(host.registry->stats().failed);
}
TEST_CASE("Actual drdynvc public ID registry logical deadline requires actual host retirement") {
  Host host(false, true);
  const BYTE initial[]{1, 2};
  REQUIRE(host.send(first(2, 0x42, 4, initial)));
  host.now_ms = 101;
  REQUIRE_FALSE(host.registry->poll(101));
  REQUIRE(host.registry->stats().failed);
  REQUIRE_FALSE(host.registry->stats().resources_retired);
  REQUIRE(host.channels[0].closes == 0);
  host.shutdown();
  REQUIRE(host.registry_retirement_status == ERROR_INVALID_DATA);
  REQUIRE(host.registry->stats().resources_retired);
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.channels[0].packets == 0);
}

TEST_CASE(
    "Actual drdynvc pinned manager facade preserves successful public ID/find/listener cleanup") {
  Host host(false, true, true);
  REQUIRE(host.manager_facade);
  REQUIRE(host.actual_manager != host.manager);
  auto *channel = host.manager->FindChannelById(host.manager, 0x42);
  REQUIRE(channel);
  REQUIRE(channel == host.actual_manager->FindChannelById(host.actual_manager, 0x42));
  REQUIRE(host.manager->GetChannelId(channel) == 0x42);
  const BYTE initial[]{1, 2, 3, 4};
  REQUIRE(host.send(first(2, 0x42, 4, initial)));
  REQUIRE(host.registry->stats().budget.releases == 1);
  host.shutdown();
  REQUIRE(host.registry_retirement_status == CHANNEL_RC_OK);
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.terminated == 1);
  REQUIRE(host.manager->FindChannelById(host.manager, 0x42) == nullptr);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
}

TEST_CASE("Actual drdynvc accepted handoff projects one live callback without premature close") {
  Host host(false, true, true, true);
  REQUIRE(host.handoff_result.status == CHANNEL_RC_OK);
  REQUIRE_FALSE(host.handoff_result.close_invoked);
  REQUIRE(host.registry->owns_callback(host.channels[0].api));
  const BYTE initial[]{1, 2, 3, 4};
  REQUIRE(host.send(first(2, 0x42, 4, initial)));
  REQUIRE(host.registry->stats().budget.releases == 1);
  REQUIRE(host.channels[0].closes == 0);
  host.shutdown();
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.registry_retirement_status == CHANNEL_RC_OK);
}
TEST_CASE(
    "Actual drdynvc refused accepted handoff closes new target once and preserves old owner") {
  Host host(false, true, true, true);
  std::vector<BYTE> create{0x10, 0x43};
  create.insert(create.end(), channel_name, channel_name + std::strlen(channel_name) + 1);
  REQUIRE(host.send(create)); // Core-style dispatch is void; downstream error is separate.
  REQUIRE(host.handoff_result.status == ERROR_TOO_MANY_OPEN_FILES);
  REQUIRE(host.handoff_result.cleanup_status == CHANNEL_RC_OK);
  REQUIRE(host.handoff_result.close_invoked);
  REQUIRE(host.handoff_result.callback == nullptr);
  REQUIRE(host.channels[1].closes == 1);
  REQUIRE(host.channels[0].closes == 0);
  REQUIRE(getChannelError(host.context.get()) ==
          CHANNEL_RC_OK);                 // Negative CREATE response is not a global channel error.
  REQUIRE(host.registry->stats().failed); // Future owner must observe its own refusal too.
  host.shutdown();
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.channels[1].closes == 1);
  REQUIRE(host.registry->stats().resources_retired);
}

TEST_CASE(
    "Actual drdynvc listener proxy publishes accepted callback and observes host completion") {
  Host host(false, true, true, false, true);
  REQUIRE(host.listener_proxy);
  REQUIRE(host.listener_proxy->stats().accepted == 1);
  REQUIRE_FALSE(host.listener_proxy->stats().failed);
  const BYTE initial[]{1, 2, 3, 4};
  REQUIRE(host.send(first(2, 0x42, 4, initial)));
  REQUIRE(host.registry->stats().budget.releases == 1);
  host.shutdown();
  REQUIRE(host.listener_proxy->stats().closed);
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.registry_retirement_status == CHANNEL_RC_OK);
}
TEST_CASE(
    "Actual drdynvc listener proxy reports own refusal when negative CREATE has no global error") {
  Host host(false, true, true, false, true);
  std::vector<BYTE> create{0x10, 0x43};
  create.insert(create.end(), channel_name, channel_name + std::strlen(channel_name) + 1);
  REQUIRE(host.send(create));
  REQUIRE(host.listener_proxy->stats().failed);
  REQUIRE(host.listener_proxy->stats().last_status == ERROR_TOO_MANY_OPEN_FILES);
  REQUIRE(host.listener_proxy->stats().cleanup_status == CHANNEL_RC_OK);
  REQUIRE(host.listener_proxy->stats().accepted == 1);
  REQUIRE(host.channels[1].closes == 1);
  REQUIRE(host.channels[0].closes == 0);
  REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
  host.shutdown();
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.channels[1].closes == 1);
  REQUIRE(host.registry->stats().resources_retired);
}

TEST_CASE("Actual drdynvc manager installs bounded listener and channel proxies through plugin "
          "lifecycle") {
  Host host(false, true, false, false, false, true);
  REQUIRE(host.listener_manager);
  REQUIRE(host.listener_manager->stats().live_listeners == 1);
  REQUIRE(host.registry->owns_callback(host.channels[0].api));
  const BYTE initial[]{1, 2, 3, 4};
  REQUIRE(host.send(first(2, 0x42, 4, initial)));
  REQUIRE(host.registry->stats().budget.releases == 1);
  host.shutdown();
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.terminated == 1);
  REQUIRE(host.listener_manager->stats().retired);
  REQUIRE(host.listener_manager->stats().live_listeners == 0);
  REQUIRE_FALSE(host.listener_manager->stats().failed);
}

TEST_CASE("Actual drdynvc plugin proxy resolves bounded manager and survives delayed duplicate "
          "termination") {
  Host host(false, true, false, false, false, false, true);
  REQUIRE(host.plugin_proxy);
  REQUIRE(host.plugin_proxy->stats().initialize_attempted);
  REQUIRE(host.listener_manager->stats().live_listeners == 1);
  REQUIRE(host.registry->owns_callback(host.channels[0].api));
  const BYTE initial[]{1, 2, 3, 4};
  REQUIRE(host.send(first(2, 0x42, 4, initial)));
  REQUIRE(host.registry->stats().budget.releases == 1);
  host.shutdown();
  REQUIRE(host.channels[0].closes == 1);
  REQUIRE(host.terminated == 1);
  REQUIRE(host.plugin_proxy->stats().ended);
  REQUIRE_FALSE(host.plugin_proxy->stats().failed);
  REQUIRE(host.listener_manager->stats().retired);
  auto *api = host.plugin_proxy->interface();
  REQUIRE(api->Terminated(api) == CHANNEL_RC_OK);
  REQUIRE(host.terminated == 1);
}

TEST_CASE("Actual pinned rdpgfx receives bounded nested single and multipart ZGFX through scoped "
          "public DVC owner") {
  for (bool multipart : {false, true}) {
    Host host(false, true, false, false, false, false, false, false, true, true);
    const BYTE caps[]{0x13, 0, 0, 0, 20, 0, 0, 0, 4, 0, 8, 0, 4, 0, 0, 0, 0, 0, 0, 0};
    std::vector<BYTE> encoded = multipart
                                    ? std::vector<BYTE>{0xe1, 1, 0, 20, 0, 0, 0, 21, 0, 0, 0, 4}
                                    : std::vector<BYTE>{0xe0, 4};
    encoded.insert(encoded.end(), std::begin(caps), std::end(caps));
    REQUIRE(host.send(first(2, 0x42, static_cast<UINT32>(encoded.size()), encoded)));
    REQUIRE(getChannelError(host.context.get()) == CHANNEL_RC_OK);
    REQUIRE(host.registry->stats().budget.releases == 1);
    REQUIRE_FALSE(host.registry->stats().failed);
    REQUIRE(host.dvc_provider->close() == CHANNEL_RC_OK);
    REQUIRE(host.registry->stats().resources_retired);
    host.shutdown();
    REQUIRE(host.plugin_registry->stats().host_unpublished);
    REQUIRE_FALSE(host.plugin_registry->stats().failed);
  }
}
TEST_CASE(
    "Actual pinned rdpgfx nested oversized claims are refused before graphics decoder dispatch") {
  for (bool segment_count : {false, true}) {
    Host host(false, true, false, false, false, false, false, false, true, true);
    const std::vector<BYTE> encoded = segment_count
                                          ? std::vector<BYTE>{0xe1, 1, 0x10, 0, 0, 0, 0}
                                          : std::vector<BYTE>{0xe1, 1, 0, 0xff, 0xff, 0xff, 0xff};
    REQUIRE(host.send(first(2, 0x42, static_cast<UINT32>(encoded.size()), encoded)));
    REQUIRE(host.registry->stats().budget.releases == 1);
    REQUIRE_FALSE(host.registry->poll(host.now_ms));
    REQUIRE(host.registry->stats().failed);
    REQUIRE(host.plugin_registry->stats().failed);
    host.shutdown();
    REQUIRE(host.registry->stats().resources_retired);
    REQUIRE(host.plugin_registry->stats().host_unpublished);
  }
}
