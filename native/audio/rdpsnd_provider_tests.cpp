#include "ingress.hpp"
#include "rdpsnd_provider.hpp"
#include "static_gate.hpp"
#include <algorithm>
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
      ++static_cast<StaticHost *>(handle)->closes;
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
  void load(AudioStaticGate *gate = nullptr) {
    const auto entry =
        freerdp_channels_load_static_addin_entry("rdpsnd", nullptr, nullptr, static_abi);
    REQUIRE(entry);
    const auto callback = std::bit_cast<PVIRTUALCHANNELENTRYEX>(entry);
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
  void complete() {
    while (!pending.empty()) {
      const auto value = pending.back();
      pending.pop_back();
      opened(plugin, 1, CHANNEL_EVENT_WRITE_COMPLETE, value, 0, 0, 0);
    }
  }
  void raw(std::span<const BYTE> bytes, UINT total, UINT flags = CHANNEL_FLAG_ONLY) {
    opened(plugin, 1, CHANNEL_EVENT_DATA_RECEIVED, const_cast<BYTE *>(bytes.data()),
           static_cast<UINT>(bytes.size()), total, flags);
  }
  bool ingest(std::span<const BYTE> bytes, std::size_t total, bool first, bool last) {
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
    REQUIRE(ingest(std::span(bytes).first(split), bytes.size(), true, false));
    REQUIRE(ingest(std::span(bytes).subspan(split), bytes.size(), false, true));
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
  host.raw(std::span(configuration).first(5), static_cast<UINT>(configuration.size()),
           CHANNEL_FLAG_FIRST);
  REQUIRE(host.writes.empty());
  host.raw(std::span(configuration).subspan(5), static_cast<UINT>(configuration.size()),
           CHANNEL_FLAG_LAST);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(host.writes.size() == 2);
  const std::vector<BYTE> wave{SNDC_WAVE2, 0, 20, 0, 100, 0,   0,   0,   1, 0, 0,   0,
                               100,        0, 0,  0, 0,   128, 255, 127, 1, 0, 254, 255};
  host.raw(wave, static_cast<UINT>(wave.size()));
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 2);
  const std::array<BYTE, 4> close{SNDC_CLOSE, 0, 0, 0};
  host.raw(close, 4);
  REQUIRE(fixture.sink.stats()->queue.queued_frames == 0);
  REQUIRE(fixture.sink.stats()->queue.reset_discarded_frames == 2);
  host.raw(wave, static_cast<UINT>(wave.size()));
  std::vector<BYTE> output(8);
  const auto result = fixture.sink.read(output);
  REQUIRE(result.frames == 2);
  REQUIRE(result.discontinuity);
  REQUIRE(output == std::vector<BYTE>{0, 128, 255, 127, 1, 0, 254, 255});
  REQUIRE(gate.retire() == CHANNEL_RC_OK);
  REQUIRE(gate.retired());
  REQUIRE(fixture.sink.retired());
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
  host.raw({}, 0, CHANNEL_FLAG_RESUME);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  const std::array<BYTE, 16> info{SNDC_WAVE, 0, 16, 0, 100, 0, 0, 0, 1, 0, 0, 0, 0, 128, 255, 127};
  host.raw(info, 16);
  REQUIRE(getChannelError(fixture.context.get()) == CHANNEL_RC_OK);
  host.raw({}, 0, CHANNEL_FLAG_SUSPEND);
  REQUIRE(getChannelError(fixture.context.get()) == ERROR_INVALID_DATA);
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
