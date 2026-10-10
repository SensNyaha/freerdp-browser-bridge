#include "rdpsnd_provider.hpp"
#include <bit>
#include <catch2/catch_test_macros.hpp>
#include <cstring>
#include <freerdp/client.h>
#include <freerdp/client/channels.h>
#include <freerdp/svc.h>
#include <vector>
#include <winpr/error.h>

using namespace bridge::audio;
namespace {
constexpr DWORD static_abi = FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX;
struct ProviderGuard {
  FREERDP_LOAD_CHANNEL_ADDIN_ENTRY_FN previous = freerdp_get_current_addin_provider();
  ~ProviderGuard() { (void)freerdp_register_addin_provider(previous, 0); }
};
struct Fixture {
  ProviderGuard guard;
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{
      nullptr, freerdp_client_context_free};
  RdpsndSink sink;
  RdpsndProvider provider;
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
  UINT bind() { return provider.bind(*context, sink); }
};
void word(std::vector<BYTE> &bytes, unsigned value) {
  bytes.push_back(static_cast<BYTE>(value));
  bytes.push_back(static_cast<BYTE>(value >> 8));
}
void dword(std::vector<BYTE> &bytes, unsigned value) {
  word(bytes, value);
  word(bytes, value >> 16);
}
std::vector<BYTE> formats() {
  std::vector<BYTE> bytes{SNDC_FORMATS, 0};
  word(bytes, 38);
  dword(bytes, 3);
  dword(bytes, 0xffffffffU);
  dword(bytes, 0);
  word(bytes, 0);
  word(bytes, 1);
  bytes.push_back(0);
  word(bytes, 6);
  bytes.push_back(0);
  word(bytes, WAVE_FORMAT_PCM);
  word(bytes, 2);
  dword(bytes, 48000);
  dword(bytes, 192000);
  word(bytes, 4);
  word(bytes, 16);
  word(bytes, 0);
  return bytes;
}
struct StaticHost {
  CHANNEL_ENTRY_POINTS_FREERDP_EX points{};
  LPVOID plugin = nullptr;
  PCHANNEL_INIT_EVENT_EX_FN init = nullptr;
  PCHANNEL_OPEN_EVENT_EX_FN opened = nullptr;
  unsigned closes = 0;
  bool initialized = false, connected = false;
  char name[7] = "rdpsnd", selection[12] = "sys:browser";
  char *values[2]{name, selection};
  ADDIN_ARGV args{2, values};
  std::vector<std::vector<BYTE>> writes;
  explicit StaticHost(rdpContext *context) {
    points.cbSize = sizeof(points);
    points.protocolVersion = VIRTUAL_CHANNEL_VERSION_WIN2000;
    points.MagicNumber = FREERDP_CHANNEL_MAGIC_NUMBER;
    points.context = context;
    points.pExtendedData = &args;
    points.pVirtualChannelInitEx = [](LPVOID param, LPVOID, LPVOID handle, PCHANNEL_DEF channels,
                                      INT count, ULONG,
                                      PCHANNEL_INIT_EVENT_EX_FN callback) -> UINT {
      auto &host = *static_cast<StaticHost *>(handle);
      if (count != 1 || !channels || std::strcmp(channels->name, "rdpsnd") != 0 || !callback)
        return ERROR_INVALID_PARAMETER;
      host.plugin = param;
      host.init = callback;
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelOpenEx = [](LPVOID handle, LPDWORD result, PCHAR channel,
                                      PCHANNEL_OPEN_EVENT_EX_FN callback) -> UINT {
      auto &host = *static_cast<StaticHost *>(handle);
      if (!result || !channel || std::strcmp(channel, "rdpsnd") != 0 || !callback)
        return ERROR_INVALID_PARAMETER;
      host.opened = callback;
      *result = 1;
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelCloseEx = [](LPVOID handle, DWORD channel) -> UINT {
      if (channel != 1)
        return ERROR_INVALID_PARAMETER;
      ++static_cast<StaticHost *>(handle)->closes;
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelWriteEx = [](LPVOID handle, DWORD channel, LPVOID data, ULONG size,
                                       LPVOID completion) -> UINT {
      auto &host = *static_cast<StaticHost *>(handle);
      if (channel != 1 || !data || !host.opened || size > 65536)
        return ERROR_INVALID_PARAMETER;
      try {
        const auto *bytes = static_cast<const BYTE *>(data);
        host.writes.emplace_back(bytes, bytes + size);
      } catch (...) {
        return ERROR_NOT_ENOUGH_MEMORY;
      }
      host.opened(host.plugin, 1, CHANNEL_EVENT_WRITE_COMPLETE, completion, 0, 0, 0);
      return CHANNEL_RC_OK;
    };
  }
  ~StaticHost() {
    if (plugin) {
      if (connected)
        init(plugin, this, CHANNEL_EVENT_DISCONNECTED, nullptr, 0);
      init(plugin, this, CHANNEL_EVENT_TERMINATED, nullptr, 0);
    }
  }
  void load() {
    const auto entry =
        freerdp_channels_load_static_addin_entry("rdpsnd", nullptr, nullptr, static_abi);
    REQUIRE(entry);
    REQUIRE(std::bit_cast<PVIRTUALCHANNELENTRYEX>(entry)(
        reinterpret_cast<PCHANNEL_ENTRY_POINTS_EX>(&points), this));
    REQUIRE(plugin);
    REQUIRE(init);
  }
  void connect() {
    init(plugin, this, CHANNEL_EVENT_INITIALIZED, nullptr, 0);
    initialized = true;
    REQUIRE(getChannelError(points.context) == CHANNEL_RC_OK);
    init(plugin, this, CHANNEL_EVENT_CONNECTED, nullptr, 0);
    connected = true;
    REQUIRE(getChannelError(points.context) == CHANNEL_RC_OK);
    init(plugin, this, CHANNEL_EVENT_ATTACHED, nullptr, 0);
    REQUIRE(opened);
  }
  void send(std::vector<BYTE> &bytes) {
    REQUIRE(bytes.size() <= 65536);
    const auto size = static_cast<UINT32>(bytes.size());
    opened(plugin, 1, CHANNEL_EVENT_DATA_RECEIVED, bytes.data(), size, size,
           CHANNEL_FLAG_FIRST | CHANNEL_FLAG_LAST);
    REQUIRE(getChannelError(points.context) == CHANNEL_RC_OK);
  }
};
} // namespace

TEST_CASE("RDPSND scoped provider enforces synchronous ownership and exact device ABI") {
  Fixture fixture, second;
  const auto previous = freerdp_get_current_addin_provider();
  rdpContext missing{};
  REQUIRE(fixture.provider.bind(missing, fixture.sink) == ERROR_INVALID_PARAMETER);
  for (const auto setting : {FreeRDP_SynchronousStaticChannels, FreeRDP_SynchronousDynamicChannels,
                             FreeRDP_AsyncChannels, FreeRDP_AsyncUpdate}) {
    const bool synchronous = setting == FreeRDP_SynchronousStaticChannels ||
                             setting == FreeRDP_SynchronousDynamicChannels;
    REQUIRE(
        freerdp_settings_set_bool(fixture.context->settings, setting, synchronous ? FALSE : TRUE));
    REQUIRE(fixture.bind() == ERROR_INVALID_PARAMETER);
    REQUIRE(
        freerdp_settings_set_bool(fixture.context->settings, setting, synchronous ? TRUE : FALSE));
  }
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  REQUIRE(second.bind() == ERROR_INVALID_STATE);
  const auto current = freerdp_get_current_addin_provider();
  REQUIRE(current != previous);
  const auto original = previous("rdpsnd", nullptr, nullptr, static_abi);
  REQUIRE(current("rdpsnd", nullptr, nullptr, static_abi) == original);
  for (const auto flags : {static_abi, DWORD{FREERDP_ADDIN_CHANNEL_DYNAMIC}}) {
    const auto device = current("rdpsnd", "browser", nullptr, flags);
    REQUIRE(device);
    REQUIRE(std::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(device)(nullptr) ==
            ERROR_INVALID_PARAMETER);
  }
  for (const auto flags :
       {DWORD{0}, DWORD{FREERDP_ADDIN_CHANNEL_STATIC}, DWORD{FREERDP_ADDIN_CHANNEL_DEVICE}}) {
    const auto device = current("rdpsnd", "browser", nullptr, flags);
    REQUIRE(device);
    REQUIRE(std::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(device)(nullptr) == ERROR_INVALID_STATE);
  }
  const auto wrong = current("rdpsnd", "browser", "wrong", static_abi);
  REQUIRE(wrong);
  REQUIRE(std::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(wrong)(nullptr) == ERROR_INVALID_STATE);
  UINT foreign = CHANNEL_RC_OK;
  std::thread thread([&] {
    const auto device = current("rdpsnd", "browser", nullptr, static_abi);
    foreign = std::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(device)(nullptr);
  });
  thread.join();
  REQUIRE(foreign == ERROR_INVALID_STATE);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.retired());
  REQUIRE(freerdp_get_current_addin_provider() == previous);
  REQUIRE(fixture.bind() == ERROR_INVALID_STATE);
}

TEST_CASE("Actual pinned static RDPSND registers browser sink and delivers PCM Wave2") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  StaticHost host(fixture.context.get());
  host.load();
  host.connect();
  REQUIRE(fixture.sink.device().rdpsnd == static_cast<rdpsndPlugin *>(host.plugin));
  REQUIRE(freerdp_rdpsnd_get_context(fixture.sink.device().rdpsnd) == fixture.context.get());
  auto configuration = formats();
  host.send(configuration);
  REQUIRE(host.writes.size() == 2);
  REQUIRE(host.writes[0][0] == SNDC_FORMATS);
  REQUIRE(host.writes[1][0] == SNDC_QUALITYMODE);
  const std::vector<BYTE> pcm{0, 128, 255, 127, 1, 0, 254, 255};
  std::vector<BYTE> wave{SNDC_WAVE2, 0};
  word(wave, 20);
  word(wave, 100);
  word(wave, 0);
  wave.insert(wave.end(), {1, 0, 0, 0});
  dword(wave, 100);
  wave.insert(wave.end(), pcm.begin(), pcm.end());
  host.send(wave);
  REQUIRE(host.writes.size() == 4);
  REQUIRE(host.writes[2][0] == SNDC_WAVECONFIRM);
  REQUIRE(host.writes[3][0] == SNDC_WAVECONFIRM);
  std::vector<BYTE> close{SNDC_CLOSE, 0, 0, 0};
  host.send(close);
  // Pinned upstream Close PDU only logs; it does not call the public device Close.
  // Record the boundary explicitly: future packet-clock/discontinuity work is required.
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 2);
  std::vector<BYTE> output(pcm.size());
  const auto result = fixture.sink.read(output);
  REQUIRE(result.status == QueueStatus::accepted);
  REQUIRE(result.frames == 2);
  REQUIRE(result.discontinuity);
  REQUIRE(output == pcm);
  REQUIRE(fixture.sink.stats()->queue.accepted_frames == 2);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.retired());
}

