#include "../compat/bit.hpp"
#include "../compat/span.hpp"
#include "addin_provider.hpp"
#include "ingress.hpp"
#include "output_queue.hpp"
#include "publisher.hpp"
#include "rdpsnd_provider.hpp"
#include "reset_control.hpp"
#include "session.hpp"
#include "static_gate.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <cstring>
#include <freerdp/channels/channels.h>
#include <freerdp/client.h>
#include <freerdp/client/channels.h>
#include <freerdp/svc.h>
#include <opus/opus.h>
#include <stdexcept>
#include <thread>
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
struct GateScope {
  Fixture &fixture;
  AudioStaticGate gate;
  explicit GateScope(Fixture &value) : fixture(value), gate(*value.context, value.sink) {
    REQUIRE(fixture.provider.bind(*fixture.context, fixture.sink, &gate) == CHANNEL_RC_OK);
  }
  ~GateScope() { (void)fixture.provider.close(); }
};
struct TouchScope {
  bridge::touch::PluginRegistration registration;
  bridge::touch::AddinProvider provider;
  explicit TouchScope(rdpContext &context) {
    REQUIRE(provider.bind(context, registration) == CHANNEL_RC_OK);
  }
  ~TouchScope() { (void)provider.close(); }
};
struct DynamicHost {
  IDRDYNVC_ENTRY_POINTS api{};
  rdpContext *context;
  IWTSPlugin *plugin = nullptr;
  unsigned registrations = 0;
  static DynamicHost &get(IDRDYNVC_ENTRY_POINTS *points) {
    return *reinterpret_cast<DynamicHost *>(points);
  }
  explicit DynamicHost(rdpContext *value) : context(value) {
    api.GetRdpContext = [](IDRDYNVC_ENTRY_POINTS *points) { return get(points).context; };
    api.GetRdpSettings = [](IDRDYNVC_ENTRY_POINTS *points) {
      return get(points).context->settings;
    };
    api.GetPlugin = [](IDRDYNVC_ENTRY_POINTS *points, const char *) { return get(points).plugin; };
    api.RegisterPlugin = [](IDRDYNVC_ENTRY_POINTS *points, const char *, IWTSPlugin *plugin) {
      auto &host = get(points);
      host.plugin = plugin;
      ++host.registrations;
      return UINT{CHANNEL_RC_OK};
    };
  }
  ~DynamicHost() {
    if (plugin)
      (void)plugin->Terminated(plugin);
  }
  void enter(PVIRTUALCHANNELENTRY entry) {
    REQUIRE(entry);
    REQUIRE(::bridge::compat::bit_cast<PDVC_PLUGIN_ENTRY>(entry)(&api) == CHANNEL_RC_OK);
    REQUIRE(registrations == 1);
  }
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
  unsigned close_failures = 0;
  bool close_throws = false;
  bool initialized = false, connected = false;
  char name[7] = "rdpsnd", selection[12] = "sys:browser";
  char *values[2]{name, selection};
  ADDIN_ARGV args{2, values};
  std::vector<std::vector<BYTE>> writes;
  AudioAssembler assembler;
  AudioPduValidator validator;
  unsigned deliveries = 0;
  bool defer_writes = false;
  std::vector<LPVOID> pending;
  AudioStaticGate *nested_retire = nullptr;
  UINT nested_result = CHANNEL_RC_OK;
  bool nested_data = false;
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
      auto &host = *static_cast<StaticHost *>(handle);
      ++host.closes;
      if (host.close_failures) {
        --host.close_failures;
        if (host.close_throws)
          throw std::runtime_error("fixture close failure");
        return ERROR_ACCESS_DENIED;
      }
      return CHANNEL_RC_OK;
    };
    points.pVirtualChannelWriteEx = [](LPVOID handle, DWORD channel, LPVOID data, ULONG size,
                                       LPVOID completion) -> UINT {
      auto &host = *static_cast<StaticHost *>(handle);
      if (channel != 1 || !data || !host.opened || size > 65536)
        return ERROR_INVALID_PARAMETER;
      if (host.nested_retire) {
        auto *gate = host.nested_retire;
        host.nested_retire = nullptr;
        host.nested_result = gate->retire();
      }
      if (host.nested_data) {
        host.nested_data = false;
        const std::array<BYTE, 4> close{SNDC_CLOSE, 0, 0, 0};
        host.raw(close, 4);
      }
      try {
        const auto *bytes = static_cast<const BYTE *>(data);
        host.writes.emplace_back(bytes, bytes + size);
        if (host.defer_writes) {
          host.pending.push_back(completion);
          return CHANNEL_RC_OK;
        }
      } catch (...) {
        return ERROR_NOT_ENOUGH_MEMORY;
      }
      host.opened(host.plugin, 1, CHANNEL_EVENT_WRITE_COMPLETE, completion, 0, 0, 0);
      return CHANNEL_RC_OK;
    };
  }
  ~StaticHost() {
    if (plugin) {
      complete();
      if (connected)
        init(plugin, this, CHANNEL_EVENT_DISCONNECTED, nullptr, 0);
      init(plugin, this, CHANNEL_EVENT_TERMINATED, nullptr, 0);
    }
  }
  void load(AudioStaticGate *gate = nullptr, bool use_provider = false) {
    const auto entry =
        use_provider
            ? freerdp_load_channel_addin_entry("rdpsnd", nullptr, nullptr, static_abi)
            : freerdp_channels_load_static_addin_entry("rdpsnd", nullptr, nullptr, static_abi);
    REQUIRE(entry);
    const auto callback = ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(entry);
    if (gate)
      REQUIRE(gate->install(&points, this, callback));
    else
      REQUIRE(callback(reinterpret_cast<PCHANNEL_ENTRY_POINTS_EX>(&points), this));
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
  void complete(UINT event = CHANNEL_EVENT_WRITE_COMPLETE) {
    while (!pending.empty()) {
      const auto value = pending.back();
      pending.pop_back();
      opened(plugin, 1, event, value, 0, 0, 0);
    }
  }
  void raw(::bridge::compat::span<const BYTE> bytes, UINT total, UINT flags = CHANNEL_FLAG_ONLY) {
    opened(plugin, 1, CHANNEL_EVENT_DATA_RECEIVED, const_cast<BYTE *>(bytes.data()),
           static_cast<UINT>(bytes.size()), total, flags);
  }
  bool ingest(::bridge::compat::span<const BYTE> bytes, std::size_t total, bool first, bool last) {
    const auto joined = assembler.push(bytes, total, first, last);
    if (joined.status == FragmentStatus::collecting)
      return true;
    if (joined.status == FragmentStatus::invalid || !validator.validate(joined.bytes))
      return false;
    const auto size = static_cast<UINT32>(joined.bytes.size());
    ++deliveries;
    opened(plugin, 1, CHANNEL_EVENT_DATA_RECEIVED, const_cast<BYTE *>(joined.bytes.data()), size,
           size, CHANNEL_FLAG_FIRST | CHANNEL_FLAG_LAST);
    return getChannelError(points.context) == CHANNEL_RC_OK;
  }
  void send(std::vector<BYTE> &bytes) {
    REQUIRE(bytes.size() <= 65536);
    const auto split = (std::min)(std::size_t{5}, bytes.size());
    REQUIRE(ingest(::bridge::compat::span(bytes).first(split), bytes.size(), true, false));
    REQUIRE(ingest(::bridge::compat::span(bytes).subspan(split), bytes.size(), false, true));
    REQUIRE(getChannelError(points.context) == CHANNEL_RC_OK);
  }
};
void emit_pcm(StaticHost &host, UINT32 timestamp, BYTE block, const std::array<BYTE, 4> &sample,
              bool legacy = false, std::size_t frames = 960) {
  std::vector<BYTE> pcm;
  for (std::size_t frame = 0; frame < frames; ++frame)
    pcm.insert(pcm.end(), sample.begin(), sample.end());
  std::vector<BYTE> packet{static_cast<BYTE>(legacy ? SNDC_WAVE : SNDC_WAVE2), 0};
  word(packet, static_cast<unsigned>(pcm.size() + (legacy ? 8 : 12)));
  word(packet, timestamp & 65535);
  word(packet, 0);
  packet.insert(packet.end(), {block, 0, 0, 0});
  if (legacy) {
    packet.insert(packet.end(), sample.begin(), sample.end());
    host.raw(packet, static_cast<UINT>(packet.size()));
    std::fill_n(pcm.begin(), 4, BYTE{0});
    host.raw(pcm, static_cast<UINT>(pcm.size()));
  } else {
    dword(packet, timestamp);
    packet.insert(packet.end(), pcm.begin(), pcm.end());
    host.raw(packet, static_cast<UINT>(packet.size()));
  }
}
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
    REQUIRE(::bridge::compat::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(device)(nullptr) ==
            ERROR_INVALID_PARAMETER);
  }
  for (const auto flags :
       {DWORD{0}, DWORD{FREERDP_ADDIN_CHANNEL_STATIC}, DWORD{FREERDP_ADDIN_CHANNEL_DEVICE}}) {
    const auto device = current("rdpsnd", "browser", nullptr, flags);
    REQUIRE(device);
    REQUIRE(::bridge::compat::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(device)(nullptr) == ERROR_INVALID_STATE);
  }
  const auto wrong = current("rdpsnd", "browser", "wrong", static_abi);
  REQUIRE(wrong);
  REQUIRE(::bridge::compat::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(wrong)(nullptr) == ERROR_INVALID_STATE);
  UINT foreign = CHANNEL_RC_OK;
  std::thread thread([&] {
    const auto device = current("rdpsnd", "browser", nullptr, static_abi);
    foreign = ::bridge::compat::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(device)(nullptr);
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
TEST_CASE("Guarded pinned RDPSND confirms XRDP-style padded Training then delivers legacy PCM") {
  Fixture fixture;
  GateScope scope(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  const auto before = host.writes.size();
  std::vector<BYTE> training(1028, 0xa7);
  training[0] = SNDC_TRAINING;
  training[2] = 0;
  training[3] = 4;
  training[4] = 0x34;
  training[5] = 0x12;
  training[6] = 0;
  training[7] = 4;
  host.raw(training, static_cast<UINT>(training.size()));
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(host.writes.size() == before + 1);
  const std::vector<BYTE> expected{SNDC_TRAINING, 0, 4, 0, 0x34, 0x12, 0, 4};
  REQUIRE(host.writes.back() == expected);
  REQUIRE(scope.gate.stats()->server_formats == 1);
  REQUIRE(scope.gate.stats()->client_formats == 1);
  REQUIRE(scope.gate.stats()->training == 1);
  REQUIRE(scope.gate.stats()->writes == host.writes.size());
  REQUIRE(scope.gate.stats()->write_failures == 0);
  emit_pcm(host, 100, 1, {0, 128, 255, 127}, true);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.stats()->queue.accepted_frames == 960);
  REQUIRE(scope.gate.stats()->waves == 1);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
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
  REQUIRE(::bridge::compat::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(entry)(&points) == ERROR_INVALID_PARAMETER);
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
  REQUIRE(::bridge::compat::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(entry)(&points) == ERROR_INVALID_STATE);
  REQUIRE(::bridge::compat::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(entry)(&points) == ERROR_INVALID_STATE);
  REQUIRE(fixture.sink.device().rdpsnd == nullptr);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Actual RDPSND fake-SVC ingress rejects peer limits before upstream callback") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  StaticHost host(fixture.context.get());
  host.load();
  host.connect();
  SECTION("advertised giant record") {
    const std::array<BYTE, 4> tiny{1, 0, 0, 0};
    REQUIRE_FALSE(host.ingest(tiny, 0xffffffffU, true, false));
    REQUIRE(host.assembler.failed());
  }
  SECTION("advertised giant format count") {
    std::vector<BYTE> malicious(24);
    malicious[0] = SNDC_FORMATS;
    malicious[2] = 20;
    malicious[18] = malicious[19] = 255;
    REQUIRE_FALSE(host.ingest(malicious, malicious.size(), true, true));
    REQUIRE(host.validator.failed());
  }
  REQUIRE(host.deliveries == 0);
  REQUIRE(host.writes.empty());
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.stats()->queue.accepted_frames == 0);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Actual RDPSND fake-SVC ingress validates and dispatches legacy Wave pair") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  StaticHost host(fixture.context.get());
  host.load();
  host.connect();
  auto configuration = formats();
  host.send(configuration);
  std::vector<BYTE> info{SNDC_WAVE, 0, 16, 0, 100, 0, 0, 0, 1, 0, 0, 0, 0, 128, 255, 127};
  std::vector<BYTE> raw{0, 0, 0, 0, 1, 0, 254, 255};
  host.send(info);
  host.send(raw);
  std::vector<BYTE> output(8);
  REQUIRE(fixture.sink.read(output).frames == 2);
  REQUIRE(output == std::vector<BYTE>{0, 128, 255, 127, 1, 0, 254, 255});
  REQUIRE(host.deliveries == 3);
  REQUIRE(host.writes.size() == 4);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Public static audio gate bounds actual RDPSND ingress and handles stream Close") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  AudioStaticGate gate(*fixture.context, fixture.sink);
  StaticHost host(fixture.context.get());
  host.load(&gate);
  host.connect();
  auto configuration = formats();
  host.raw(::bridge::compat::span(configuration).first(5), static_cast<UINT>(configuration.size()),
           CHANNEL_FLAG_FIRST);
  REQUIRE(host.writes.empty());
  host.raw(::bridge::compat::span(configuration).subspan(5), static_cast<UINT>(configuration.size()),
           CHANNEL_FLAG_LAST);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(host.writes.size() == 2);
  const std::vector<BYTE> wave{SNDC_WAVE2, 0, 20, 0, 100, 0,   0,   0,   1, 0, 0,   0,
                               100,        0, 0,  0, 0,   128, 255, 127, 1, 0, 254, 255};
  host.raw(wave, static_cast<UINT>(wave.size()));
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 2);
  const std::array<BYTE, 4> close{SNDC_CLOSE, 0, 0, 0};
  REQUIRE(fixture.sink.stats()->availability == SourceAvailability::ready);
  host.raw(close, 4);
  REQUIRE(fixture.sink.stats()->availability == SourceAvailability::closed);
  REQUIRE(fixture.sink.ready()); // Pinned Close leaves the device open; source state does not.
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 0);
  REQUIRE(fixture.sink.stats()->queue.reset_discarded_frames == 2);
  // Pinned rdpsnd_detect_overrun rounds this tiny Wave2 to 0 ms. Its unsigned
  // remaining-duration calculation may drop a replay 1..10 ms after first Play.
  // Let its public clock leave that window; no production dispatch delay is added.
  std::this_thread::sleep_for(std::chrono::milliseconds(12));
  host.raw(wave, static_cast<UINT>(wave.size()));
  REQUIRE(fixture.sink.stats()->availability == SourceAvailability::ready);
  std::vector<BYTE> output(8);
  const auto result = fixture.sink.read(output);
  REQUIRE(result.frames == 2);
  REQUIRE(result.discontinuity);
  REQUIRE(output == std::vector<BYTE>{0, 128, 255, 127, 1, 0, 254, 255});
  REQUIRE(gate.retire() == CHANNEL_RC_OK);
  REQUIRE(gate.retired());
  REQUIRE(fixture.sink.retired());
  REQUIRE(fixture.sink.stats()->availability == SourceAvailability::closed);
  REQUIRE(host.closes == 1);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Public static audio gate rejects limits and flags before actual RDPSND dispatch") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  AudioStaticGate gate(*fixture.context, fixture.sink);
  StaticHost host(fixture.context.get());
  host.load(&gate);
  host.connect();
  const std::array<BYTE, 4> tiny{1, 0, 0, 0};
  SECTION("record size") { host.raw(tiny, 0xffffffffU, CHANNEL_FLAG_FIRST); }
  SECTION("format count") {
    std::vector<BYTE> malicious(24);
    malicious[0] = SNDC_FORMATS;
    malicious[2] = 20;
    malicious[18] = malicious[19] = 255;
    host.raw(malicious, 24);
  }
  SECTION("unsupported flags") {
    host.raw(tiny, 4, CHANNEL_FLAG_ONLY | CHANNEL_FLAG_SHADOW_PERSISTENT);
  }
  SECTION("contradictory suspend") { host.raw({}, 0, CHANNEL_FLAG_SUSPEND | CHANNEL_FLAG_RESUME); }
  REQUIRE(getChannelError(fixture.context.get()) == ERROR_INVALID_DATA);
  auto configuration = formats();
  REQUIRE(fixture.sink.stats()->availability == SourceAvailability::failed);
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(host.writes.empty());
  REQUIRE(fixture.sink.stats()->queue.accepted_frames == 0);
  REQUIRE(gate.retire() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Public static audio gate drains bounded write completions before retirement") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  AudioStaticGate gate(*fixture.context, fixture.sink);
  StaticHost host(fixture.context.get());
  host.load(&gate);
  host.connect();
  host.defer_writes = true;
  auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(host.pending.size() == 2);
  REQUIRE(gate.retire() == ERROR_IO_PENDING);
  REQUIRE_FALSE(gate.retired());
  REQUIRE(host.closes == 1);
  host.complete();
  REQUIRE(host.pending.empty());
  REQUIRE(gate.retire() == CHANNEL_RC_OK);
  REQUIRE(gate.retired());
  REQUIRE(host.closes == 1);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE(
    "Public static audio gate resets idle suspend/resume and rejects a split Wave transition") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  AudioStaticGate gate(*fixture.context, fixture.sink);
  StaticHost host(fixture.context.get());
  host.load(&gate);
  host.connect();
  auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  host.raw({}, 0, CHANNEL_FLAG_SUSPEND);
  REQUIRE(fixture.sink.stats()->availability == SourceAvailability::suspended);
  host.raw({}, 0, CHANNEL_FLAG_RESUME);
  REQUIRE(fixture.sink.stats()->availability == SourceAvailability::waiting);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  const std::array<BYTE, 16> info{SNDC_WAVE, 0, 16, 0, 100, 0, 0, 0, 1, 0, 0, 0, 0, 128, 255, 127};
  host.raw(info, 16);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  host.raw({}, 0, CHANNEL_FLAG_SUSPEND);
  REQUIRE(getChannelError(fixture.context.get()) == ERROR_INVALID_DATA);
  REQUIRE(fixture.sink.stats()->availability == SourceAvailability::failed);
  REQUIRE(gate.retire() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE(
    "Public static audio gate bounds pending confirmations without freeing host-owned streams") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  AudioStaticGate gate(*fixture.context, fixture.sink);
  StaticHost host(fixture.context.get());
  host.load(&gate);
  host.connect();
  host.defer_writes = true;
  const std::array<BYTE, 8> training{SNDC_TRAINING, 0, 4, 0, 1, 0, 4, 0};
  for (unsigned i = 0; i < 64; ++i)
    host.raw(training, 8);
  REQUIRE(host.pending.size() == 64);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  host.raw(training, 8);
  REQUIRE(host.pending.size() == 64);
  REQUIRE(host.writes.size() == 64);
  REQUIRE(getChannelError(fixture.context.get()) == ERROR_NOT_ENOUGH_MEMORY);
  REQUIRE(gate.retire() == ERROR_IO_PENDING);
  host.complete();
  REQUIRE(gate.retire() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Public static audio gate refuses unknown completions without dereferencing them") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  AudioStaticGate gate(*fixture.context, fixture.sink);
  StaticHost host(fixture.context.get());
  host.load(&gate);
  host.connect();
  unsigned token = 42;
  host.opened(host.plugin, 1, CHANNEL_EVENT_WRITE_COMPLETE, &token, 0, 0, 0);
  REQUIRE(token == 42);
  REQUIRE(getChannelError(fixture.context.get()) == ERROR_INVALID_DATA);
  REQUIRE(gate.retire() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Public static audio gate refuses reentrant data and retirement during channel writes") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  AudioStaticGate gate(*fixture.context, fixture.sink);
  StaticHost host(fixture.context.get());
  host.load(&gate);
  host.connect();
  SECTION("retirement") {
    host.nested_retire = &gate;
    auto configuration = formats();
    host.raw(configuration, static_cast<UINT>(configuration.size()));
    REQUIRE(host.nested_result == ERROR_INVALID_STATE);
    REQUIRE_FALSE(gate.retired());
    REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
    REQUIRE(host.writes.size() == 2);
  }
  SECTION("data") {
    host.nested_data = true;
    auto configuration = formats();
    host.raw(configuration, static_cast<UINT>(configuration.size()));
    REQUIRE(getChannelError(fixture.context.get()) != CHANNEL_RC_OK);
    REQUIRE(host.writes.size() == 1);
  }
  REQUIRE(gate.retire() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE(
    "Public static audio gate final host Terminated is safe after owner retirement and join") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  AudioStaticGate gate(*fixture.context, fixture.sink);
  StaticHost host(fixture.context.get());
  host.load(&gate);
  host.connect();
  REQUIRE(gate.retire() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  std::thread foreign([&] { host.init(host.plugin, &host, CHANNEL_EVENT_TERMINATED, nullptr, 0); });
  foreign.join();
  REQUIRE(gate.retired());
  REQUIRE(fixture.sink.retired());
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
}

TEST_CASE("RDPSND full public loader selects guarded static PCM browser backend") {
  Fixture fixture;
  const auto previous = freerdp_get_current_addin_provider();
  GateScope scope(fixture);
  const auto active = freerdp_get_current_addin_provider();
  const auto cached = active("rdpsnd", nullptr, nullptr, static_abi);
  REQUIRE(cached);
  StaticHost host(fixture.context.get());
  std::memcpy(host.selection, "sys:fake", sizeof("sys:fake"));
  host.load(nullptr, true);
  host.connect();
  REQUIRE(fixture.sink.device().rdpsnd);
  REQUIRE(freerdp_rdpsnd_get_context(fixture.sink.device().rdpsnd) == fixture.context.get());
  REQUIRE_FALSE(::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(cached)(nullptr, nullptr));
  auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  const std::vector<BYTE> wave{SNDC_WAVE2, 0, 20, 0, 100, 0,   0,   0,   1, 0, 0,   0,
                               100,        0, 0,  0, 0,   128, 255, 127, 1, 0, 254, 255};
  host.raw(wave, static_cast<UINT>(wave.size()));
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  std::vector<BYTE> output(8);
  REQUIRE(fixture.sink.read(output).frames == 2);
  REQUIRE(output == std::vector<BYTE>{0, 128, 255, 127, 1, 0, 254, 255});
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(scope.gate.retired());
  REQUIRE(fixture.sink.retired());
  REQUIRE(host.closes == 1);
  REQUIRE(freerdp_get_current_addin_provider() == previous);
}

TEST_CASE("Guarded RDPSND loader refuses unprotected dynamic and legacy channel ABIs") {
  Fixture fixture;
  GateScope scope(fixture);
  const auto loader = freerdp_get_current_addin_provider();
  const auto dynamic = loader("rdpsnd", nullptr, nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC);
  REQUIRE(dynamic);
  REQUIRE(::bridge::compat::bit_cast<PDVC_PLUGIN_ENTRY>(dynamic)(nullptr) == ERROR_NOT_SUPPORTED);
  const auto device = loader("rdpsnd", "browser", nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC);
  REQUIRE(device);
  REQUIRE(::bridge::compat::bit_cast<PFREERDP_RDPSND_DEVICE_ENTRY>(device)(nullptr) == ERROR_INVALID_STATE);
  const auto legacy = loader("rdpsnd", nullptr, nullptr, FREERDP_ADDIN_CHANNEL_STATIC);
  REQUIRE(legacy);
  REQUIRE_FALSE(legacy(nullptr));
  const auto wrong = loader("rdpsnd", nullptr, "wrong", static_abi);
  REQUIRE(wrong);
  REQUIRE_FALSE(::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(wrong)(nullptr, nullptr));
  BOOL foreign = TRUE;
  std::thread thread([&] {
    const auto entry = loader("rdpsnd", nullptr, nullptr, static_abi);
    foreign = ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(entry)(nullptr, nullptr);
  });
  thread.join();
  REQUIRE_FALSE(foreign);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Guarded RDPSND provider retains its scope until host write completions drain") {
  Fixture fixture;
  const auto previous = freerdp_get_current_addin_provider();
  GateScope scope(fixture);
  const auto active = freerdp_get_current_addin_provider();
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  host.defer_writes = true;
  auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(host.pending.size() == 2);
  REQUIRE(fixture.provider.close() == ERROR_IO_PENDING);
  REQUIRE_FALSE(scope.gate.retired());
  REQUIRE(freerdp_get_current_addin_provider() == active);
  host.complete();
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(scope.gate.retired());
  REQUIRE(freerdp_get_current_addin_provider() == previous);
}

TEST_CASE("Guarded RDPSND provider requires matching context and sink ownership") {
  Fixture fixture, foreign;
  AudioStaticGate wrong(*foreign.context, foreign.sink);
  const auto previous = freerdp_get_current_addin_provider();
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.sink, &wrong) == ERROR_INVALID_PARAMETER);
  REQUIRE(freerdp_get_current_addin_provider() == previous);
}

TEST_CASE("Guarded RDPSND negotiates only supported PCM and uses negotiated client indices") {
  Fixture fixture;
  GateScope scope(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  auto configuration = formats();
  auto unsupported = std::vector<BYTE>(configuration.begin() + 24, configuration.end());
  unsupported[14] = 24;
  unsupported[12] = 6;
  unsupported[8] = 0;
  unsupported[9] = 101;
  unsupported[10] = 4;
  configuration.insert(configuration.begin() + 24, unsupported.begin(), unsupported.end());
  configuration[2] = 56;
  configuration[18] = 2;
  const auto original = configuration;
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(configuration == original);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(host.writes.size() == 2);
  REQUIRE(host.writes[0].size() == 42);
  REQUIRE(host.writes[0][18] == 1);
  REQUIRE(host.writes[0][38] == 16);
  std::vector<BYTE> wave{SNDC_WAVE2, 0, 20, 0, 100, 0,   0,   0,   1, 0, 0,   0,
                         100,        0, 0,  0, 0,   128, 255, 127, 1, 0, 254, 255};
  SECTION("selected client index") {
    host.raw(wave, static_cast<UINT>(wave.size()));
    REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
    std::vector<BYTE> output(8);
    REQUIRE(fixture.sink.read(output).frames == 2);
    REQUIRE(output == std::vector<BYTE>{0, 128, 255, 127, 1, 0, 254, 255});
  }
  SECTION("rejected index") {
    wave[6] = 1;
    host.raw(wave, static_cast<UINT>(wave.size()));
    REQUIRE(getChannelError(fixture.context.get()) == ERROR_INVALID_DATA);
    REQUIRE(host.writes.size() == 2);
    REQUIRE(fixture.sink.stats()->queue.accepted_frames == 0);
  }
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Guarded RDPSND no-common-PCM list never opens or decodes an unsupported sink format") {
  Fixture fixture;
  GateScope scope(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  auto configuration = formats();
  configuration[38] = 24;
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(host.writes.size() == 2);
  REQUIRE(host.writes[0].size() == 24);
  REQUIRE(host.writes[0][18] == 0);
  REQUIRE(fixture.sink.stats()->availability == SourceAvailability::unavailable);
  REQUIRE(fixture.sink.stats()->queue.accepted_frames == 0);
  std::vector<BYTE> output(4, 77);
  REQUIRE(fixture.sink.read(output).status == QueueStatus::invalid);
  REQUIRE(output == std::vector<BYTE>(4, 77));
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Guarded RDPSND volume PDU applies perceptual gains through the actual channel") {
  Fixture fixture;
  GateScope scope(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  UINT32 value = 0xffff8000U;
  std::vector<BYTE> expected{244, 251, 255, 127, 12, 4, 0, 128};
  SECTION("independent mute") {
    value = 0x0000ffffU;
    expected = {0, 128, 0, 0, 255, 127, 0, 0};
  }
  SECTION("perceptual attenuation") {}
  std::vector<BYTE> volume{SNDC_SETVOLUME, 0, 4, 0};
  dword(volume, value);
  host.raw(volume, 8);
  const std::vector<BYTE> wave{SNDC_WAVE2, 0, 20, 0, 100, 0,   0,   0,   1,   0,   0, 0,
                               100,        0, 0,  0, 0,   128, 255, 127, 255, 127, 0, 128};
  host.raw(wave, static_cast<UINT>(wave.size()));
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  auto &device = fixture.sink.device();
  REQUIRE(device.GetVolume(&device) == value);
  std::vector<BYTE> output(8);
  REQUIRE(fixture.sink.read(output).frames == 2);
  REQUIRE(output == expected);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Guarded RDPSND retains ownership across bounded close failure retries") {
  Fixture fixture;
  const auto previous = freerdp_get_current_addin_provider();
  GateScope scope(fixture);
  const auto active = freerdp_get_current_addin_provider();
  StaticHost host(fixture.context.get());
  struct ResetFault {
    StaticHost &host;
    ~ResetFault() { host.close_failures = 0; }
  } reset{host};
  host.load(nullptr, true);
  host.connect();
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  const std::vector<BYTE> wave{SNDC_WAVE2, 0, 20, 0, 100, 0,   0,   0,   1, 0, 0,   0,
                               100,        0, 0,  0, 0,   128, 255, 127, 1, 0, 254, 255};
  host.raw(wave, static_cast<UINT>(wave.size()));
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 2);
  host.close_failures = 3;
  UINT expected = ERROR_ACCESS_DENIED;
  SECTION("host status refusal") {}
  SECTION("host exception") {
    host.close_throws = true;
    expected = ERROR_INTERNAL_ERROR;
  }
  for (unsigned attempt = 1; attempt <= 3; ++attempt) {
    REQUIRE(fixture.provider.close() == expected);
    REQUIRE(host.closes == attempt);
    REQUIRE_FALSE(scope.gate.retired());
    REQUIRE_FALSE(fixture.sink.retired());
    REQUIRE(freerdp_get_current_addin_provider() == active);
    REQUIRE(getChannelError(fixture.context.get()) == expected);
    // Duplicate host events cannot replay the delegate's partial cleanup.
    host.init(host.plugin, &host, CHANNEL_EVENT_DISCONNECTED, nullptr, 0);
    REQUIRE(host.closes == attempt);
  }
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 0);
  REQUIRE(fixture.sink.stats()->queue.reset_discarded_frames == 2);
  std::vector<BYTE> output(4, 77);
  REQUIRE(fixture.sink.read(output).status == QueueStatus::invalid);
  REQUIRE(output == std::vector<BYTE>(4, 77));
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.closes == 4);
  REQUIRE(scope.gate.retired());
  REQUIRE(fixture.sink.retired());
  REQUIRE(freerdp_get_current_addin_provider() == previous);
  REQUIRE(getChannelError(fixture.context.get()) == expected);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.closes == 4);
}

TEST_CASE("Guarded RDPSND drains host completions before retrying a failed close") {
  Fixture fixture;
  GateScope scope(fixture);
  const auto active = freerdp_get_current_addin_provider();
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  host.defer_writes = true;
  host.close_failures = 1;
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(host.pending.size() == 2);
  REQUIRE(fixture.provider.close() == ERROR_IO_PENDING);
  REQUIRE(host.closes == 1);
  REQUIRE(getChannelError(fixture.context.get()) == ERROR_ACCESS_DENIED);
  REQUIRE(fixture.provider.close() == ERROR_IO_PENDING);
  REQUIRE(host.closes == 1);
  REQUIRE(freerdp_get_current_addin_provider() == active);
  REQUIRE_FALSE(fixture.sink.retired());
  host.complete();
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.closes == 2);
  REQUIRE(scope.gate.retired());
  REQUIRE(fixture.sink.retired());
}

TEST_CASE("Guarded RDPSND owner finishes a host-initiated failed disconnect") {
  Fixture fixture;
  GateScope scope(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  host.close_failures = 1;
  host.init(host.plugin, &host, CHANNEL_EVENT_DISCONNECTED, nullptr, 0);
  REQUIRE(host.closes == 1);
  REQUIRE(getChannelError(fixture.context.get()) == ERROR_ACCESS_DENIED);
  REQUIRE_FALSE(fixture.sink.retired());
  UINT foreign = CHANNEL_RC_OK;
  std::thread thread([&] { foreign = fixture.provider.close(); });
  thread.join();
  REQUIRE(foreign == ERROR_INVALID_STATE);
  REQUIRE(host.closes == 1);
  REQUIRE_FALSE(scope.gate.retired());
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.closes == 2);
  REQUIRE(scope.gate.retired());
  REQUIRE(fixture.sink.retired());
}

TEST_CASE("Guarded RDPSND resets stale PCM on packet gaps and preserves counter wraps") {
  Fixture fixture;
  GateScope scope(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  UINT32 first_stamp = 100, second_stamp = 120;
  BYTE first_block = 254, second_block = 255;
  bool reset = false, legacy_first = false, legacy_second = false;
  SECTION("continuous") {}
  SECTION("source forward gap") {
    second_stamp = 241;
    reset = true;
  }
  SECTION("source backward epoch") {
    second_stamp = 99;
    reset = true;
  }
  SECTION("lost block") {
    second_block = 0;
    reset = true;
  }
  SECTION("duplicate block") {
    second_block = first_block;
    reset = true;
  }
  SECTION("source 32-bit and block wrap") {
    first_stamp = 0xfffffff0U;
    second_stamp = 4;
    first_block = 255;
    second_block = 0;
  }
  SECTION("legacy 16-bit and block wrap") {
    first_stamp = 65530;
    second_stamp = 14;
    first_block = 255;
    second_block = 0;
    legacy_first = legacy_second = true;
  }
  SECTION("clock type switch") {
    legacy_second = true;
    reset = true;
  }
  const std::array<BYTE, 4> old_sample{1, 0, 254, 255}, new_sample{0, 128, 255, 127};
  emit_pcm(host, first_stamp, first_block, old_sample, legacy_first);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 960);
  std::array<BYTE, 4> consumed{};
  const auto initial = fixture.sink.read(consumed);
  REQUIRE(initial.frames == 1);
  REQUIRE(initial.discontinuity);
  REQUIRE(consumed == old_sample);
  emit_pcm(host, second_stamp, second_block, new_sample, legacy_second);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  const auto frames = reset ? 960U : 1919U;
  REQUIRE(fixture.sink.stats()->queue.queued_frames == frames);
  REQUIRE(fixture.sink.stats()->queue.reset_discarded_frames == (reset ? 959U : 0U));
  std::vector<BYTE> output(frames * 4), expected;
  if (!reset)
    for (unsigned frame = 0; frame < 959; ++frame)
      expected.insert(expected.end(), old_sample.begin(), old_sample.end());
  for (unsigned frame = 0; frame < 960; ++frame)
    expected.insert(expected.end(), new_sample.begin(), new_sample.end());
  const auto read = fixture.sink.read(output);
  REQUIRE(read.frames == frames);
  REQUIRE(read.discontinuity == reset);
  REQUIRE(output == expected);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Guarded RDPSND validates PCM packet alignment and duration before device Open") {
  Fixture fixture;
  GateScope scope(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  SECTION("unaligned Wave2") {
    const std::vector<BYTE> packet{SNDC_WAVE2, 0, 19, 0, 100, 0, 0, 0, 1, 0, 0, 0,
                                   100,        0, 0,  0, 1,   2, 3, 4, 5, 6, 7};
    host.raw(packet, static_cast<UINT>(packet.size()));
  }
  SECTION("unaligned legacy WaveInfo") {
    const std::array<BYTE, 16> info{SNDC_WAVE, 0, 15, 0, 100, 0, 0, 0, 1, 0, 0, 0, 1, 2, 3, 4};
    host.raw(info, 16);
  }
  REQUIRE(getChannelError(fixture.context.get()) == ERROR_INVALID_DATA);
  REQUIRE(host.writes.size() == 2);
  REQUIRE(fixture.sink.stats()->queue.accepted_frames == 0);
  REQUIRE(fixture.sink.stats()->rejected_packets == 0);
  std::vector<BYTE> output(4, 77);
  REQUIRE(fixture.sink.read(output).status == QueueStatus::invalid);
  REQUIRE(output == std::vector<BYTE>(4, 77));
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Guarded RDPSND normalizes XRDP-size legacy PCM with bounded newest-data storage") {
  Fixture fixture;
  GateScope scope(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  auto configuration = formats();
  configuration[28] = 0x44;
  configuration[29] = 0xac; // 44100
  configuration[32] = 0x10;
  configuration[33] = 0xb1;
  configuration[34] = 2; // 176400 bytes/sec
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  emit_pcm(host, 100, 1, {255, 255, 255, 255}, true, 8192);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.stats()->queue.accepted_frames == 8916);
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 5760);
  REQUIRE(fixture.sink.stats()->queue.playback_skipped_frames == 3156);
  REQUIRE(fixture.sink.stats()->chunked_packets == 1);
  REQUIRE(fixture.sink.stats()->availability == SourceAvailability::ready);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Guarded RDPSND refuses replacement format tables before upstream state mutation") {
  Fixture fixture;
  GateScope scope(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  bool played = false;
  SECTION("changed protocol version before Open") { configuration[21] ^= 1; }
  SECTION("changed table count before Open") {
    configuration.resize(24);
    configuration[2] = 20;
    configuration[18] = 0;
  }
  SECTION("changed table after Open") {
    emit_pcm(host, 100, 1, {0, 128, 255, 127});
    REQUIRE(fixture.sink.stats()->queue.queued_frames == 960);
    played = true;
    configuration[28] = 0x40;
    configuration[29] = 0x1f;
    configuration[32] = 0x00;
    configuration[33] = 0x7d;
    configuration[34] = 0;
  }
  const auto writes = host.writes.size();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(getChannelError(fixture.context.get()) == ERROR_NOT_SUPPORTED);
  REQUIRE(host.writes.size() == writes);
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 0);
  REQUIRE(fixture.sink.stats()->queue.reset_discarded_frames == (played ? 960U : 0U));
  const auto accepted = fixture.sink.stats()->queue.accepted_frames;
  emit_pcm(host, 120, 2, {1, 0, 1, 0});
  REQUIRE(host.writes.size() == writes);
  REQUIRE(fixture.sink.stats()->queue.accepted_frames == accepted);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Guarded RDPSND identical PCM reannouncement preserves stream and legacy playback") {
  Fixture fixture;
  GateScope scope(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  auto configuration = formats();
  bool played = false;
  SECTION("before Open") {}
  SECTION("after Open") { played = true; }
  SECTION("XRDP version five after Open") {
    configuration[21] = 5;
    played = true;
  }
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  if (played)
    emit_pcm(host, 100, 1, {0, 128, 255, 127}, true);
  const auto accepted = fixture.sink.stats()->queue.accepted_frames;
  const auto revision = fixture.sink.stats()->stream_revision;
  const auto writes = host.writes.size();
  configuration[1] = 0xa7; // Protocol padding is arbitrary.
  configuration[20] = 3;   // Last-confirmed block is not format identity.
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(host.writes.size() == writes + (configuration[21] >= 6 ? 2U : 1U));
  REQUIRE(host.writes[writes][0] == SNDC_FORMATS);
  REQUIRE(scope.gate.stats()->formats == 2);
  REQUIRE(scope.gate.stats()->closes == 0);
  REQUIRE(fixture.sink.stats()->queue.queued_frames == (played ? 960U : 0U));
  REQUIRE(fixture.sink.stats()->queue.reset_discarded_frames == 0);
  REQUIRE(fixture.sink.stats()->stream_revision == revision);
  REQUIRE(fixture.sink.stats()->availability ==
          (played ? SourceAvailability::ready : SourceAvailability::waiting));
  emit_pcm(host, 200, played ? 2 : 4, {1, 0, 1, 0}, true);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.stats()->queue.accepted_frames == accepted + 960);
  REQUIRE(scope.gate.stats()->clock.first == 1);
  REQUIRE(fixture.sink.stats()->availability == SourceAvailability::ready);
  std::vector<BYTE> output(3840);
  if (played) {
    const auto old = fixture.sink.read(output);
    REQUIRE(old.discontinuity);
    REQUIRE(old.frames == 960);
    for (std::size_t at = 0; at < output.size(); at += 4) {
      REQUIRE(output[at] == 0);
      REQUIRE(output[at + 1] == 128);
      REQUIRE(output[at + 2] == 255);
      REQUIRE(output[at + 3] == 127);
    }
  }
  const auto read = fixture.sink.read(output);
  REQUIRE(read.status == QueueStatus::accepted);
  REQUIRE(read.discontinuity == !played);
  for (std::size_t at = 0; at < output.size(); at += 2) {
    REQUIRE(output[at] == 1);
    REQUIRE(output[at + 1] == 0);
  }
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Guarded RDPSND switches source rate layout and width within its initial table") {
  Fixture fixture;
  GateScope scope(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  bool unsigned_pcm = false;
  SECTION("PCM16 mono 8 kHz") {}
  SECTION("PCM8 mono 8 kHz") { unsigned_pcm = true; }
  auto configuration = formats();
  configuration[2] = 56;
  configuration[18] = 2;
  word(configuration, WAVE_FORMAT_PCM);
  word(configuration, 1);
  dword(configuration, 8000);
  dword(configuration, unsigned_pcm ? 8000 : 16000);
  word(configuration, unsigned_pcm ? 1 : 2);
  word(configuration, unsigned_pcm ? 8 : 16);
  word(configuration, 0);
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(host.writes[0].size() == 60);
  REQUIRE(host.writes[0][18] == 2);
  emit_pcm(host, 100, 1, {0, 128, 255, 127});
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 960);
  std::vector<BYTE> packet{SNDC_WAVE2, 0};
  word(packet, unsigned_pcm ? 172 : 332);
  word(packet, 120);
  word(packet, 1);
  packet.insert(packet.end(), {2, 0, 0, 0});
  dword(packet, 120);
  for (unsigned sample = 0; sample < 160; ++sample) {
    packet.push_back(unsigned_pcm ? BYTE{255} : BYTE{1});
    if (!unsigned_pcm)
      packet.push_back(0);
  }
  host.raw(packet, static_cast<UINT>(packet.size()));
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 955);
  REQUIRE(fixture.sink.stats()->queue.reset_discarded_frames == 960);
  std::vector<BYTE> output(955 * 4), expected;
  const std::array<BYTE, 4> sample =
      unsigned_pcm ? std::array<BYTE, 4>{0, 127, 0, 127} : std::array<BYTE, 4>{1, 0, 1, 0};
  for (unsigned frame = 0; frame < 955; ++frame)
    expected.insert(expected.end(), sample.begin(), sample.end());
  const auto read = fixture.sink.read(output);
  REQUIRE(read.frames == 955);
  REQUIRE(read.discontinuity);
  REQUIRE(output == expected);
  REQUIRE(host.writes.size() == 6);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Audio nested over touch preserves cached RDPEI entry and pending teardown ownership") {
  Fixture fixture;
  const auto original = freerdp_get_current_addin_provider();
  TouchScope touch(*fixture.context);
  const auto touch_loader = freerdp_get_current_addin_provider();
  const auto cached_touch = freerdp_load_channel_addin_entry(RDPEI_CHANNEL_NAME, nullptr, nullptr,
                                                             FREERDP_ADDIN_CHANNEL_DYNAMIC);
  GateScope audio(fixture);
  const auto audio_loader = freerdp_get_current_addin_provider();
  DynamicHost dynamic(fixture.context.get());
  dynamic.enter(cached_touch);
  REQUIRE(dynamic.plugin->pInterface == touch.registration.client());
  REQUIRE(freerdp_load_channel_addin_entry(RDPEI_CHANNEL_NAME, nullptr, nullptr,
                                           FREERDP_ADDIN_CHANNEL_DYNAMIC) == cached_touch);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  host.defer_writes = true;
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  emit_pcm(host, 100, 1, {1, 0, 254, 255});
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 960);
  std::array<BYTE, 4> output{};
  REQUIRE(fixture.sink.read(output).frames == 1);
  REQUIRE(output == std::array<BYTE, 4>{1, 0, 254, 255});
  REQUIRE(touch.provider.close() == ERROR_INVALID_STATE);
  REQUIRE_FALSE(touch.registration.retired());
  REQUIRE_FALSE(fixture.sink.retired());
  REQUIRE(fixture.provider.close() == ERROR_IO_PENDING);
  REQUIRE_FALSE(touch.registration.retired());
  REQUIRE(freerdp_get_current_addin_provider() == audio_loader);
  host.complete();
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(freerdp_get_current_addin_provider() == touch_loader);
  REQUIRE(touch.provider.close() == CHANNEL_RC_OK);
  REQUIRE(touch.registration.retired());
  REQUIRE(freerdp_get_current_addin_provider() == original);
}

