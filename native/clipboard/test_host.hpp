#pragma once
#include "receive_guard.hpp"
#include <algorithm>
#include <bit>
#include <catch2/catch_test_macros.hpp>
#include <cstring>
#include <freerdp/client.h>
#include <freerdp/client/channels.h>
#include <freerdp/client/cliprdr.h>
#include <freerdp/svc.h>
#include <memory>
#include <stdexcept>
#include <winpr/error.h>
#include <winpr/wtsapi.h>
using namespace bridge::clipboard;
namespace bridge::clipboard::test {
inline std::vector<BYTE> record(UINT16 kind, UINT16 flags, std::vector<BYTE> body = {}) {
  const auto n = body.size();
  std::vector<BYTE> b{static_cast<BYTE>(kind),    static_cast<BYTE>(kind >> 8),
                      static_cast<BYTE>(flags),   static_cast<BYTE>(flags >> 8),
                      static_cast<BYTE>(n),       static_cast<BYTE>(n >> 8),
                      static_cast<BYTE>(n >> 16), static_cast<BYTE>(n >> 24)};
  b.resize(8 + n);
  std::copy(body.begin(), body.end(), b.begin() + 8);
  return b;
}
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
  CliprdrClientContext *clip = nullptr;
  std::unique_ptr<ClipboardReceiveGuard> guard;
  unsigned deliveries = 0, lists = 0, capabilities = 0, monitors = 0, requests = 0, responses = 0;
  UINT32 format_count = 0, requested_format = 0;
  UINT16 resolved = 1005;
  std::vector<BYTE> samples;
  std::vector<std::vector<BYTE>> writes;
  bool retire_during_response = false;
  std::function<void()> before_write;
  static Host &get(freerdp *i) { return *reinterpret_cast<Context *>(i->context)->owner; }
  static Host &get(CliprdrClientContext *c) { return *static_cast<Host *>(c->custom); }
  static BOOL receive(freerdp *i, UINT16 id, const BYTE *b, std::size_t n, UINT32 flags,
                      std::size_t total) {
    auto &h = get(i);
    if (id != 1005 || n > UINT32_MAX || total > UINT32_MAX)
      return FALSE;
    ++h.deliveries;
    h.opened(h.plugin, 1, CHANNEL_EVENT_DATA_RECEIVED, const_cast<BYTE *>(b),
             static_cast<UINT32>(n), static_cast<UINT32>(total), flags);
    return getChannelError(i->context) == CHANNEL_RC_OK;
  }
  explicit Host(bool callbacks = true) {
    RDP_CLIENT_ENTRY_POINTS entry{};
    entry.Size = sizeof(entry);
    entry.Version = RDP_CLIENT_INTERFACE_VERSION;
    entry.ContextSize = sizeof(Context);
    context.reset(freerdp_client_context_new(&entry));
    REQUIRE(context);
    reinterpret_cast<Context *>(context.get())->owner = this;
    context->instance->SendChannelData = [](freerdp *i, UINT16 id, const BYTE *bytes,
                                            std::size_t size) -> BOOL {
      auto &h = get(i);
      if (id != h.resolved || !bytes || size != 8)
        return FALSE;
      h.writes.emplace_back(bytes, bytes + size);
      return TRUE;
    };
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_SynchronousStaticChannels, TRUE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_AsyncChannels, FALSE));
    REQUIRE(freerdp_settings_set_uint32(context->settings, FreeRDP_ThreadingFlags,
                                        THREADING_FLAGS_DISABLE_THREADS));
    REQUIRE(
        freerdp_settings_set_uint32(context->settings, FreeRDP_ClipboardFeatureMask,
                                    CLIPRDR_FLAG_LOCAL_TO_REMOTE | CLIPRDR_FLAG_REMOTE_TO_LOCAL));
    points.cbSize = sizeof(points);
    points.protocolVersion = VIRTUAL_CHANNEL_VERSION_WIN2000;
    points.MagicNumber = FREERDP_CHANNEL_MAGIC_NUMBER;
    points.context = context.get();
    points.pVirtualChannelInitEx = [](LPVOID param, LPVOID iface, LPVOID handle,
                                      PCHANNEL_DEF channels, INT count, ULONG,
                                      PCHANNEL_INIT_EVENT_EX_FN callback) -> UINT {
      auto &h = *static_cast<Host *>(handle);
      if (count != 1 || !channels || std::strcmp(channels->name, "cliprdr") || !iface || !callback)
        return ERROR_INVALID_PARAMETER;
      h.plugin = param;
      h.clip = static_cast<CliprdrClientContext *>(iface);
      h.init = callback;
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelOpenEx = [](LPVOID handle, LPDWORD result, PCHAR,
                                      PCHANNEL_OPEN_EVENT_EX_FN callback) -> UINT {
      auto &h = *static_cast<Host *>(handle);
      h.opened = callback;
      *result = 1;
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelCloseEx = [](LPVOID, DWORD) -> UINT { return CHANNEL_RC_OK; };
    points.pVirtualChannelWriteEx = [](LPVOID handle, DWORD, LPVOID data, ULONG size,
                                       LPVOID completion) -> UINT {
      auto &h = *static_cast<Host *>(handle);
      const auto *b = static_cast<BYTE *>(data);
      h.writes.emplace_back(b, b + size);
      h.opened(h.plugin, 1, CHANNEL_EVENT_WRITE_COMPLETE, completion, 0, 0, 0);
      return CHANNEL_RC_OK;
    };
    const auto entry_fn = freerdp_channels_load_static_addin_entry(
        "cliprdr", nullptr, nullptr, FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX);
    REQUIRE(entry_fn);
    REQUIRE(std::bit_cast<PVIRTUALCHANNELENTRYEX>(entry_fn)(
        reinterpret_cast<PCHANNEL_ENTRY_POINTS_EX>(&points), this));
    REQUIRE(clip);
    REQUIRE(init);
    if (callbacks) {
      clip->custom = this;
      clip->ServerCapabilities = [](auto *c, const CLIPRDR_CAPABILITIES *) -> UINT {
        ++get(c).capabilities;
        return CHANNEL_RC_OK;
      };
      clip->MonitorReady = [](auto *c, const CLIPRDR_MONITOR_READY *) -> UINT {
        ++get(c).monitors;
        return CHANNEL_RC_OK;
      };
      clip->ServerFormatList = [](auto *c, const CLIPRDR_FORMAT_LIST *list) -> UINT {
        auto &h = get(c);
        ++h.lists;
        h.format_count = list->numFormats;
        CLIPRDR_FORMAT_LIST_RESPONSE response{{CB_FORMAT_LIST_RESPONSE, CB_RESPONSE_OK, 0}};
        return c->ClientFormatListResponse(c, &response);
      };
      clip->ServerFormatDataRequest = [](auto *c, const CLIPRDR_FORMAT_DATA_REQUEST *r) -> UINT {
        ++get(c).requests;
        get(c).requested_format = r->requestedFormatId;
        return CHANNEL_RC_OK;
      };
      clip->ServerFormatDataResponse = [](auto *c, const CLIPRDR_FORMAT_DATA_RESPONSE *r) -> UINT {
        auto &h = get(c);
        ++h.responses;
        if (h.retire_during_response)
          h.guard->close();
        if (r->common.dataLen)
          h.samples.assign(r->requestedFormatData, r->requestedFormatData + r->common.dataLen);
        return CHANNEL_RC_OK;
      };
    }
    init(plugin, this, CHANNEL_EVENT_CONNECTED, nullptr, 0);
    REQUIRE(opened);
    REQUIRE(getChannelError(context.get()) == CHANNEL_RC_OK);
    guard = std::make_unique<ClipboardReceiveGuard>(
        *context->instance, receive, 1024, [](freerdp *i) -> UINT16 { return get(i).resolved; });
  }
  ~Host() {
    if (guard)
      guard->close();
    if (plugin) {
      init(plugin, this, CHANNEL_EVENT_DISCONNECTED, nullptr, 0);
      init(plugin, this, CHANNEL_EVENT_TERMINATED, nullptr, 0);
    }
  }
  bool send(std::span<const BYTE> b, UINT32 flags = CHANNEL_FLAG_ONLY, std::size_t total = 0,
            std::uint64_t now = 1) {
    return guard->receive(1005, b.data(), b.size(), flags, total ? total : b.size(), now);
  }
};
const std::vector<BYTE> long_caps{1, 0, 0, 0, 1, 0, 12, 0, 2, 0, 0, 0, 2, 0, 0, 0};
} // namespace bridge::clipboard::test