TEST_CASE("RDPSND provider binds actual opaque plugin to its owning client context") {
  Fixture fixture, foreign;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  StaticHost host(foreign.context.get());
  host.load();
  FREERDP_RDPSND_DEVICE_ENTRY_POINTS points{};
  points.rdpsnd = static_cast<rdpsndPlugin *>(host.plugin);
  points.pRegisterRdpsndDevice = [](rdpsndPlugin *, rdpsndDevicePlugin *) {};
  const auto entry = freerdp_get_current_addin_provider()("rdpsnd", "browser", nullptr, static_abi);
  REQUIRE(entry);
  REQUIRE(std::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(entry)(&points) == ERROR_INVALID_PARAMETER);
  REQUIRE(fixture.sink.device().rdpsnd == nullptr);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("RDPSND provider preserves a foreign replacement while retiring resources") {
  Fixture fixture;
  const auto previous = freerdp_get_current_addin_provider();
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  REQUIRE(freerdp_register_addin_provider(previous, 0) == 0);
  REQUIRE(fixture.provider.close() == ERROR_INVALID_STATE);
  REQUIRE(fixture.sink.retired());
  REQUIRE(freerdp_get_current_addin_provider() == previous);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("RDPSND provider refuses uncertain void registration without retry") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  StaticHost host(fixture.context.get());
  host.load();
  FREERDP_RDPSND_DEVICE_ENTRY_POINTS points{};
  points.rdpsnd = static_cast<rdpsndPlugin *>(host.plugin);
  points.pRegisterRdpsndDevice = [](rdpsndPlugin *, rdpsndDevicePlugin *) {};
  const auto entry = freerdp_get_current_addin_provider()("rdpsnd", "browser", nullptr, static_abi);
  REQUIRE(entry);
  REQUIRE(std::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(entry)(&points) == ERROR_INVALID_STATE);
  REQUIRE(std::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(entry)(&points) == ERROR_INVALID_STATE);
  REQUIRE(fixture.sink.device().rdpsnd == nullptr);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}