TEST_CASE("Touch nested over audio delegates static entry and backend before LIFO retirement") {
  Fixture fixture;
  const auto original = freerdp_get_current_addin_provider();
  GateScope audio(fixture);
  const auto audio_loader = freerdp_get_current_addin_provider();
  const auto cached_audio =
      freerdp_load_channel_addin_entry("rdpsnd", nullptr, nullptr, static_abi);
  TouchScope touch(*fixture.context);
  DynamicHost dynamic(fixture.context.get());
  dynamic.enter(freerdp_load_channel_addin_entry(RDPEI_CHANNEL_NAME, nullptr, nullptr,
                                                 FREERDP_ADDIN_CHANNEL_DYNAMIC));
  StaticHost host(fixture.context.get());
  REQUIRE(::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(cached_audio)(
      reinterpret_cast<PCHANNEL_ENTRY_POINTS_EX>(&host.points), &host));
  host.connect();
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  emit_pcm(host, 100, 1, {0, 128, 255, 127});
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 960);
  REQUIRE(fixture.provider.close() == ERROR_INVALID_STATE);
  REQUIRE_FALSE(fixture.sink.retired());
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 960);
  REQUIRE_FALSE(touch.registration.retired());
  REQUIRE(touch.provider.close() == CHANNEL_RC_OK);
  REQUIRE(freerdp_get_current_addin_provider() == audio_loader);
  std::array<BYTE, 4> output{};
  REQUIRE(fixture.sink.read(output).frames == 1);
  REQUIRE(output == std::array<BYTE, 4>{0, 128, 255, 127});
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.retired());
  REQUIRE(freerdp_get_current_addin_provider() == original);
}

