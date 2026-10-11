#include "audin_dvc.hpp"
#include "audin_ingress.hpp"
#include "audin_provider.hpp"
#include "rdpsnd_provider.hpp"
#include <algorithm>
#include <bit>
#include <catch2/catch_test_macros.hpp>
#include <cstring>
#include <freerdp/client.h>
#include <freerdp/client/channels.h>
#include <stdexcept>
#include <type_traits>
#include <vector>
#include <winpr/error.h>
#include <winpr/stream.h>

using namespace bridge::audio;
namespace {
struct ProviderGuard {
  FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN previous = freerdp_get_current_addin_provider();
  ~ProviderGuard() { (void)freerdp_register_addin_provider(previous, 0); }
};
struct Fixture {
  ProviderGuard guard;
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{
      nullptr, freerdp_client_context_free};
  AudinSource source;
  AudinProvider provider;
  char name[6] = "audin", selection[12] = "sys:browser";
  char *values[2]{name, selection};
  ADDIN_ARGV args{2, values};
  Fixture() {
    RDP_CLIENT_ENTRY_POINTS points{};
    points.Size = sizeof(points);
    points.Version = RDP_CLIENT_INTERFACE_VERSION;
    points.ContextSize = sizeof(rdpClientContext);
    context.reset(freerdp_client_context_new(&points));
    REQUIRE(context);
    for (const auto setting :
         {FreeRDP_SynchronousStaticChannels, FreeRDP_SynchronousDynamicChannels})
      REQUIRE(freerdp_settings_set_bool(context->settings, setting, TRUE));
    for (const auto setting : {FreeRDP_AsyncChannels, FreeRDP_AsyncUpdate})
      REQUIRE(freerdp_settings_set_bool(context->settings, setting, FALSE));
  }
  UINT bind() { return provider.bind(*context, source); }
  PFREERDP_AUDIN_DEVICE_ENTRY entry() {
    const auto result = freerdp_load_channel_addin_entry(AUDIN_CHANNEL_NAME, "browser", nullptr, 0);
    REQUIRE(result);
    return std::bit_cast<PFREERDP_AUDIN_DEVICE_ENTRY>(result);
  }
};
struct Registrar : IWTSPlugin {
  IAudinDevice *device = nullptr;
  unsigned calls = 0;
  UINT status = CHANNEL_RC_OK, nested_close = CHANNEL_RC_OK, nested_entry = CHANNEL_RC_OK;
  bool throws = false;
  AudinProvider *provider = nullptr;
  PFREERDP_AUDIN_DEVICE_ENTRY entry = nullptr;
  FREERDP_AUDIN_DEVICE_ENTRY_POINTS *points = nullptr;
  Registrar() : IWTSPlugin{} {}
  static UINT receive(IWTSPlugin *plugin, IAudinDevice *device) {
    auto &self = *static_cast<Registrar *>(plugin);
    self.device = device;
    ++self.calls;
    if (self.provider) {
      self.nested_close = self.provider->close();
      self.nested_entry = self.entry(self.points);
    }
    if (self.throws)
      throw std::runtime_error("fixture registrar failure");
    return self.status;
  }
};
FREERDP_AUDIN_DEVICE_ENTRY_POINTS points(Fixture &fixture, Registrar &registrar) {
  return {&registrar, Registrar::receive, &fixture.args, fixture.context.get()};
}
BOOL VCAPITYPE delegated_entry(PCHANNEL_ENTRY_POINTS) { return TRUE; }
PVIRTUALCHANNELENTRY delegated(LPCSTR name, LPCSTR, LPCSTR, DWORD) {
  return name && std::strcmp(name, "fixture-other") == 0 ? delegated_entry : nullptr;
}
template <class Api> struct Interface {
  Api api{};
  void *owner;
  explicit Interface(void *value) : owner(value) {}
};
// Direct pinned static AUDIN entry; transport only is simulated. General channel
// loader deliberately remains refused until the future DVC gate exists.
struct Host {
  Fixture &fixture;
  AudinIngress ingress;
  AudinDvcGate gate;
  bool guarded = false, via_gate = false;
  Interface<IDRDYNVC_ENTRY_POINTS> entries{this};
  Interface<IWTSVirtualChannelManager> manager{this};
  Interface<IWTSVirtualChannel> channel{this};
  IWTSPlugin *plugin = nullptr;
  IWTSListener listener{};
  IWTSListenerCallback *listener_callback = nullptr;
  IWTSVirtualChannelCallback *callback = nullptr;
  std::vector<std::vector<BYTE>> writes;
  UINT write_status = CHANNEL_RC_OK, register_status = CHANNEL_RC_OK;
  UINT nested_close = CHANNEL_RC_OK;
  UINT nested_host_close = CHANNEL_RC_OK;
  bool close_during_write = false, close_host_during_write = false, write_throws = false;
  unsigned attempts = 0, fail_at = 0;
  unsigned destroyed = 0;
  template <class Api> static Host &get(Api *api) {
    static_assert(std::is_standard_layout_v<Interface<Api>>);
    return *static_cast<Host *>(reinterpret_cast<Interface<Api> *>(api)->owner);
  }
  explicit Host(Fixture &value, bool filter = false, bool wrapped = false)
      : fixture(value), gate(value.source), guarded(filter), via_gate(wrapped) {
    entries.api.GetPlugin = [](IDRDYNVC_ENTRY_POINTS *api, const char *) {
      return get(api).plugin;
    };
    entries.api.GetPluginData = [](IDRDYNVC_ENTRY_POINTS *api) -> const ADDIN_ARGV * {
      return &get(api).fixture.args;
    };
    entries.api.GetRdpContext = [](IDRDYNVC_ENTRY_POINTS *api) {
      return get(api).fixture.context.get();
    };
    entries.api.GetRdpSettings = [](IDRDYNVC_ENTRY_POINTS *api) {
      return get(api).fixture.context->settings;
    };
    entries.api.RegisterPlugin = [](IDRDYNVC_ENTRY_POINTS *api, const char *name,
                                    IWTSPlugin *plugin) -> UINT {
      auto &host = get(api);
      if (!name || std::strcmp(name, AUDIN_CHANNEL_NAME) || !plugin || host.plugin)
        return ERROR_INVALID_PARAMETER;
      if (host.register_status != CHANNEL_RC_OK)
        return host.register_status;
      host.plugin = plugin;
      return CHANNEL_RC_OK;
    };
    manager.api.CreateListener = [](IWTSVirtualChannelManager *api, const char *name, ULONG flags,
                                    IWTSListenerCallback *callback,
                                    IWTSListener **listener) -> UINT {
      auto &host = get(api);
      if (!name || std::strcmp(name, AUDIN_DVC_CHANNEL_NAME) || flags || !callback || !listener)
        return ERROR_INVALID_PARAMETER;
      host.listener_callback = callback;
      *listener = &host.listener;
      return CHANNEL_RC_OK;
    };
    manager.api.DestroyListener = [](IWTSVirtualChannelManager *api, IWTSListener *) -> UINT {
      auto &host = get(api);
      host.listener_callback = nullptr;
      ++host.destroyed;
      return CHANNEL_RC_OK;
    };
    channel.api.Write = [](IWTSVirtualChannel *api, ULONG size, const BYTE *data, void *) -> UINT {
      auto &host = get(api);
      ++host.attempts;
      if (host.close_during_write)
        host.nested_close = host.fixture.provider.close();
      if (host.close_host_during_write)
        host.nested_host_close = host.close();
      if (host.write_throws)
        throw std::runtime_error("fixture DVC write failure");
      if (host.fail_at && host.attempts == host.fail_at)
        return CHANNEL_RC_NOT_CONNECTED;
      if (host.write_status != CHANNEL_RC_OK)
        return host.write_status;
      if (!data || !size || size > 19201 || host.writes.size() == 32)
        return ERROR_INVALID_DATA;
      host.writes.emplace_back(data, data + size);
      return CHANNEL_RC_OK;
    };
  }
  ~Host() { (void)close(); }
  UINT install() {
    const auto entry = freerdp_channels_load_static_addin_entry(
        AUDIN_CHANNEL_NAME, nullptr, nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC);
    REQUIRE(entry);
    return std::bit_cast<PDVC_PLUGIN_ENTRY>(entry)(&entries.api);
  }
  void open() {
    REQUIRE(plugin);
    REQUIRE(plugin->Initialize(plugin, &manager.api) == CHANNEL_RC_OK);
    REQUIRE(listener_callback);
    BOOL accepted = TRUE;
    const auto result =
        via_gate ? gate.open(*fixture.context, listener_callback, &channel.api, nullptr, &accepted,
                             &callback)
                 : listener_callback->OnNewChannelConnection(listener_callback, &channel.api,
                                                             nullptr, &accepted, &callback);
    REQUIRE(result == CHANNEL_RC_OK);
    REQUIRE(accepted);
    REQUIRE(callback);
  }
  UINT send(std::vector<BYTE> bytes) {
    std::span<const BYTE> forwarded = bytes;
    if (guarded && !via_gate) {
      const auto pdu = ingress.inspect(bytes);
      if (!pdu)
        return ERROR_INVALID_DATA;
      if (!pdu->forward)
        return ERROR_NOT_SUPPORTED;
      forwarded = pdu->bytes;
    }
    wStream stream{};
    REQUIRE(Stream_StaticConstInit(&stream, forwarded.data(), forwarded.size()));
    return callback->OnDataReceived(callback, &stream);
  }
  UINT close() {
    if (via_gate && !gate.retired() && !gate.quiescent())
      return ERROR_INVALID_STATE;
    UINT result = CHANNEL_RC_OK;
    if (callback) {
      result = callback->OnClose(callback);
      callback = nullptr;
    }
    if (via_gate) {
      const auto retired = gate.retire();
      if (result == CHANNEL_RC_OK)
        result = retired;
    }
    if (plugin) {
      const auto terminated = plugin->Terminated(plugin);
      plugin = nullptr;
      if (result == CHANNEL_RC_OK)
        result = terminated;
    }
    return result;
  }
};
void word(std::vector<BYTE> &data, unsigned value) {
  data.push_back(static_cast<BYTE>(value));
  data.push_back(static_cast<BYTE>(value >> 8));
}
void dword(std::vector<BYTE> &data, unsigned value) {
  word(data, value);
  word(data, value >> 16);
}
std::vector<BYTE> formats() {
  std::vector<BYTE> data{2};
  dword(data, 2);
  dword(data, 45);
  for (const unsigned channels : {2U, 1U}) {
    word(data, WAVE_FORMAT_PCM);
    word(data, channels);
    dword(data, 48000);
    dword(data, 48000 * channels * 2);
    word(data, channels * 2);
    word(data, 16);
    word(data, 0);
  }
  return data;
}
void negotiate(Host &host) {
  REQUIRE(host.send({1, 1, 0, 0, 0}) == CHANNEL_RC_OK);
  REQUIRE(host.send(formats()) == CHANNEL_RC_OK);
  std::vector<BYTE> open{3, 0xc0, 3, 0, 0, 0, 0, 0, 0};
  const auto offer = formats();
  open.insert(open.end(), offer.begin() + 9, offer.begin() + 27);
  REQUIRE(host.send(open) == CHANNEL_RC_OK);
  REQUIRE(host.fixture.source.stats()->opened);
}
} // namespace
TEST_CASE("AUDIN DVC gate confirms negotiated capture pairs and survives delayed host close") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Host host(fixture, false, true);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  REQUIRE_FALSE(host.gate.ready());
  REQUIRE(host.gate.pump() == AudinPumpStatus::inactive);
  negotiate(host);
  REQUIRE(host.gate.ready());
  std::vector<BYTE> input(3840, 0x41);
  REQUIRE(fixture.source.submit({1, 0, true, input}) == CaptureStatus::accepted);
  REQUIRE(fixture.source.submit({1, 20000, false, input}) == CaptureStatus::accepted);
  REQUIRE(host.gate.pump() == AudinPumpStatus::delivered);
  REQUIRE(host.writes.size() == 7);
  REQUIRE(host.writes[5] == std::vector<BYTE>{5});
  REQUIRE(host.writes.back().size() == 3841);
  REQUIRE(std::equal(input.begin(), input.end(), host.writes.back().begin() + 1));
  REQUIRE(host.send({7, 1, 0, 0, 0}) == CHANNEL_RC_OK);
  REQUIRE(host.gate.ready());
  REQUIRE(fixture.source.stats()->epoch == 2);
  REQUIRE(host.gate.pump() == AudinPumpStatus::delivered);
  REQUIRE(host.writes.back().size() == 1921);
  REQUIRE(std::all_of(host.writes.back().begin() + 1, host.writes.back().end(),
                      [](BYTE value) { return value == 0; }));
  auto *late = host.callback;
  REQUIRE(host.gate.retire() == CHANNEL_RC_OK);
  REQUIRE_FALSE(host.gate.ready());
  REQUIRE_FALSE(fixture.source.stats()->opened);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  UINT delayed = ERROR_INTERNAL_ERROR, terminated = ERROR_INTERNAL_ERROR;
  std::thread thread([&] {
    delayed = late->OnClose(late);
    terminated = host.close();
  });
  thread.join();
  REQUIRE(delayed == CHANNEL_RC_OK);
  REQUIRE(terminated == CHANNEL_RC_OK);
  REQUIRE(host.destroyed == 1);
}
TEST_CASE("AUDIN DVC gate reports no common format without entering upstream zero-count parser") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Host host(fixture, false, true);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  REQUIRE(host.send({1, 2, 0, 0, 0}) == CHANNEL_RC_OK);
  auto unsupported = formats();
  unsupported[23] = unsupported[41] = 24;
  REQUIRE(host.send(unsupported) == CHANNEL_RC_OK);
  REQUIRE(host.writes.size() == 3);
  REQUIRE(host.writes[1] == std::vector<BYTE>{5});
  REQUIRE(host.writes[2] == std::vector<BYTE>{2, 0, 0, 0, 0, 9, 0, 0, 0});
  REQUIRE(host.gate.phase() == AudinChannelPhase::unsupported);
  REQUIRE_FALSE(host.gate.ready());
  REQUIRE(host.gate.pump() == AudinPumpStatus::inactive);
  REQUIRE(fixture.source.stats()->epoch == 0);
  REQUIRE(host.close() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}
TEST_CASE("AUDIN DVC gate refuses bad Open before device and closes capture on malformed change") {
  for (const unsigned fault : {0U, 1U, 2U}) {
    Fixture fixture;
    REQUIRE(fixture.bind() == CHANNEL_RC_OK);
    Host host(fixture, false, true);
    REQUIRE(host.install() == CHANNEL_RC_OK);
    host.open();
    REQUIRE(host.send({1, 2, 0, 0, 0}) == CHANNEL_RC_OK);
    REQUIRE(host.send(formats()) == CHANNEL_RC_OK);
    std::vector<BYTE> open{3, 0xc0, 3, 0, 0, 0, 0, 0, 0};
    const auto offer = formats();
    if (fault)
      open.insert(open.end(), offer.begin() + 9, offer.begin() + 27);
    if (fault == 1) {
      open[1] = 0xc1;
      open[2] = 0x12; // 4,801 frames.
    }
    if (fault == 2)
      open[5] = 2;
    REQUIRE(host.send(open) == ERROR_INVALID_DATA);
    REQUIRE(host.writes.size() == 3);
    REQUIRE_FALSE(fixture.source.stats()->opened);
    REQUIRE(fixture.source.stats()->epoch == 0);
    REQUIRE(host.gate.phase() == AudinChannelPhase::failed);
    REQUIRE(host.close() == CHANNEL_RC_OK);
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  }
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Host host(fixture, false, true);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(host.send({7, 2, 0, 0, 0}) == ERROR_INVALID_DATA);
  REQUIRE_FALSE(fixture.source.stats()->opened);
  REQUIRE(host.gate.pump() == AudinPumpStatus::inactive);
  REQUIRE(host.writes.size() == 5);
  REQUIRE(host.close() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}
TEST_CASE("AUDIN DVC gate checks both data writes and exceptions without sample retry") {
  for (const unsigned failure : {0U, 1U, 2U}) {
    Fixture fixture;
    REQUIRE(fixture.bind() == CHANNEL_RC_OK);
    Host host(fixture, false, true);
    REQUIRE(host.install() == CHANNEL_RC_OK);
    host.open();
    negotiate(host);
    if (failure)
      host.fail_at = host.attempts + failure;
    else
      host.write_throws = true;
    REQUIRE(host.gate.pump() == AudinPumpStatus::failed);
    REQUIRE(host.gate.phase() == AudinChannelPhase::failed);
    const UINT expected = failure ? CHANNEL_RC_NOT_CONNECTED : ERROR_INTERNAL_ERROR;
    REQUIRE(host.gate.last_error() == expected);
    REQUIRE(fixture.source.stats()->last_error == expected);
    REQUIRE_FALSE(fixture.source.stats()->opened);
    REQUIRE(fixture.source.stats()->callback_failures == 1);
    REQUIRE(host.gate.pump() == AudinPumpStatus::inactive);
    REQUIRE(host.writes.size() == (failure == 2 ? 6U : 5U));
    REQUIRE(host.close() == CHANNEL_RC_OK);
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  }
}
TEST_CASE("AUDIN DVC gate requires both successful Open replies before capture readiness") {
  for (const unsigned failure : {1U, 2U}) {
    Fixture fixture;
    REQUIRE(fixture.bind() == CHANNEL_RC_OK);
    Host host(fixture, false, true);
    REQUIRE(host.install() == CHANNEL_RC_OK);
    host.open();
    REQUIRE(host.send({1, 2, 0, 0, 0}) == CHANNEL_RC_OK);
    REQUIRE(host.send(formats()) == CHANNEL_RC_OK);
    REQUIRE_FALSE(host.gate.ready());
    host.fail_at = host.attempts + failure;
    std::vector<BYTE> open{3, 0xc0, 3, 0, 0, 0, 0, 0, 0};
    const auto offer = formats();
    open.insert(open.end(), offer.begin() + 9, offer.begin() + 27);
    REQUIRE(host.send(open) == CHANNEL_RC_NOT_CONNECTED);
    REQUIRE_FALSE(host.gate.ready());
    REQUIRE_FALSE(fixture.source.stats()->opened);
    REQUIRE(host.gate.phase() == AudinChannelPhase::failed);
    REQUIRE(host.gate.pump() == AudinPumpStatus::inactive);
    REQUIRE(host.writes.size() == (failure == 2 ? 4U : 3U));
    REQUIRE(host.close() == CHANNEL_RC_OK);
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  }
}
TEST_CASE("AUDIN DVC gate bounds maximum negotiated PCM block and silence padding") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Host host(fixture, false, true);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  REQUIRE(host.send({1, 2, 0, 0, 0}) == CHANNEL_RC_OK);
  REQUIRE(host.send(formats()) == CHANNEL_RC_OK);
  std::vector<BYTE> open{3, 0xc0, 0x12, 0, 0, 0, 0, 0, 0}; // 4,800 stereo frames.
  const auto offer = formats();
  open.insert(open.end(), offer.begin() + 9, offer.begin() + 27);
  REQUIRE(host.send(open) == CHANNEL_RC_OK);
  REQUIRE(host.gate.ready());
  for (unsigned i = 0; i < 6; ++i) {
    const std::vector<BYTE> input(3840, static_cast<BYTE>(0x10 + i));
    REQUIRE(fixture.source.submit({1, i * 20000ULL, i == 0, input}) == CaptureStatus::accepted);
  }
  REQUIRE(host.gate.pump() == AudinPumpStatus::delivered);
  REQUIRE(host.writes.back().size() == 19201);
  REQUIRE(host.writes.back()[0] == 6);
  for (std::size_t i = 0; i < 5; ++i) {
    const auto begin = host.writes.back().begin() + 1 + i * 3840;
    REQUIRE(std::all_of(begin, begin + 3840,
                        [i](BYTE value) { return value == static_cast<BYTE>(0x10 + i); }));
  }
  REQUIRE(host.gate.pump() == AudinPumpStatus::delivered);
  REQUIRE(host.writes.back().size() == 19201);
  REQUIRE(std::all_of(host.writes.back().begin() + 1, host.writes.back().begin() + 3841,
                      [](BYTE value) { return value == 0x15; }));
  REQUIRE(std::all_of(host.writes.back().begin() + 3841, host.writes.back().end(),
                      [](BYTE value) { return value == 0; }));
  REQUIRE(fixture.source.stats()->capture.queue.silence_frames == 3840);
  REQUIRE(host.close() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}
TEST_CASE("AUDIN DVC gate catches detached upstream success without a PCM transport pair") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Host host(fixture, false, true);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(host.plugin->Detached(host.plugin) == CHANNEL_RC_OK);
  REQUIRE(host.gate.pump() == AudinPumpStatus::failed);
  REQUIRE(host.writes.size() == 5);
  REQUIRE_FALSE(host.gate.ready());
  REQUIRE(host.gate.last_error() == ERROR_INVALID_DATA);
  REQUIRE_FALSE(fixture.source.stats()->opened);
  REQUIRE(host.close() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}
TEST_CASE("AUDIN DVC gate preserves active callback ownership through reentrant host close") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Host host(fixture, false, true);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  host.close_host_during_write = true;
  REQUIRE(host.gate.pump() == AudinPumpStatus::delivered);
  REQUIRE(host.nested_host_close == ERROR_INVALID_STATE);
  REQUIRE(host.plugin);
  REQUIRE(host.callback);
  REQUIRE(host.gate.ready());
  host.close_host_during_write = false;
  REQUIRE(host.close() == CHANNEL_RC_OK);
  REQUIRE(host.destroyed == 1);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}