TEST_CASE("Actual linked RDPSND produces paced PCM packets and reanchors on source discontinuity") {
  Fixture fixture;
  GateScope audio(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  const std::array<BYTE, 4> first_sample{0, 128, 255, 127}, second_sample{1, 0, 254, 255};
  emit_pcm(host, 100, 1, first_sample);
  const auto first = fixture.sink.packet(1000000);
  REQUIRE(first.status == PacketStatus::ready);
  REQUIRE(first.timestamp_us == 1000000);
  REQUIRE(first.frames == 960);
  REQUIRE(first.discontinuity);
  for (std::size_t at = 0; at < first.bytes.size(); at += 4)
    REQUIRE(std::equal(first_sample.begin(), first_sample.end(), first.bytes.begin() + at));
  REQUIRE(fixture.sink.packet(1019999).status == PacketStatus::idle);
  emit_pcm(host, 5000, 2, second_sample);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  const auto second = fixture.sink.packet(5000000);
  REQUIRE(second.status == PacketStatus::ready);
  REQUIRE(second.timestamp_us == 5000000);
  REQUIRE(second.frames == 960);
  REQUIRE(second.discontinuity);
  for (std::size_t at = 0; at < second.bytes.size(); at += 4)
    REQUIRE(std::equal(second_sample.begin(), second_sample.end(), second.bytes.begin() + at));
  REQUIRE(fixture.sink.stats()->packets.skipped_intervals == 0);
  REQUIRE(fixture.sink.stats()->packets.discontinuities == 2);
  REQUIRE(fixture.sink.stats()->packets.packets == 2);
  const std::array<BYTE, 4> close{SNDC_CLOSE, 0, 0, 0};
  host.raw(close, 4);
  REQUIRE(fixture.sink.packet(5020000).status == PacketStatus::idle);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("Actual RDPSND Close discards blocked publisher PCM before a fresh stream epoch") {
  Fixture fixture;
  GateScope audio(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  PcmPublisher publisher(fixture.sink, [] { return true; });
  std::vector<bridge::ipc::Packet> records;
  bool credit = false;
  const PcmPublisher::TrySend send = [&](auto kind, auto bytes) {
    if (kind == bridge::ipc::Kind::audio_pcm && !credit)
      return false;
    records.push_back({kind, 0, {bytes.begin(), bytes.end()}});
    return true;
  };
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  emit_pcm(host, 100, 1, {0, 128, 255, 127});
  REQUIRE(publisher.pump(1000000, send) == PublishStatus::blocked);
  REQUIRE(records.size() == 1);
  REQUIRE(publisher.stats()->pending);
  const std::array<BYTE, 4> close{SNDC_CLOSE, 0, 0, 0};
  host.raw(close, 4);
  credit = true;
  REQUIRE(publisher.pump(1020000, send) == PublishStatus::idle);
  REQUIRE(records.size() == 1);
  REQUIRE_FALSE(publisher.stats()->pending);
  REQUIRE(publisher.stats()->reset_discarded_packets == 1);
  emit_pcm(host, 120, 2, {1, 0, 254, 255});
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(publisher.pump(1040000, send) == PublishStatus::sent);
  REQUIRE(records.size() == 3);
  REQUIRE(bridge::ipc::audio::decode_config(records[1].payload).epoch == 2);
  const auto packet = bridge::ipc::audio::decode_packet(records[2].payload);
  REQUIRE(packet.epoch == 2);
  REQUIRE(packet.timestamp_us == 1040000);
  REQUIRE(packet.discontinuity);
  REQUIRE(packet.frames == 960);
  const std::array<BYTE, 4> sample{1, 0, 254, 255};
  for (std::size_t at = 0; at < packet.pcm.size(); at += 4)
    REQUIRE(std::equal(sample.begin(), sample.end(), packet.pcm.begin() + at));
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(publisher.pump(1060000, send) == PublishStatus::idle);
  REQUIRE(records.size() == 3);
}
TEST_CASE("Actual RDPSND Close clears accepted unsent consumer PCM before a new epoch") {
  Fixture fixture;
  GateScope audio(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  bridge::ipc::OutputQueue output;
  PcmPublisher publisher(fixture.sink, [&] {
    output.discard_audio();
    return true;
  });
  const PcmPublisher::TrySend send = [&](auto kind, auto bytes) {
    return output.push(kind, 0, bytes) == bridge::ipc::EnqueueStatus::accepted;
  };
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  emit_pcm(host, 100, 1, {0, 128, 255, 127});
  REQUIRE(publisher.pump(1000000, send) == PublishStatus::sent);
  REQUIRE(output.stats().records == 2);
  const std::array<BYTE, 4> close{SNDC_CLOSE, 0, 0, 0};
  host.raw(close, 4);
  REQUIRE(publisher.pump(1020000, send) == PublishStatus::idle);
  REQUIRE(output.stats().records == 0);
  REQUIRE(output.stats().discarded_audio == 1);
  emit_pcm(host, 120, 2, {1, 0, 254, 255});
  REQUIRE(publisher.pump(1040000, send) == PublishStatus::sent);
  REQUIRE(bridge::ipc::audio::decode_config(output.take()->payload).epoch == 2);
  auto packet = output.take();
  const auto pcm = bridge::ipc::audio::decode_packet(packet->payload);
  REQUIRE(pcm.discontinuity);
  REQUIRE(pcm.pcm[0] == 1);
  REQUIRE(pcm.pcm[2] == 254);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(publisher.pump(1060000, send) == PublishStatus::idle);
  REQUIRE(output.stats().records == 0);
}

TEST_CASE("Actual RDPSND source status orders suspend Close recovery and retired epochs") {
  Fixture fixture;
  GateScope audio(fixture);
  StaticHost host(fixture.context.get());
  host.load(nullptr, true);
  host.connect();
  bridge::ipc::OutputQueue output;
  PcmPublisher publisher(
      fixture.sink,
      [&] {
        output.discard_audio();
        return true;
      },
      0, 0);
  const PcmPublisher::TrySend send = [&](auto kind, auto bytes) {
    return output.push(kind, 0, bytes) == bridge::ipc::EnqueueStatus::accepted;
  };
  using A = bridge::ipc::audio::Availability;
  const auto take_state = [&](A availability, std::uint64_t revision, std::uint64_t epoch) {
    const auto packet = output.take();
    REQUIRE(packet);
    REQUIRE(packet->kind == bridge::ipc::Kind::audio_state);
    const auto state = bridge::ipc::audio::decode_state(packet->payload);
    REQUIRE(state.enabled);
    REQUIRE(state.availability == availability);
    REQUIRE(state.revision == revision);
    REQUIRE(state.epoch == epoch);
  };
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(publisher.pump(1000000, send) == PublishStatus::sent);
  take_state(A::waiting, 1, 1);
  emit_pcm(host, 100, 1, {0, 128, 255, 127});
  REQUIRE(publisher.pump(1000000, send) == PublishStatus::sent);
  take_state(A::ready, 2, 1);
  REQUIRE(output.stats().records == 2);
  host.raw({}, 0, CHANNEL_FLAG_SUSPEND);
  REQUIRE(publisher.pump(1001000, send) == PublishStatus::sent);
  take_state(A::suspended, 3, 2);
  REQUIRE_FALSE(output.take()); // Accepted old config/PCM were cleared before status.
  host.raw({}, 0, CHANNEL_FLAG_RESUME);
  REQUIRE(publisher.pump(1002000, send) == PublishStatus::sent);
  take_state(A::waiting, 4, 2);
  const std::array<BYTE, 4> close{SNDC_CLOSE, 0, 0, 0};
  host.raw(close, 4);
  REQUIRE(publisher.pump(1003000, send) == PublishStatus::sent);
  take_state(A::closed, 5, 2);
  REQUIRE_FALSE(output.take());
  emit_pcm(host, 120, 2, {1, 0, 254, 255});
  REQUIRE(publisher.pump(1020000, send) == PublishStatus::sent);
  take_state(A::ready, 6, 2);
  REQUIRE(bridge::ipc::audio::decode_config(output.take()->payload).epoch == 2);
  const auto record = output.take();
  const auto pcm = bridge::ipc::audio::decode_packet(record->payload);
  REQUIRE(pcm.discontinuity);
  REQUIRE(pcm.pcm[0] == 1);
  REQUIRE(pcm.pcm[2] == 254);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(publisher.pump(1021000, send) == PublishStatus::sent);
  take_state(A::closed, 7, 3);
  REQUIRE_FALSE(output.take());
}

TEST_CASE("Opus audio session selects one publisher and retires actual channel confirmations") {
  Fixture fixture;
  const auto previous = freerdp_get_current_addin_provider();
  bridge::ipc::OutputQueue output{bridge::ipc::OutputAudioCodec::opus};
  StaticHost *transport = nullptr;
  AudioSession owner(
      *fixture.context,
      [&](auto kind, auto bytes) {
        return output.push(kind, 0, bytes) == bridge::ipc::EnqueueStatus::accepted;
      },
      [&] {
        output.discard_audio();
        return true;
      },
      [&] {
        transport->complete(CHANNEL_EVENT_WRITE_CANCELLED);
        return false;
      },
      1000000, bridge::ipc::OutputAudioCodec::opus);
  StaticHost host(fixture.context.get());
  transport = &host;
  host.load(nullptr, true);
  host.connect();
  host.defer_writes = true;
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  emit_pcm(host, 100, 1, {0, 128, 255, 127});
  REQUIRE(owner.pump(1000) == PublishStatus::sent);
  REQUIRE(owner.stats()->codec == bridge::ipc::OutputAudioCodec::opus);
  REQUIRE(owner.stats()->opus_encoded_packets == 1);
  REQUIRE(owner.stats()->opus_cached_bytes == 0);
  const auto ready = output.take();
  const auto state = bridge::ipc::audio::opus::decode_state(ready->payload);
  REQUIRE(state.availability == bridge::ipc::audio::Availability::ready);
  REQUIRE_THROWS_AS(bridge::ipc::audio::decode_state(ready->payload), bridge::ipc::ProtocolError);
  const auto config_record = output.take();
  const auto config = bridge::ipc::audio::opus::decode_config(config_record->payload);
  const auto audio_record = output.take();
  const auto packet = bridge::ipc::audio::opus::decode_packet(audio_record->payload);
  REQUIRE(state.epoch == config.epoch);
  REQUIRE(packet.epoch == config.epoch);
  REQUIRE(packet.timestamp_us == 1000);
  REQUIRE(packet.discontinuity);
  REQUIRE(packet.frames + packet.silence_frames == 960);
  REQUIRE(opus_packet_get_nb_samples(packet.encoded.data(),
                                     static_cast<opus_int32>(packet.encoded.size()), 48000) == 960);
  REQUIRE(opus_packet_get_nb_channels(packet.encoded.data()) == 2);
  REQUIRE_FALSE(host.pending.empty());
  REQUIRE(owner.retire(2000) == RetireStatus::pending);
  REQUIRE(host.pending.empty());
  REQUIRE_FALSE(owner.stats()->resources_retired);
  const auto closed = output.take();
  REQUIRE(bridge::ipc::audio::opus::decode_state(closed->payload).availability ==
          bridge::ipc::audio::Availability::closed);
  REQUIRE_FALSE(output.take());
  REQUIRE(owner.retire(3000) == RetireStatus::done);
  REQUIRE(owner.stats()->resources_retired);
  REQUIRE(owner.stats()->publisher.sent_states == 2);
  REQUIRE(owner.stats()->opus_encoded_packets == 1);
  REQUIRE(owner.stats()->opus_cached_bytes == 0);
  REQUIRE(freerdp_get_current_addin_provider() == previous);
  REQUIRE(owner.retire(0) == RetireStatus::done);
  REQUIRE(owner.pump(4000) == PublishStatus::invalid);
}

TEST_CASE("Audio session rejects unknown codec before binding and keeps PCM SDK counters zero") {
  Fixture fixture;
  const auto previous = freerdp_get_current_addin_provider();
  REQUIRE_THROWS_AS(AudioSession(
                        *fixture.context, [](auto, auto) { return true; }, [] { return true; }, {},
                        1000000, static_cast<bridge::ipc::OutputAudioCodec>(2)),
                    std::invalid_argument);
  REQUIRE(freerdp_get_current_addin_provider() == previous);
  AudioSession owner(*fixture.context, [](auto, auto) { return true; }, [] { return true; });
  REQUIRE(owner.stats()->codec == bridge::ipc::OutputAudioCodec::pcm);
  REQUIRE(owner.stats()->opus_encoded_packets == 0);
  REQUIRE(owner.stats()->opus_cached_bytes == 0);
  REQUIRE(owner.retire(0) == RetireStatus::done);
}

TEST_CASE("Audio publication deadline is shared by PCM Opus and suspended by blocked output") {
  namespace ipc = bridge::ipc;
  for (const auto codec : {ipc::OutputAudioCodec::pcm, ipc::OutputAudioCodec::opus}) {
    Fixture fixture;
    AudioSession *active = nullptr;
    bool credit = true;
    unsigned reentrant_deadlines = 0;
    AudioSession owner(
        *fixture.context,
        [&](auto, auto) {
          if (active->publication_deadline())
            ++reentrant_deadlines;
          return credit;
        },
        [] { return true; }, {}, 1000000, codec);
    active = &owner;
    REQUIRE_FALSE(owner.publication_deadline());
    StaticHost host(fixture.context.get());
    host.load(nullptr, true);
    host.connect();
    const auto configuration = formats();
    host.raw(configuration, static_cast<UINT>(configuration.size()));
    emit_pcm(host, 100, 1, {0, 128, 255, 127});
    REQUIRE_FALSE(owner.publication_deadline());
    REQUIRE(owner.pump(1000) == PublishStatus::sent);
    REQUIRE(owner.publication_deadline() == 21000);
    REQUIRE(owner.publication_deadline() == 21000);
    REQUIRE(owner.stats()->publisher.captured_packets == 1);
    bool foreign_deadline = true;
    std::thread foreign([&] { foreign_deadline = owner.publication_deadline().has_value(); });
    foreign.join();
    REQUIRE_FALSE(foreign_deadline);
    credit = false;
    REQUIRE(owner.pump(21000) == PublishStatus::blocked);
    REQUIRE_FALSE(owner.publication_deadline());
    credit = true;
    REQUIRE(owner.pump(22000) == PublishStatus::sent);
    REQUIRE(owner.publication_deadline() == 41000);
    REQUIRE(owner.reset());
    REQUIRE_FALSE(owner.publication_deadline());
    REQUIRE(owner.pump(23000) == PublishStatus::sent);
    REQUIRE_FALSE(owner.publication_deadline());
    emit_pcm(host, 120, 2, {1, 0, 254, 255});
    REQUIRE(owner.pump(24000) == PublishStatus::sent);
    REQUIRE(owner.publication_deadline() == 44000);
    REQUIRE(reentrant_deadlines == 0);
    REQUIRE(owner.retire(25000) == RetireStatus::done);
    REQUIRE_FALSE(owner.publication_deadline());
  }
}

TEST_CASE("Audio session reset orders discard waiting and fresh PCM Opus prediction") {
  namespace ipc = bridge::ipc;
  for (const auto codec : {ipc::OutputAudioCodec::pcm, ipc::OutputAudioCodec::opus}) {
    Fixture fixture;
    auto output = std::make_unique<ipc::OutputQueue>(codec);
    bool packet_credit = true, discard_credit = true;
    AudioSession owner(
        *fixture.context,
        [&](auto kind, auto bytes) {
          if ((kind == ipc::Kind::audio_pcm || kind == ipc::Kind::audio_opus) && !packet_credit)
            return false;
          return output->push(kind, 0, bytes) == ipc::EnqueueStatus::accepted;
        },
        [&] {
          if (!discard_credit)
            return false;
          output->discard_audio();
          return true;
        },
        {}, 1000000, codec);
    StaticHost host(fixture.context.get());
    host.load(nullptr, true);
    host.connect();
    const auto configuration = formats();
    host.raw(configuration, static_cast<UINT>(configuration.size()));
    emit_pcm(host, 100, 1, {0, 128, 255, 127});
    REQUIRE(owner.pump(1000) == PublishStatus::sent);
    const auto first_state = output->take();
    const auto decode_state = [&](const auto &record) {
      REQUIRE(record);
      REQUIRE(record->kind == ipc::Kind::audio_state);
      return codec == ipc::OutputAudioCodec::opus ? ipc::audio::opus::decode_state(record->payload)
                                                  : ipc::audio::decode_state(record->payload);
    };
    REQUIRE(decode_state(first_state).epoch == 1);
    packet_credit = false;
    REQUIRE(owner.pump(21000) == PublishStatus::blocked);
    REQUIRE(owner.stats()->publisher.pending);
    REQUIRE(output->stats().records == 2);
    if (codec == ipc::OutputAudioCodec::opus) {
      REQUIRE(owner.stats()->opus_encoded_packets == 2);
      REQUIRE(owner.stats()->opus_cached_bytes > 0);
    }
    REQUIRE(owner.reset());
    REQUIRE(owner.stats()->source_resets == 1);
    REQUIRE_FALSE(owner.stats()->publisher.pending);
    REQUIRE(owner.stats()->opus_cached_bytes == 0);
    REQUIRE(output->stats().records == 2); // Consumer removal belongs to the pump barrier.
    discard_credit = false;
    packet_credit = true;
    REQUIRE(owner.pump(22000) == PublishStatus::blocked);
    REQUIRE(owner.stats()->publisher.reset_pending);
    REQUIRE(output->stats().records == 2);
    discard_credit = true;
    REQUIRE(owner.pump(23000) == PublishStatus::sent);
    const auto waiting = decode_state(output->take());
    REQUIRE(waiting.availability == ipc::audio::Availability::waiting);
    REQUIRE(waiting.epoch == 2);
    REQUIRE(waiting.revision == 2);
    REQUIRE_FALSE(output->take());
    REQUIRE(output->stats().discarded_audio == 1);
    REQUIRE(owner.pump(24000) == PublishStatus::idle);
    REQUIRE_FALSE(output->take()); // Reset packetizer waits for fresh Play, not silence.
    emit_pcm(host, 120, 2, {1, 0, 254, 255});
    REQUIRE(owner.pump(25000) == PublishStatus::sent);
    const auto ready = decode_state(output->take());
    REQUIRE(ready.availability == ipc::audio::Availability::ready);
    REQUIRE(ready.epoch == 2);
    REQUIRE(ready.revision == 3);
    const auto config_record = output->take(), packet_record = output->take();
    REQUIRE(config_record);
    REQUIRE(packet_record);
    REQUIRE(config_record->kind == ipc::Kind::audio_config);
    if (codec == ipc::OutputAudioCodec::opus) {
      REQUIRE(ipc::audio::opus::decode_config(config_record->payload).epoch == 2);
      REQUIRE(packet_record->kind == ipc::Kind::audio_opus);
      const auto packet = ipc::audio::opus::decode_packet(packet_record->payload);
      REQUIRE(packet.epoch == 2);
      REQUIRE(packet.timestamp_us == 25000);
      REQUIRE(packet.discontinuity);
      REQUIRE(packet.frames == 960);
      REQUIRE(packet.silence_frames == 0);
      std::vector<std::uint8_t> pcm(ipc::audio::pcm_bytes, 0);
      for (std::size_t offset = 0; offset < pcm.size(); offset += 4) {
        pcm[offset] = 1;
        pcm[offset + 2] = 254;
        pcm[offset + 3] = 255;
      }
      SoftwareOpusEncoder fresh;
      const auto unit = fresh.encode({pcm, 25000, true});
      REQUIRE(std::equal(unit.bytes.begin(), unit.bytes.end(), packet.encoded.begin(),
                         packet.encoded.end()));
      REQUIRE(owner.stats()->opus_encoded_packets == 3);
    } else {
      REQUIRE(ipc::audio::decode_config(config_record->payload).epoch == 2);
      REQUIRE(packet_record->kind == ipc::Kind::audio_pcm);
      const auto packet = ipc::audio::decode_packet(packet_record->payload);
      REQUIRE(packet.epoch == 2);
      REQUIRE(packet.timestamp_us == 25000);
      REQUIRE(packet.discontinuity);
      REQUIRE(packet.pcm[0] == 1);
      REQUIRE(packet.pcm[2] == 254);
      REQUIRE(owner.stats()->opus_encoded_packets == 0);
    }
    REQUIRE(owner.retire(26000) == RetireStatus::done);
    REQUIRE_FALSE(owner.reset());
    REQUIRE(owner.stats()->source_resets == 1);
  }
}

TEST_CASE("Audio reset control drives linked session only after published ready epoch") {
  namespace ipc = bridge::ipc;
  for (const auto codec : {ipc::OutputAudioCodec::pcm, ipc::OutputAudioCodec::opus}) {
    Fixture fixture;
    ResetControl control;
    auto output = std::make_unique<ipc::OutputQueue>(codec);
    bool state_credit = false;
    AudioSession owner(
        *fixture.context,
        [&](auto kind, auto bytes) {
          if (kind == ipc::Kind::audio_state && !state_credit)
            return false;
          if (output->push(kind, 0, bytes) != ipc::EnqueueStatus::accepted)
            return false;
          if (kind == ipc::Kind::audio_state)
            REQUIRE(control.observe(codec == ipc::OutputAudioCodec::opus
                                        ? ipc::audio::opus::decode_state(bytes)
                                        : ipc::audio::decode_state(bytes)));
          return true;
        },
        [&] {
          output->discard_audio();
          return true;
        },
        {}, 1000000, codec);
    StaticHost host(fixture.context.get());
    host.load(nullptr, true);
    host.connect();
    const auto configuration = formats();
    host.raw(configuration, static_cast<UINT>(configuration.size()));
    emit_pcm(host, 100, 1, {0, 128, 255, 127});
    REQUIRE(owner.pump(1000) == PublishStatus::blocked);
    REQUIRE(control.enqueue(1, 1, 1000, true) == ipc::audio::ResetResult::unavailable);
    REQUIRE(owner.stats()->source_resets == 0);
    state_credit = true;
    REQUIRE(owner.pump(2000) == PublishStatus::sent);
    REQUIRE_FALSE(control.enqueue(2, 1, 2000, true));
    REQUIRE(owner.stats()->source_resets == 0);
    REQUIRE(control.enqueue(3, 1, 2001, true) == ipc::audio::ResetResult::busy);
    const auto result = control.service(2002, true, [&] { return owner.reset(); });
    REQUIRE(result);
    REQUIRE(result->request_id == 2);
    REQUIRE(result->result == ipc::audio::ResetResult::scheduled);
    REQUIRE(owner.stats()->source_resets == 1);
    REQUIRE(control.enqueue(4, 1, 2003, true) == ipc::audio::ResetResult::busy);
    REQUIRE(owner.pump(3000) == PublishStatus::sent);
    REQUIRE(control.enqueue(5, 1, 3001, true) == ipc::audio::ResetResult::stale);
    REQUIRE(control.enqueue(6, 2, 3001, true) == ipc::audio::ResetResult::unavailable);
    // Waiting status reserves epoch 2; only new Play reactivates reset eligibility.
    while (output->take()) {
    }
    emit_pcm(host, 120, 2, {1, 0, 254, 255});
    REQUIRE(owner.pump(4000) == PublishStatus::sent);
    REQUIRE_FALSE(control.enqueue(7, 2, 4001, true));
    const auto cancelled = control.service(4002, false, [&] { return owner.reset(); });
    REQUIRE(cancelled);
    REQUIRE(cancelled->request_id == 7);
    REQUIRE(cancelled->result == ipc::audio::ResetResult::unavailable);
    REQUIRE(owner.stats()->source_resets == 1);
    REQUIRE(owner.retire(5000) == RetireStatus::done);
    REQUIRE(control.enqueue(8, 2, 5001, false) == ipc::audio::ResetResult::unavailable);
  }
}

TEST_CASE("Audio session reset refuses foreign reentrant and retiring ownership") {
  Fixture fixture;
  AudioSession *active = nullptr;
  bool send_credit = true;
  std::size_t refused_reentrant = 0;
  AudioSession owner(
      *fixture.context,
      [&](auto, auto) {
        if (!active->reset())
          ++refused_reentrant;
        return send_credit;
      },
      [] { return true; });
  active = &owner;
  REQUIRE(owner.reset()); // No Open/sample is required to discard an idle source.
  REQUIRE(owner.pump(1000) == PublishStatus::sent);
  REQUIRE(refused_reentrant == 1);
  REQUIRE(owner.stats()->source_resets == 1);
  bool foreign_reset = true;
  std::thread foreign([&] { foreign_reset = owner.reset(); });
  foreign.join();
  REQUIRE_FALSE(foreign_reset);
  REQUIRE(owner.stats()->source_resets == 1);
  send_credit = false;
  REQUIRE(owner.retire(2000) == RetireStatus::pending);
  REQUIRE_FALSE(owner.reset());
  REQUIRE(owner.stats()->source_resets == 1);
  send_credit = true;
  REQUIRE(owner.retire(3000) == RetireStatus::done);
  REQUIRE_FALSE(owner.reset());
  REQUIRE(owner.stats()->source_resets == 1);
}

TEST_CASE("Audio session reset refuses failed publication without source mutation") {
  for (const auto codec :
       {bridge::ipc::OutputAudioCodec::pcm, bridge::ipc::OutputAudioCodec::opus}) {
    Fixture fixture;
    AudioSession owner(
        *fixture.context, [](auto, auto) -> bool { throw std::runtime_error("fixture"); },
        [] { return true; }, {}, 1000000, codec);
    REQUIRE(owner.pump(1000) == PublishStatus::failed);
    REQUIRE_FALSE(owner.publication_deadline());
    const auto revision = owner.stats()->source.stream_revision;
    REQUIRE_FALSE(owner.reset());
    REQUIRE(owner.stats()->source.stream_revision == revision);
    REQUIRE(owner.stats()->source_resets == 0);
    REQUIRE(owner.stats()->publication_failed);
    REQUIRE(owner.retire(2000) == RetireStatus::failed);
    REQUIRE(owner.stats()->resources_retired);
  }
}

TEST_CASE("Audio session owner publishes Close while cancelled confirmations drain") {
  Fixture fixture;
  const auto previous = freerdp_get_current_addin_provider();
  bridge::ipc::OutputQueue output;
  StaticHost *transport = nullptr;
  AudioSession owner(
      *fixture.context,
      [&](auto kind, auto bytes) {
        return output.push(kind, 0, bytes) == bridge::ipc::EnqueueStatus::accepted;
      },
      [&] {
        output.discard_audio();
        return true;
      },
      [&] {
        transport->complete(CHANNEL_EVENT_WRITE_CANCELLED);
        return false; // Core closed-handle drain can cancel then report failure.
      });
  StaticHost host(fixture.context.get());
  transport = &host;
  host.load(nullptr, true);
  host.connect();
  host.defer_writes = true;
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  emit_pcm(host, 100, 1, {0, 128, 255, 127});
  REQUIRE(owner.pump(1000) == PublishStatus::sent);
  const auto ready = output.take();
  REQUIRE(bridge::ipc::audio::decode_state(ready->payload).availability ==
          bridge::ipc::audio::Availability::ready);
  REQUIRE(output.stats().records == 2);
  REQUIRE_FALSE(host.pending.empty());
  REQUIRE(owner.retire(2000) == RetireStatus::pending);
  REQUIRE(host.pending.empty());
  REQUIRE_FALSE(owner.stats()->resources_retired);
  REQUIRE(owner.stats()->drain_failures == 1);
  const auto closed = output.take();
  const auto state = bridge::ipc::audio::decode_state(closed->payload);
  REQUIRE(state.availability == bridge::ipc::audio::Availability::closed);
  REQUIRE(state.epoch == 2);
  REQUIRE(state.revision == 2);
  REQUIRE_FALSE(output.take());
  REQUIRE(output.stats().discarded_audio == 1);
  REQUIRE(owner.retire(3000) == RetireStatus::done);
  REQUIRE(owner.stats()->resources_retired);
  REQUIRE(owner.stats()->close_attempts == 2);
  REQUIRE(owner.stats()->drain_calls == 1);
  REQUIRE(freerdp_get_current_addin_provider() == previous);
  REQUIRE_FALSE(output.take()); // Device Free already marked closed during Disconnect.
  REQUIRE(owner.stats()->publisher.sent_states == 2);
  REQUIRE(owner.retire(0) == RetireStatus::done); // Terminal ownership is idempotent.
  REQUIRE(owner.pump(4000) == PublishStatus::invalid);
}

TEST_CASE("Audio session retirement bounds retries missing completions and blocked stop output") {
  Fixture fixture;
  bool credit = true;
  std::size_t drains = 0;
  AudioSession owner(
      *fixture.context, [&](auto, auto) { return credit; }, [] { return true; },
      [&] {
        ++drains;
        return false;
      },
      20000);
  StaticHost host(fixture.context.get());
  struct ResetCloseFault {
    StaticHost &host;
    ~ResetCloseFault() { host.close_failures = 0; }
  } reset_close_fault{host};
  host.load(nullptr, true);
  host.connect();
  const auto configuration = formats();
  SECTION("host close failures retry only on later owner calls") {
    host.close_failures = 2;
    REQUIRE(owner.retire(1000) == RetireStatus::pending);
    REQUIRE(host.closes == 1);
    REQUIRE(owner.stats()->close_status == ERROR_ACCESS_DENIED);
    REQUIRE(owner.retire(2000) == RetireStatus::pending);
    REQUIRE(host.closes == 2);
    REQUIRE(owner.retire(3000) == RetireStatus::done);
    REQUIRE(host.closes == 3);
    REQUIRE(drains == 2);
    REQUIRE(owner.stats()->resources_retired);
  }
  SECTION("missing confirmations expire before further close or drain calls") {
    host.defer_writes = true;
    host.raw(configuration, static_cast<UINT>(configuration.size()));
    REQUIRE(owner.retire(1000) == RetireStatus::pending);
    REQUIRE(owner.retire(2000) == RetireStatus::pending);
    REQUIRE(drains == 2);
    REQUIRE(owner.retire(21000) == RetireStatus::expired);
    REQUIRE(owner.retire(22000) == RetireStatus::expired);
    REQUIRE(owner.stats()->close_attempts == 2);
    REQUIRE(drains == 2);
    REQUIRE_FALSE(owner.stats()->resources_retired);
    // Fake host destructor completes/cancels lifetime after this policy failure.
    // An actual worker must retain the wrapper or terminate its owned process.
  }
  SECTION("native resources retire even when output status has no credit") {
    credit = false;
    REQUIRE(owner.retire(1000) == RetireStatus::pending);
    REQUIRE(owner.stats()->resources_retired);
    REQUIRE(owner.stats()->publisher.state_pending);
    REQUIRE(drains == 0);
    REQUIRE(owner.retire(20999) == RetireStatus::pending);
    credit = true;
    REQUIRE(owner.retire(21000) == RetireStatus::expired);
    REQUIRE(host.closes == 1);
    REQUIRE(drains == 0);
  }
}

TEST_CASE("Audio session publication faults still drain ownership and reject nested retirement") {
  Fixture fixture;
  AudioSession *session = nullptr;
  StaticHost *transport = nullptr;
  RetireStatus nested = RetireStatus::active;
  PublishStatus nested_pump = PublishStatus::sent;
  AudioSession owner(
      *fixture.context, [](auto, auto) -> bool { throw std::runtime_error("fixture"); },
      [] { return true; },
      [&]() -> bool {
        nested = session->retire(2001);
        nested_pump = session->pump(2001);
        transport->complete(CHANNEL_EVENT_WRITE_CANCELLED);
        throw std::runtime_error("fixture drain");
      });
  session = &owner;
  StaticHost host(fixture.context.get());
  transport = &host;
  host.load(nullptr, true);
  host.connect();
  host.defer_writes = true;
  const auto configuration = formats();
  host.raw(configuration, static_cast<UINT>(configuration.size()));
  REQUIRE(owner.pump(1000) == PublishStatus::failed);
  REQUIRE(owner.stats()->publication_failed);
  REQUIRE(owner.retire(2000) == RetireStatus::pending);
  REQUIRE(nested == RetireStatus::invalid);
  REQUIRE(nested_pump == PublishStatus::invalid);
  REQUIRE(owner.stats()->drain_failures == 1);
  REQUIRE(owner.retire(3000) == RetireStatus::failed);
  REQUIRE(owner.stats()->resources_retired);
  REQUIRE(owner.stats()->publisher.failed);
}

TEST_CASE(
    "Audio session owner refuses foreign clocks callbacks and invalid policy without mutation") {
  Fixture fixture;
  REQUIRE_THROWS_AS(AudioSession(*fixture.context, {}, [] { return true; }), std::invalid_argument);
  REQUIRE_THROWS_AS(AudioSession(*fixture.context, [](auto, auto) { return true; }, {}),
                    std::invalid_argument);
  REQUIRE_THROWS_AS(
      AudioSession(
          *fixture.context, [](auto, auto) { return true; }, [] { return true; }, {}, 1000001),
      std::invalid_argument);
  AudioSession owner(*fixture.context, [](auto, auto) { return true; }, [] { return true; });
  PublishStatus foreign_pump = PublishStatus::sent;
  RetireStatus foreign_retire = RetireStatus::active;
  bool foreign_stats = true;
  std::thread foreign([&] {
    foreign_pump = owner.pump(1000);
    foreign_retire = owner.retire(1000);
    foreign_stats = owner.stats().has_value();
  });
  foreign.join();
  REQUIRE(foreign_pump == PublishStatus::invalid);
  REQUIRE(foreign_retire == RetireStatus::invalid);
  REQUIRE_FALSE(foreign_stats);
  REQUIRE(owner.pump(1000) == PublishStatus::sent);
  REQUIRE(owner.pump(999) == PublishStatus::invalid);
  REQUIRE(owner.retire(UINT64_MAX) == RetireStatus::invalid);
  REQUIRE(owner.stats()->invalid_calls == 2);
  REQUIRE(owner.stats()->publisher.sent_states == 1);
  REQUIRE(owner.retire(1001) == RetireStatus::done);
  REQUIRE(owner.stats()->publisher.sent_states == 2);
}

TEST_CASE(
    "Actual generic FreeRDP addin loader selects only guarded static PCM with playback opt-in") {
  Fixture fixture;
  AudioSession owner(*fixture.context, [](auto, auto) { return true; }, [] { return true; });
  struct ContextReset {
    decltype(fixture.context) &context;
    ~ContextReset() {
      if (context) {
        const auto disconnected = freerdp_disconnect(context->instance);
        context.reset();
        if (!disconnected)
          std::terminate();
      }
    }
  } final_host{fixture.context};
  REQUIRE(freerdp_settings_set_bool(fixture.context->settings, FreeRDP_AudioPlayback, FALSE));
  const char *args[] = {"rdpsnd"};
  REQUIRE(freerdp_client_add_static_channel(fixture.context->settings, 1, args));
  REQUIRE(freerdp_client_load_addins(fixture.context->channels, fixture.context->settings));
  REQUIRE(freerdp_settings_get_bool(fixture.context->settings, FreeRDP_AudioPlayback));
  REQUIRE_FALSE(freerdp_dynamic_channel_collection_find(fixture.context->settings, "rdpsnd"));
  std::unique_ptr<StaticClientChannelStats, decltype(&freerdp_channel_client_stats_free)> inventory{
      freerdp_channels_client_stats(fixture.context->channels), freerdp_channel_client_stats_free};
  REQUIRE(inventory);
  std::size_t count = 0;
  for (UINT i = 0; i < inventory->count; ++i)
    if (std::strcmp(inventory->stats[i].channelName, "rdpsnd") == 0)
      ++count;
  REQUIRE(count == 1);
  REQUIRE(owner.pump(0) == PublishStatus::sent);
  REQUIRE(owner.retire(1) == RetireStatus::done);
  REQUIRE(owner.stats()->resources_retired);
}

TEST_CASE("Actual FreeRDP core registers guarded audio and disconnects after owner retirement") {
  Fixture fixture;
  bridge::ipc::OutputQueue output;
  AudioSession owner(
      *fixture.context,
      [&](auto kind, auto bytes) {
        return output.push(kind, 0, bytes) == bridge::ipc::EnqueueStatus::accepted;
      },
      [&] {
        output.discard_audio();
        return true;
      });
  struct ContextReset {
    decltype(fixture.context) &context;
    ~ContextReset() {
      if (context) {
        const auto disconnected = freerdp_disconnect(context->instance);
        context.reset();
        if (!disconnected)
          std::terminate();
      }
    }
  } final_host{fixture.context};
  const auto entry = freerdp_load_channel_addin_entry("rdpsnd", nullptr, nullptr, static_abi);
  REQUIRE(entry);
  REQUIRE(freerdp_channels_client_load_ex(fixture.context->channels, fixture.context->settings,
                                          ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(entry),
                                          nullptr) == 0);
  std::unique_ptr<StaticClientChannelStats, decltype(&freerdp_channel_client_stats_free)> inventory{
      freerdp_channels_client_stats(fixture.context->channels), freerdp_channel_client_stats_free};
  REQUIRE(inventory);
  REQUIRE(inventory->count == 1);
  REQUIRE(std::strcmp(inventory->stats[0].channelName, "rdpsnd") == 0);
  REQUIRE(freerdp_channels_process_pending_messages(fixture.context->instance) == 1);
  REQUIRE(owner.pump(0) == PublishStatus::sent);
  REQUIRE(owner.retire(1) == RetireStatus::done);
  REQUIRE(owner.stats()->resources_retired);
  auto *context = fixture.context.release();
  BOOL disconnected = FALSE;
  std::thread terminated([context, &disconnected] {
    disconnected = freerdp_disconnect(context->instance);
    freerdp_client_context_free(context);
  });
  terminated.join(); // Actual core Terminated callback comes from Disconnect, before Free.
  REQUIRE(disconnected);
  REQUIRE(owner.stats()->source.availability == SourceAvailability::closed);
  REQUIRE(owner.retire(2) == RetireStatus::done);
}