TEST_CASE("AUDIN DVC gate refuses foreign calls before owner retirement and channel reuse") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Host host(fixture, false, true);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  UINT close = CHANNEL_RC_OK, retire = CHANNEL_RC_OK;
  AudinPumpStatus pumped = AudinPumpStatus::delivered;
  std::thread thread([&] {
    close = host.callback->OnClose(host.callback);
    retire = host.gate.retire();
    pumped = host.gate.pump();
  });
  thread.join();
  REQUIRE(close == ERROR_INVALID_STATE);
  REQUIRE(retire == ERROR_INVALID_STATE);
  REQUIRE(pumped == AudinPumpStatus::inactive);
  BOOL accepted = TRUE;
  IWTSVirtualChannelCallback *reopened = host.callback;
  REQUIRE(host.gate.open(*fixture.context, host.listener_callback, &host.channel.api, nullptr,
                         &accepted, &reopened) == ERROR_INVALID_STATE);
  REQUIRE_FALSE(accepted);
  REQUIRE_FALSE(reopened);
  REQUIRE(host.close() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("AUDIN provider binds exact backend context and refuses malformed registration") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Registrar registrar;
  auto args = points(fixture, registrar);
  const auto entry = fixture.entry();
  REQUIRE(entry(nullptr) == ERROR_INVALID_PARAMETER);
  args.plugin = nullptr;
  REQUIRE(entry(&args) == ERROR_INVALID_PARAMETER);
  args.plugin = &registrar;
  args.pRegisterAudinDevice = nullptr;
  REQUIRE(entry(&args) == ERROR_INVALID_PARAMETER);
  args.pRegisterAudinDevice = Registrar::receive;
  args.rdpcontext = nullptr;
  REQUIRE(entry(&args) == ERROR_INVALID_PARAMETER);
  args.rdpcontext = fixture.context.get();
  args.args = nullptr;
  REQUIRE(entry(&args) == ERROR_INVALID_PARAMETER);
  args.args = &fixture.args;
  fixture.args.argc = 1;
  REQUIRE(entry(&args) == ERROR_INVALID_PARAMETER);
  fixture.args.argc = 2;
  fixture.values[1] = nullptr;
  REQUIRE(entry(&args) == ERROR_INVALID_PARAMETER);
  fixture.values[1] = fixture.selection;
  fixture.selection[0] = 'x';
  REQUIRE(entry(&args) == ERROR_INVALID_PARAMETER);
  fixture.selection[0] = 's';
  REQUIRE(registrar.calls == 0);
  REQUIRE(entry(&args) == CHANNEL_RC_OK);
  REQUIRE(registrar.device == &fixture.source.device());
  REQUIRE(registrar.calls == 1);
  REQUIRE(entry(&args) == ERROR_INVALID_STATE);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(fixture.source.retired());
  REQUIRE(entry(&args) == ERROR_INVALID_STATE);
  REQUIRE(registrar.device->Free(registrar.device) == CHANNEL_RC_OK);
  REQUIRE(fixture.bind() == ERROR_INVALID_STATE);
}
TEST_CASE("AUDIN provider refuses channel paths and foreign selectors without loader fallback") {
  Fixture fixture;
  REQUIRE(freerdp_register_addin_provider(delegated, 0) == 0);
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  REQUIRE(freerdp_load_channel_addin_entry("fixture-other", nullptr, nullptr, 0) ==
          delegated_entry);
  for (const auto subsystem : {"winmm", "browser"}) {
    const auto raw = freerdp_load_channel_addin_entry(AUDIN_CHANNEL_NAME, subsystem, "wrong", 0);
    REQUIRE(raw);
    REQUIRE(std::bit_cast<PFREERDP_AUDIN_DEVICE_ENTRY>(raw)(nullptr) == ERROR_INVALID_STATE);
  }
  const auto dynamic = freerdp_load_channel_addin_entry(AUDIN_CHANNEL_NAME, nullptr, nullptr,
                                                        FREERDP_ADDIN_CHANNEL_DYNAMIC);
  REQUIRE(dynamic);
  REQUIRE(std::bit_cast<PDVC_PLUGIN_ENTRY>(dynamic)(nullptr) == ERROR_NOT_SUPPORTED);
  const auto legacy = freerdp_load_channel_addin_entry(AUDIN_CHANNEL_NAME, nullptr, nullptr,
                                                       FREERDP_ADDIN_CHANNEL_STATIC);
  REQUIRE(legacy);
  REQUIRE_FALSE(legacy(nullptr));
  const auto ex = freerdp_load_channel_addin_entry(AUDIN_CHANNEL_NAME, nullptr, nullptr,
                                                   FREERDP_ADDIN_CHANNEL_STATIC |
                                                       FREERDP_ADDIN_CHANNEL_ENTRYEX);
  REQUIRE(ex);
  REQUIRE_FALSE(std::bit_cast<PVIRTUALCHANNELENTRYEX>(ex)(nullptr, nullptr));
  Registrar registrar;
  auto args = points(fixture, registrar);
  auto entry = fixture.entry();
  UINT foreign = CHANNEL_RC_OK, close = CHANNEL_RC_OK;
  bool nonnull = false;
  std::thread thread([&] {
    const auto raw = freerdp_load_channel_addin_entry(AUDIN_CHANNEL_NAME, "browser", nullptr, 0);
    nonnull = raw != nullptr;
    foreign = raw ? std::bit_cast<PFREERDP_AUDIN_DEVICE_ENTRY>(raw)(&args) : CHANNEL_RC_OK;
    close = fixture.provider.close();
  });
  thread.join();
  REQUIRE(nonnull);
  REQUIRE(foreign == ERROR_INVALID_STATE);
  REQUIRE(close == ERROR_INVALID_STATE);
  REQUIRE(registrar.calls == 0);
  REQUIRE(entry(&args) == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(freerdp_get_current_addin_provider() == delegated);
}
TEST_CASE("AUDIN provider consumes uncertain registrar handoff and blocks reentrant close") {
  for (const bool throws : {false, true}) {
    Fixture fixture;
    REQUIRE(fixture.bind() == CHANNEL_RC_OK);
    Registrar registrar;
    registrar.status = ERROR_NOT_SUPPORTED;
    registrar.throws = throws;
    registrar.provider = &fixture.provider;
    registrar.entry = fixture.entry();
    auto args = points(fixture, registrar);
    registrar.points = &args;
    const UINT expected = throws ? ERROR_INTERNAL_ERROR : ERROR_NOT_SUPPORTED;
    REQUIRE(registrar.entry(&args) == expected);
    REQUIRE(registrar.calls == 1);
    REQUIRE(registrar.nested_close == ERROR_INVALID_STATE);
    REQUIRE(registrar.nested_entry == ERROR_INVALID_STATE);
    REQUIRE_FALSE(fixture.source.retired());
    REQUIRE(registrar.entry(&args) == ERROR_INVALID_STATE);
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
    REQUIRE(registrar.device->Free(registrar.device) == CHANNEL_RC_OK);
  }
}
TEST_CASE("AUDIN provider composes with RDPSND in either order and retires in reverse order") {
  for (const bool microphone_first : {false, true}) {
    Fixture fixture;
    RdpsndSink sink;
    RdpsndProvider sound;
    if (microphone_first) {
      REQUIRE(fixture.bind() == CHANNEL_RC_OK);
      REQUIRE(sound.bind(*fixture.context, sink) == CHANNEL_RC_OK);
    } else {
      REQUIRE(sound.bind(*fixture.context, sink) == CHANNEL_RC_OK);
      REQUIRE(fixture.bind() == CHANNEL_RC_OK);
    }
    Registrar registrar;
    auto args = points(fixture, registrar);
    REQUIRE(fixture.entry()(&args) == CHANNEL_RC_OK);
    if (microphone_first) {
      REQUIRE(fixture.provider.close() == ERROR_INVALID_STATE);
      REQUIRE_FALSE(fixture.source.retired());
      REQUIRE(sound.close() == CHANNEL_RC_OK);
      REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
    } else {
      REQUIRE(sound.close() == ERROR_INVALID_STATE);
      REQUIRE_FALSE(sink.retired());
      REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
      REQUIRE(sound.close() == CHANNEL_RC_OK);
    }
    REQUIRE(registrar.device->Free(registrar.device) == CHANNEL_RC_OK);
  }
}
TEST_CASE("AUDIN linked channel projects virtual PCM and reopens fresh capture epochs") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Host host(fixture);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(host.writes.size() == 5);
  REQUIRE(host.writes[1] == std::vector<BYTE>{5});
  REQUIRE(host.writes[2] == formats());
  REQUIRE(host.writes[3] == std::vector<BYTE>{7, 0, 0, 0, 0});
  REQUIRE(host.writes[4] == std::vector<BYTE>{4, 0, 0, 0, 0});
  std::vector<BYTE> input(3840, 0x12);
  REQUIRE(fixture.source.submit({1, 0, true, input}) == CaptureStatus::accepted);
  REQUIRE(fixture.source.submit({1, 20000, false, input}) == CaptureStatus::accepted);
  host.close_during_write = true;
  REQUIRE(fixture.source.pump() == AudinPumpStatus::delivered);
  REQUIRE(host.nested_close == ERROR_INVALID_STATE);
  REQUIRE_FALSE(fixture.source.retired());
  host.close_during_write = false;
  REQUIRE(host.writes.size() == 7);
  REQUIRE(host.writes[5] == std::vector<BYTE>{5});
  REQUIRE(host.writes[6].size() == 3841);
  REQUIRE(host.writes[6][0] == 6);
  REQUIRE(std::equal(input.begin(), input.end(), host.writes[6].begin() + 1));
  REQUIRE(host.send({7, 1, 0, 0, 0}) == CHANNEL_RC_OK);
  REQUIRE(fixture.source.stats()->epoch == 2);
  REQUIRE(fixture.source.submit({1, 40000, false, input}) == CaptureStatus::stale);
  REQUIRE(fixture.source.submit({2, 0, true, input}) == CaptureStatus::accepted);
  REQUIRE(fixture.source.submit({2, 20000, false, input}) == CaptureStatus::accepted);
  REQUIRE(fixture.source.pump() == AudinPumpStatus::delivered);
  REQUIRE(host.writes.back().size() == 1921);
  REQUIRE(host.writes.back()[0] == 6);
  REQUIRE(std::all_of(host.writes.back().begin() + 1, host.writes.back().end(),
                      [](BYTE value) { return value == 0x12; }));
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(fixture.source.pump() == AudinPumpStatus::inactive);
  UINT close = ERROR_INTERNAL_ERROR;
  std::thread late([&] { close = host.close(); });
  late.join();
  REQUIRE(close == CHANNEL_RC_OK);
  REQUIRE(host.destroyed == 1);
}
TEST_CASE("AUDIN guarded fixture removes DSP offers before linked channel negotiation") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Host host(fixture, true);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  REQUIRE(host.send({1, 2, 0, 0, 0}) == CHANNEL_RC_OK);
  auto mixed = formats();
  mixed[1] = 3;
  std::vector<BYTE> unsupported(mixed.begin() + 9, mixed.begin() + 27);
  unsupported[14] = 24;
  mixed.insert(mixed.begin() + 9, unsupported.begin(), unsupported.end());
  mixed.insert(mixed.end(), {0xde, 0xad, 0xbe, 0xef});
  REQUIRE(host.send(mixed) == CHANNEL_RC_OK);
  REQUIRE(host.writes.size() == 3);
  REQUIRE(host.writes[2] == formats());
  std::vector<BYTE> open{3, 0xc0, 3, 0, 0, 1, 0, 0, 0};
  const auto offer = formats();
  open.insert(open.end(), offer.begin() + 27, offer.end());
  REQUIRE(host.send(open) == CHANNEL_RC_OK);
  REQUIRE(fixture.source.pump() == AudinPumpStatus::delivered);
  REQUIRE(host.writes.back().size() == 1921);
  REQUIRE(std::all_of(host.writes.back().begin() + 1, host.writes.back().end(),
                      [](BYTE value) { return value == 0; }));
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}
TEST_CASE(
    "AUDIN guarded fixture refuses oversized table or callback before linked parser mutation") {
  SECTION("Oversized table has no upstream reply or open") {
    Fixture fixture;
    REQUIRE(fixture.bind() == CHANNEL_RC_OK);
    Host host(fixture, true);
    REQUIRE(host.install() == CHANNEL_RC_OK);
    host.open();
    REQUIRE(host.send({1, 2, 0, 0, 0}) == CHANNEL_RC_OK);
    auto oversized = formats();
    oversized[1] = 65;
    REQUIRE(host.send(oversized) == ERROR_INVALID_DATA);
    REQUIRE(host.writes.size() == 1);
    REQUIRE_FALSE(fixture.source.stats()->opened);
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
    REQUIRE(host.close() == CHANNEL_RC_OK);
  }
  SECTION("Oversized FramesPerPacket never opens device") {
    Fixture fixture;
    REQUIRE(fixture.bind() == CHANNEL_RC_OK);
    Host host(fixture, true);
    REQUIRE(host.install() == CHANNEL_RC_OK);
    host.open();
    REQUIRE(host.send({1, 2, 0, 0, 0}) == CHANNEL_RC_OK);
    REQUIRE(host.send(formats()) == CHANNEL_RC_OK);
    std::vector<BYTE> open{3, 0xc1, 0x12, 0, 0, 0, 0, 0, 0};
    const auto offer = formats();
    open.insert(open.end(), offer.begin() + 9, offer.begin() + 27);
    REQUIRE(host.send(open) == ERROR_INVALID_DATA);
    REQUIRE(host.writes.size() == 3);
    REQUIRE_FALSE(fixture.source.stats()->opened);
    REQUIRE(fixture.source.stats()->epoch == 0);
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
    REQUIRE(host.close() == CHANNEL_RC_OK);
  }
}
TEST_CASE(
    "AUDIN linked channel rejects registration failure and stops after transport write error") {
  SECTION("Failed plugin registration frees handed-off source once") {
    Fixture fixture;
    REQUIRE(fixture.bind() == CHANNEL_RC_OK);
    Host host(fixture);
    host.register_status = ERROR_NOT_SUPPORTED;
    REQUIRE(host.install() == ERROR_NOT_SUPPORTED);
    REQUIRE_FALSE(host.plugin);
    REQUIRE(fixture.source.retired());
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  }
  SECTION("Failed data write closes capture instead of retrying samples") {
    Fixture fixture;
    REQUIRE(fixture.bind() == CHANNEL_RC_OK);
    Host host(fixture);
    REQUIRE(host.install() == CHANNEL_RC_OK);
    host.open();
    negotiate(host);
    host.write_status = CHANNEL_RC_NOT_CONNECTED;
    REQUIRE(fixture.source.pump() == AudinPumpStatus::failed);
    REQUIRE_FALSE(fixture.source.stats()->opened);
    REQUIRE(fixture.source.stats()->last_error == CHANNEL_RC_NOT_CONNECTED);
    REQUIRE(fixture.source.pump() == AudinPumpStatus::inactive);
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
    REQUIRE(host.close() == CHANNEL_RC_OK);
  }
}
