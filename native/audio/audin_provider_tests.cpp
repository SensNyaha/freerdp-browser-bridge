#include "../compat/bit.hpp"
#include "../compat/ranges.hpp"
#include "../compat/span.hpp"
#include "../channels/dvc_channel_registry.hpp"
#include "audin_dvc.hpp"
#include "audin_ingress.hpp"
#include "audin_plugin.hpp"
#include "audin_provider.hpp"
#include "capture_handoff.hpp"
#include "capture_state.hpp"
#include "microphone_opus_owner.hpp"
#include "microphone_session.hpp"
#include "opus_encoder.hpp"
#include "rdpsnd_provider.hpp"
#include "reset_control.hpp"
#include <algorithm>
#include <catch2/catch_test_macros.hpp>
#include <cstring>
#include <freerdp/client.h>
#include <freerdp/client/channels.h>
#include <freerdp/codec/dsp.h>
#include <memory>
#include <mutex>
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
    return ::bridge::compat::bit_cast<PFREERDP_AUDIN_DEVICE_ENTRY>(result);
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
  AudinRegistration *registration = nullptr;
  bool guarded = false, via_gate = false;
  bool general_loader = false, verify_fixture_source = true;
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
  UINT nested_termination = CHANNEL_RC_OK;
  bool terminate_during_write = false;
  bool tick_during_write = false;
  bool reset_during_write = false;
  AudinCaptureReset nested_reset{AudinCaptureResetStatus::reset};
  AudinScheduledStatus nested_tick = AudinScheduledStatus::delivered;
  bool close_during_write = false, close_host_during_write = false, write_throws = false;
  unsigned attempts = 0, fail_at = 0;
  unsigned destroyed = 0;
  unsigned destroy_attempts = 0, destroy_failures = 0;
  UINT listener_status = CHANNEL_RC_OK;
  bool return_listener = true, destroy_throws = false, register_throws = false;
  bool retain_failed_registration = false;
  bool retire_during_probe = false;
  UINT probe_retirement = CHANNEL_RC_OK;
  template <class Api> static Host &get(Api *api) {
    static_assert(std::is_standard_layout_v<Interface<Api>>);
    return *static_cast<Host *>(reinterpret_cast<Interface<Api> *>(api)->owner);
  }
  explicit Host(Fixture &value, bool filter = false, bool wrapped = false,
                AudinRegistration *managed = nullptr)
      : fixture(value), gate(value.source), registration(managed), guarded(filter),
        via_gate(wrapped) {
    entries.api.GetPlugin = [](IDRDYNVC_ENTRY_POINTS *api, const char *) {
      auto &host = get(api);
      if (host.retire_during_probe && host.registration)
        host.probe_retirement = host.registration->retire();
      return host.plugin;
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
      if (host.retain_failed_registration)
        host.plugin = plugin;
      if (host.register_throws)
        throw std::runtime_error("fixture DVC registration failure");
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
      *listener = host.return_listener ? &host.listener : nullptr;
      return host.listener_status;
    };
    manager.api.DestroyListener = [](IWTSVirtualChannelManager *api, IWTSListener *) -> UINT {
      auto &host = get(api);
      ++host.destroy_attempts;
      if (host.destroy_failures) {
        --host.destroy_failures;
        if (host.destroy_throws)
          throw std::runtime_error("fixture listener destruction failure");
        return CHANNEL_RC_NOT_CONNECTED;
      }
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
      if (host.terminate_during_write)
        host.nested_termination = host.plugin->Terminated(host.plugin);
      if (host.tick_during_write)
        host.nested_tick =
            (host.registration ? host.registration->gate() : host.gate).tick(1000000);
      if (host.reset_during_write)
        host.nested_reset =
            (host.registration ? host.registration->gate() : host.gate).reset_capture(1);
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
    const auto entry =
        (registration || general_loader)
            ? freerdp_load_channel_addin_entry(AUDIN_CHANNEL_NAME, nullptr, nullptr,
                                               FREERDP_ADDIN_CHANNEL_DYNAMIC)
            : freerdp_channels_load_static_addin_entry(AUDIN_CHANNEL_NAME, nullptr, nullptr,
                                                       FREERDP_ADDIN_CHANNEL_DYNAMIC);
    REQUIRE(entry);
    return ::bridge::compat::bit_cast<PDVC_PLUGIN_ENTRY>(entry)(&entries.api);
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
    ::bridge::compat::span<const BYTE> forwarded = bytes;
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
    if (registration && !registration->retired() && !registration->gate().quiescent())
      return ERROR_INVALID_STATE;
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
std::vector<BYTE> open_packet(unsigned frames = 960) {
  std::vector<BYTE> open{3};
  dword(open, frames);
  dword(open, 0);
  const auto offer = formats();
  open.insert(open.end(), offer.begin() + 9, offer.begin() + 27);
  return open;
}
void negotiate(Host &host, unsigned frames = 960) {
  REQUIRE(host.send({1, 1, 0, 0, 0}) == CHANNEL_RC_OK);
  REQUIRE(host.send(formats()) == CHANNEL_RC_OK);
  REQUIRE(host.send(open_packet(frames)) == CHANNEL_RC_OK);
  if (host.verify_fixture_source)
    REQUIRE(host.fixture.source.stats()->opened);
}
bridge::ipc::microphone::Result submit_capture(void *owner,
                                               const bridge::ipc::microphone::PcmPacket &packet) {
  const auto result = static_cast<AudinSource *>(owner)->submit(
      {packet.epoch, packet.timestamp_us, packet.discontinuity, packet.pcm});
  using Result = bridge::ipc::microphone::Result;
  switch (result) {
  case CaptureStatus::accepted:
    return Result::accepted;
  case CaptureStatus::stale:
    return Result::stale;
  case CaptureStatus::inactive:
    return Result::unavailable;
  case CaptureStatus::invalid:
    return Result::invalid;
  }
  return Result::invalid;
}
} // namespace
TEST_CASE("Pinned public DSP reset releases preceding Opus state across PCM format changes") {
  // Repeated reset must be leak-free under ASan/LSan, including PCM formats:
  // the pinned DSP also prepares Opus for supported PCM sample rates.
  for (const BOOL encoder : {FALSE, TRUE}) {
    const std::unique_ptr<FREERDP_DSP_CONTEXT, decltype(&freerdp_dsp_context_free)> context(
        freerdp_dsp_context_new(encoder), freerdp_dsp_context_free);
    REQUIRE(context);
    for (const unsigned rate : {48000U, 16000U, 44100U, 8000U, 48000U}) {
      AUDIO_FORMAT format{};
      format.wFormatTag = WAVE_FORMAT_PCM;
      format.nChannels = rate == 48000 ? 2 : 1;
      format.nSamplesPerSec = rate;
      format.nBlockAlign = format.nChannels * 2;
      format.nAvgBytesPerSec = rate * format.nBlockAlign;
      format.wBitsPerSample = 16;
      REQUIRE(freerdp_dsp_context_reset(context.get(), &format, rate / 50));
    }
  }
}
TEST_CASE("Actual guarded AUDIN negotiates beneath public early DVC audio allocation profile") {
  Fixture fixture;
  AudinRegistration registration(*fixture.context, fixture.source);
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) == CHANNEL_RC_OK);
  Host host(fixture, false, false, &registration);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  host.manager.api.GetChannelId = [](IWTSVirtualChannel *) -> UINT32 { return 7; };
  host.manager.api.GetChannelName = [](IWTSVirtualChannel *) { return AUDIN_DVC_CHANNEL_NAME; };
  bridge::channels::DvcChannelRegistry registry([](void *) -> std::uint64_t { return 1; });
  const auto binding = registry.bind(host.manager.api, host.channel.api, *host.callback, 1);
  REQUIRE(binding.status == CHANNEL_RC_OK);
  host.callback = binding.callback;
  negotiate(host);
  REQUIRE(registration.gate().ready());
  REQUIRE(fixture.source.stats()->opened);
  const auto attempts = host.attempts;
  const auto epoch = fixture.source.stats()->epoch;
  const BYTE claim[]{0x28, 7, 1, 0, 1, 0}; // 65,537 before native reassembly allocation.
  REQUIRE_FALSE(registry.admit(claim, 1));
  REQUIRE(host.attempts == attempts);
  REQUIRE(fixture.source.stats()->epoch == epoch);
  REQUIRE(fixture.source.stats()->opened);
  REQUIRE(registry.stats().budget.reservations == 0);
  REQUIRE(host.close() == CHANNEL_RC_OK);
  REQUIRE_FALSE(fixture.source.stats()->opened);
  REQUIRE(registry.retire() != CHANNEL_RC_OK); // Admission error survives completed cleanup.
  REQUIRE(registry.stats().resources_retired);
  // The fixture owns provider, while this scope owns its borrowed registration.
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}
TEST_CASE("Actual guarded AUDIN normal close retires early DVC ownership without a false fault") {
  Fixture fixture;
  AudinRegistration registration(*fixture.context, fixture.source);
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) == CHANNEL_RC_OK);
  Host host(fixture, false, false, &registration);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  host.manager.api.GetChannelId = [](IWTSVirtualChannel *) -> UINT32 { return 7; };
  host.manager.api.GetChannelName = [](IWTSVirtualChannel *) { return AUDIN_DVC_CHANNEL_NAME; };
  bridge::channels::DvcChannelRegistry registry([](void *) -> std::uint64_t { return 1; });
  const auto binding = registry.bind(host.manager.api, host.channel.api, *host.callback, 1);
  REQUIRE(binding.status == CHANNEL_RC_OK);
  host.callback = binding.callback;
  negotiate(host);
  REQUIRE(registration.gate().ready());
  REQUIRE(host.close() == CHANNEL_RC_OK);
  REQUIRE_FALSE(fixture.source.stats()->opened);
  REQUIRE(registry.retire() == CHANNEL_RC_OK);
  REQUIRE_FALSE(registry.stats().failed);
  REQUIRE(registry.stats().resources_retired);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}
TEST_CASE("Microphone reset control clears actual source before fresh admitted authority") {
  Fixture fixture;
  struct Probe {
    ResetControl reset;
    bool admitted = true;
  } probe;
  const auto send = [](void *owner, bridge::ipc::Kind kind, ::bridge::compat::span<const BYTE> bytes) {
    auto &value = *static_cast<Probe *>(owner);
    REQUIRE(kind == bridge::ipc::Kind::microphone_state);
    if (!value.admitted)
      return false;
    REQUIRE(value.reset.observe(bridge::ipc::microphone::decode_state(bytes)));
    return true;
  };
  MicrophoneSession session(*fixture.context, send, &probe);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(session.pump(0) == MicrophonePump::idle);
  REQUIRE(probe.reset.enqueue(1, 1, 0, true) == bridge::ipc::audio::ResetResult::stale);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(session.pump(100) == MicrophonePump::delivered);
  std::vector<BYTE> pcm(3840, 0x41);
  REQUIRE(session.submit({1, 0, true, pcm}) == bridge::ipc::microphone::Result::accepted);
  REQUIRE(session.submit({1, 20000, false, pcm}) == bridge::ipc::microphone::Result::accepted);
  REQUIRE_FALSE(probe.reset.enqueue(2, 1, 200, true));
  const auto reset = [&] {
    const auto state = session.published_state();
    const auto stats = session.stats();
    return state && stats && state->epoch == stats->source.epoch && stats->source.opened &&
           session.reset_capture(state->epoch).status == AudinCaptureResetStatus::reset;
  };
  const auto completed = probe.reset.service(201, true, reset);
  REQUIRE(completed);
  REQUIRE(completed->request_id == 2);
  REQUIRE(completed->result == bridge::ipc::audio::ResetResult::scheduled);
  REQUIRE(session.stats()->source.capture_resets == 1);
  REQUIRE(session.stats()->source.capture.queue.queued_frames == 0);
  REQUIRE(session.published_state()->epoch == 1);
  REQUIRE(session.submit({1, 40000, false, pcm}) == bridge::ipc::microphone::Result::stale);
  REQUIRE(session.submit({2, 0, true, pcm}) == bridge::ipc::microphone::Result::unavailable);
  REQUIRE(probe.reset.enqueue(3, 1, 202, true) == bridge::ipc::audio::ResetResult::busy);
  probe.admitted = false;
  REQUIRE(session.pump(300) == MicrophonePump::blocked);
  REQUIRE(session.published_state()->epoch == 1);
  probe.admitted = true;
  REQUIRE(session.pump(400) == MicrophonePump::delivered);
  REQUIRE(session.published_state()->epoch == 2);
  REQUIRE(std::all_of(host.writes.back().begin() + 1, host.writes.back().end(),
                      [](BYTE byte) { return byte == 0; }));
  REQUIRE_FALSE(probe.reset.enqueue(4, 2, 500, true));
  REQUIRE(probe.reset.service(500 + ResetControl::window_us, true, reset)->result ==
          bridge::ipc::audio::ResetResult::busy);
  REQUIRE(session.stats()->source.capture_resets == 1);
  REQUIRE_FALSE(probe.reset.enqueue(5, 2, 1000600, true));
  REQUIRE(probe.reset.service(1000601, false, reset)->result ==
          bridge::ipc::audio::ResetResult::unavailable);
  REQUIRE(session.stats()->source.capture_resets == 1);
  REQUIRE(session.retire(1000700) == MicrophoneRetirement::done);
}
TEST_CASE("Opus microphone owner checks published actual AUDIN readiness before decode and emits "
          "compensated PCM") {
  Fixture fixture;
  bool admitted = false;
  const auto send = [](void *owner, bridge::ipc::Kind kind, ::bridge::compat::span<const BYTE> bytes) {
    REQUIRE(kind == bridge::ipc::Kind::microphone_state);
    REQUIRE(bridge::ipc::microphone::decode_state(bytes).enabled);
    return *static_cast<bool *>(owner);
  };
  MicrophoneSession session(*fixture.context, send, &admitted);
  MicrophoneOpusOwner input(session);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  SoftwareOpusEncoder encoder;
  std::vector<BYTE> pcm(3840, 0x21);
  const auto first = encoder.encode({pcm, 0});
  REQUIRE(input.submit({1, 0, encoder.lookahead_frames(), true, first.bytes}) ==
          bridge::ipc::microphone::Result::unavailable);
  REQUIRE(input.stats()->decoded_packets == 0);
  REQUIRE(input.stats()->epoch == 0);
  REQUIRE(session.pump(0) == MicrophonePump::blocked);
  REQUIRE_FALSE(session.input_ready(1));
  admitted = true;
  REQUIRE(session.pump(1) == MicrophonePump::delivered);
  REQUIRE(session.input_ready(1));
  REQUIRE(input.submit({2, 0, encoder.lookahead_frames(), true, first.bytes}) ==
          bridge::ipc::microphone::Result::stale);
  REQUIRE(input.stats()->decoded_packets == 0);
  REQUIRE(input.submit({1, 0, encoder.lookahead_frames(), true, first.bytes}) ==
          bridge::ipc::microphone::Result::accepted);
  REQUIRE(input.stats()->primed == 1);
  REQUIRE(input.stats()->pcm_units == 0);
  for (std::uint64_t index = 1; index < 3; ++index) {
    const auto unit = encoder.encode({pcm, index * 20000});
    REQUIRE(input.submit({1, index * 20000, encoder.lookahead_frames(), false, unit.bytes}) ==
            bridge::ipc::microphone::Result::accepted);
  }
  REQUIRE(input.stats()->decoded_packets == 3);
  REQUIRE(input.stats()->pcm_units == 2);
  REQUIRE(session.stats()->source.capture.queue.queued_frames == 1920);
  REQUIRE(session.pump(20001) == MicrophonePump::delivered);
  REQUIRE(host.writes.back().size() == 3841);
  REQUIRE(::bridge::compat::ranges::any_of(::bridge::compat::span(host.writes.back()).subspan(1),
                              [](auto byte) { return byte != 0; }));
  REQUIRE(input.retire());
  REQUIRE(input.stats()->partial_frames == 0);
  REQUIRE(input.stats()->retired);
  REQUIRE(session.retire(20002) == MicrophoneRetirement::done);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}
TEST_CASE("Opus microphone owner clears partial prediction across unpublished reset and requires a "
          "fresh boundary") {
  Fixture fixture;
  bool admitted = true;
  const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) {
    return *static_cast<bool *>(owner);
  };
  MicrophoneSession session(*fixture.context, send, &admitted);
  MicrophoneOpusOwner input(session);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(session.pump(0) == MicrophonePump::delivered);
  SoftwareOpusEncoder encoder;
  std::vector<BYTE> pcm(3840, 0x21);
  const auto first = encoder.encode({pcm, 0});
  const std::vector<BYTE> bytes(first.bytes.begin(), first.bytes.end());
  REQUIRE(input.submit({1, 0, encoder.lookahead_frames(), true, bytes}) ==
          bridge::ipc::microphone::Result::accepted);
  const auto partial = input.stats()->partial_frames;
  REQUIRE(partial > 0);
  REQUIRE(partial < 960);
  REQUIRE(session.reset_capture(1).status == AudinCaptureResetStatus::reset);
  REQUIRE_FALSE(input.synchronize());
  REQUIRE(input.stats()->partial_frames == 0);
  REQUIRE(input.stats()->discarded_partial_frames == partial);
  REQUIRE(input.stats()->epoch == 0);
  admitted = false;
  REQUIRE(session.pump(1) == MicrophonePump::blocked);
  REQUIRE(input.submit({2, 0, encoder.lookahead_frames(), true, bytes}) ==
          bridge::ipc::microphone::Result::unavailable);
  REQUIRE(input.stats()->decoded_packets == 1);
  admitted = true;
  REQUIRE(session.pump(2) == MicrophonePump::delivered);
  REQUIRE(input.synchronize());
  REQUIRE(session.input_ready(2));
  REQUIRE(input.submit({2, 0, encoder.lookahead_frames(), false, bytes}) ==
          bridge::ipc::microphone::Result::invalid);
  REQUIRE(input.stats()->epoch == 0);
  REQUIRE_FALSE(input.stats()->failed);
  REQUIRE(input.submit({1, 0, encoder.lookahead_frames(), true, bytes}) ==
          bridge::ipc::microphone::Result::stale);
  REQUIRE(input.submit({2, 0, encoder.lookahead_frames(), true, bytes}) ==
          bridge::ipc::microphone::Result::accepted);
  REQUIRE(input.stats()->primed == 2);
  REQUIRE(session.reset_capture(2).status == AudinCaptureResetStatus::reset);
  REQUIRE(session.pump(3) == MicrophonePump::delivered);
  REQUIRE(input.submit({3, 0, encoder.lookahead_frames(), false, bytes}) ==
          bridge::ipc::microphone::Result::invalid);
  REQUIRE(input.stats()->epoch == 0);
  REQUIRE(input.stats()->partial_frames == 0);
  REQUIRE(input.submit({3, 0, encoder.lookahead_frames(), true, bytes}) ==
          bridge::ipc::microphone::Result::accepted);
  REQUIRE(input.stats()->primed == 3);
  REQUIRE(input.invalidate());
  REQUIRE(input.stats()->partial_frames == 0);
  REQUIRE(input.retire());
  REQUIRE(input.retire());
  REQUIRE(input.submit({2, 20000, encoder.lookahead_frames(), false, bytes}) ==
          bridge::ipc::microphone::Result::unavailable);
  REQUIRE(session.retire(3) == MicrophoneRetirement::done);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}
TEST_CASE("Opus microphone owner refuses wrong threads and malformed packets without disturbing "
          "prediction or host lifetime") {
  Fixture fixture;
  bool admitted = true;
  const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) {
    return *static_cast<bool *>(owner);
  };
  MicrophoneSession session(*fixture.context, send, &admitted);
  MicrophoneOpusOwner input(session);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(session.pump(0) == MicrophonePump::delivered);
  bool wrong_construction = false, wrong_ready = true, wrong_stats = true, wrong_sync = true,
       wrong_retire = true;
  auto wrong_result = bridge::ipc::microphone::Result::accepted;
  std::thread other([&] {
    try {
      MicrophoneOpusOwner foreign(session);
    } catch (const std::invalid_argument &) {
      wrong_construction = true;
    }
    wrong_ready = session.input_ready(1);
    wrong_stats = input.stats().has_value();
    wrong_sync = input.synchronize();
    wrong_retire = input.retire();
    wrong_result = input.submit({1, 0, 0, true, {}});
  });
  other.join();
  REQUIRE(wrong_construction);
  REQUIRE_FALSE(wrong_ready);
  REQUIRE_FALSE(wrong_stats);
  REQUIRE_FALSE(wrong_sync);
  REQUIRE_FALSE(wrong_retire);
  REQUIRE(wrong_result == bridge::ipc::microphone::Result::unavailable);
  const std::vector<BYTE> malformed{0, 0};
  REQUIRE(input.submit({1, 0, 0, true, malformed}) == bridge::ipc::microphone::Result::invalid);
  REQUIRE(input.stats()->epoch == 0);
  REQUIRE(input.stats()->decoded_packets == 0);
  SoftwareOpusEncoder encoder;
  std::vector<BYTE> pcm(3840, 0x21);
  const auto first = encoder.encode({pcm, 0});
  REQUIRE(input.submit({1, 0, encoder.lookahead_frames(), true, first.bytes}) ==
          bridge::ipc::microphone::Result::accepted);
  const auto partial = input.stats()->partial_frames;
  const auto next = encoder.encode({pcm, 20000});
  REQUIRE(input.submit({1, 20000, 961, false, next.bytes}) ==
          bridge::ipc::microphone::Result::invalid);
  REQUIRE(input.submit({1, 20001, encoder.lookahead_frames(), false, next.bytes}) ==
          bridge::ipc::microphone::Result::invalid);
  REQUIRE(input.stats()->partial_frames == partial);
  REQUIRE(input.stats()->decoded_packets == 1);
  REQUIRE(input.submit({1, 20000, encoder.lookahead_frames(), false, next.bytes}) ==
          bridge::ipc::microphone::Result::accepted);
  REQUIRE_FALSE(input.stats()->failed);
  REQUIRE(input.retire());
  REQUIRE(session.retire(1) == MicrophoneRetirement::done);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}
TEST_CASE("Opus microphone owner retires prediction after decoded PCM is refused and never retries "
          "uncertain admission") {
  Fixture fixture;
  bool admitted = true;
  const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) {
    return *static_cast<bool *>(owner);
  };
  MicrophoneSession session(*fixture.context, send, &admitted);
  MicrophoneOpusOwner input(session);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(session.pump(0) == MicrophonePump::delivered);
  std::vector<BYTE> pcm(3840, 0x21);
  REQUIRE(session.submit({1, 100000, true, pcm}) ==
          bridge::ipc::microphone::Result::accepted); // Deliberate fixture-only foreign PCM clock.
  SoftwareOpusEncoder encoder;
  const auto first = encoder.encode({pcm, 0});
  REQUIRE(input.submit({1, 0, encoder.lookahead_frames(), true, first.bytes}) ==
          bridge::ipc::microphone::Result::accepted);
  const auto next = encoder.encode({pcm, 20000});
  REQUIRE(input.submit({1, 20000, encoder.lookahead_frames(), false, next.bytes}) ==
          bridge::ipc::microphone::Result::invalid);
  REQUIRE(input.stats()->failed);
  REQUIRE(input.stats()->partial_frames == 0);
  REQUIRE(input.stats()->pcm_units == 0);
  REQUIRE(input.stats()->decoded_packets == 2);
  REQUIRE_FALSE(input.synchronize());
  REQUIRE(input.submit({1, 40000, encoder.lookahead_frames(), true, next.bytes}) ==
          bridge::ipc::microphone::Result::unavailable);
  REQUIRE(input.invalidate());
  REQUIRE(input.stats()->failed);
  REQUIRE(input.retire());
  REQUIRE(session.retire(1) == MicrophoneRetirement::done);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}
TEST_CASE("Opus microphone owner observes actual channel Close before stale ready status can admit "
          "another packet") {
  Fixture fixture;
  bool admitted = true;
  const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) {
    return *static_cast<bool *>(owner);
  };
  MicrophoneSession session(*fixture.context, send, &admitted);
  MicrophoneOpusOwner input(session);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(session.pump(0) == MicrophonePump::delivered);
  SoftwareOpusEncoder encoder;
  const std::vector<BYTE> pcm(3840, 0x21);
  const auto first = encoder.encode({pcm, 0});
  const std::vector<BYTE> bytes(first.bytes.begin(), first.bytes.end());
  REQUIRE(input.submit({1, 0, encoder.lookahead_frames(), true, bytes}) ==
          bridge::ipc::microphone::Result::accepted);
  REQUIRE(input.stats()->partial_frames > 0);
  REQUIRE(session.input_ready(1));
  REQUIRE(host.close() == CHANNEL_RC_OK);
  REQUIRE(
      session.published_state()->availability ==
      bridge::ipc::audio::Availability::ready); // Published snapshot is intentionally still old.
  REQUIRE_FALSE(session.input_ready(1));
  REQUIRE_FALSE(input.synchronize());
  REQUIRE(input.stats()->partial_frames == 0);
  REQUIRE(input.stats()->epoch == 0);
  REQUIRE(input.submit({1, 20000, encoder.lookahead_frames(), false, bytes}) ==
          bridge::ipc::microphone::Result::unavailable);
  REQUIRE(input.stats()->decoded_packets == 1);
  REQUIRE_FALSE(input.stats()->failed);
  REQUIRE(input.retire());
  REQUIRE(session.retire(1) == MicrophoneRetirement::done);
}
TEST_CASE("Microphone worker profile refuses tiny callbacks and accepts a later compatible Open") {
  Fixture fixture;
  bool admitted = true;
  const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) {
    return *static_cast<bool *>(owner);
  };
  MicrophoneSession session(*fixture.context, send, &admitted);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  REQUIRE(host.send({1, 1, 0, 0, 0}) == CHANNEL_RC_OK);
  REQUIRE(host.send(formats()) == CHANNEL_RC_OK);
  for (const unsigned frames : {1U, 479U}) {
    const auto writes = host.writes.size();
    REQUIRE(host.send(open_packet(frames)) == CHANNEL_RC_OK);
    REQUIRE(host.writes.size() == writes + 1);
    REQUIRE(host.writes.back() == std::vector<BYTE>{4, 0x32, 0, 7, 0x80});
    REQUIRE(session.pump(0) == MicrophonePump::idle);
    REQUIRE(session.published_state()->availability ==
            bridge::ipc::audio::Availability::unavailable);
    REQUIRE(session.stats()->source.epoch == 0);
    REQUIRE_FALSE(session.stats()->source.opened);
    REQUIRE(session.stats()->source.callbacks == 0);
    REQUIRE_FALSE(session.capture_deadline());
  }
  REQUIRE(host.send(open_packet(480)) == CHANNEL_RC_OK);
  REQUIRE(session.pump(10) == MicrophonePump::delivered);
  REQUIRE(session.published_state()->availability == bridge::ipc::audio::Availability::ready);
  REQUIRE(session.published_state()->epoch == 1);
  REQUIRE(host.writes.back().size() == 1921);
  REQUIRE(session.pump(10009) == MicrophonePump::idle);
  REQUIRE(session.capture_deadline() == 10010);
  REQUIRE(session.pump(10010) == MicrophonePump::delivered);
  REQUIRE(session.stats()->source.callbacks == 2);
  REQUIRE(host.send({7, 1, 0, 0, 0}) == CHANNEL_RC_OK);
  REQUIRE(session.pump(10011) == MicrophonePump::delivered);
  REQUIRE(session.published_state()->epoch == 2);
  REQUIRE(host.writes.back().size() == 961);
  REQUIRE(session.stats()->negotiation.opens == 3);
  REQUIRE(session.stats()->negotiation.refused == 2);
  REQUIRE(session.stats()->negotiation.recording == 2);
  REQUIRE(session.stats()->negotiation.failures == 0);
  REQUIRE(session.retire(10012) == MicrophoneRetirement::done);
  REQUIRE(session.stats()->negotiation.refused == 2);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}
TEST_CASE(
    "Microphone worker profile bounds callback intervals across accepted server packet sizes") {
  for (const unsigned frames : {480U, 481U, 4096U, 4800U}) {
    Fixture fixture;
    bool admitted = true;
    const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) {
      return *static_cast<bool *>(owner);
    };
    MicrophoneSession session(*fixture.context, send, &admitted);
    Host host(fixture);
    host.general_loader = true;
    host.verify_fixture_source = false;
    REQUIRE(host.install() == CHANNEL_RC_OK);
    host.open();
    negotiate(host, frames);
    REQUIRE(session.pump(0) == MicrophonePump::delivered);
    REQUIRE(host.writes.back().size() == 1 + frames * 4);
    const auto deadline = (std::uint64_t{frames} * 1000000 + 47999) / 48000;
    REQUIRE(deadline >= 10000);
    REQUIRE(session.capture_deadline() == deadline);
    REQUIRE(session.pump(deadline - 1) == MicrophonePump::idle);
    REQUIRE(session.pump(deadline) == MicrophonePump::delivered);
    REQUIRE(session.stats()->source.callbacks == 2);
    REQUIRE(session.stats()->source.emitted_frames == frames * 2);
    REQUIRE(session.retire(deadline + 1) == MicrophoneRetirement::done);
    REQUIRE(host.close() == CHANNEL_RC_OK);
  }
}
TEST_CASE("Microphone worker profile checks refused Open writes without opening capture") {
  for (const bool throws : {false, true}) {
    Fixture fixture;
    bool admitted = true;
    const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) {
      return *static_cast<bool *>(owner);
    };
    MicrophoneSession session(*fixture.context, send, &admitted);
    Host host(fixture);
    host.general_loader = true;
    host.verify_fixture_source = false;
    REQUIRE(host.install() == CHANNEL_RC_OK);
    host.open();
    REQUIRE(host.send({1, 1, 0, 0, 0}) == CHANNEL_RC_OK);
    REQUIRE(host.send(formats()) == CHANNEL_RC_OK);
    host.write_status = CHANNEL_RC_NOT_CONNECTED;
    host.write_throws = throws;
    REQUIRE(host.send(open_packet(1)) != CHANNEL_RC_OK);
    REQUIRE(session.pump(0) == MicrophonePump::failed);
    REQUIRE(session.published_state()->availability == bridge::ipc::audio::Availability::failed);
    REQUIRE_FALSE(session.stats()->source.opened);
    REQUIRE(session.stats()->source.epoch == 0);
    REQUIRE(session.stats()->source.callbacks == 0);
    REQUIRE(session.retire(1) == MicrophoneRetirement::done);
    REQUIRE(host.close() == CHANNEL_RC_OK);
  }
}
TEST_CASE(
    "Microphone session expires closed metadata backpressure without retrying released handles") {
  Fixture fixture;
  bool admitted = true;
  const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) {
    return *static_cast<bool *>(owner);
  };
  MicrophoneSession session(*fixture.context, send, &admitted, 20000);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(session.pump(0) == MicrophonePump::delivered);
  admitted = false;
  REQUIRE(session.retire(100) == MicrophoneRetirement::pending);
  REQUIRE(session.stats()->resources_retired);
  REQUIRE(host.destroy_attempts == 1);
  REQUIRE(session.retire(20099) == MicrophoneRetirement::pending);
  const auto publications = session.stats()->publication.backpressure;
  REQUIRE(session.retire(20100) == MicrophoneRetirement::expired);
  admitted = true;
  REQUIRE(session.retire(20101) == MicrophoneRetirement::expired);
  REQUIRE(session.stats()->publication.backpressure == publications);
  REQUIRE(session.stats()->close_attempts == 1);
  REQUIRE(host.destroy_attempts == 1);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}

TEST_CASE("Microphone session stops uncertain publication and never replays borrowed status") {
  Fixture fixture;
  unsigned attempts = 0;
  const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) -> bool {
    ++*static_cast<unsigned *>(owner);
    throw std::runtime_error("fixture uncertain publication");
  };
  MicrophoneSession session(*fixture.context, send, &attempts);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(session.pump(0) == MicrophonePump::failed);
  REQUIRE_FALSE(session.stats()->source.opened);
  REQUIRE_FALSE(session.published_state());
  REQUIRE(session.stats()->publication_failed);
  REQUIRE(session.pump(20000) == MicrophonePump::failed);
  REQUIRE(session.reset_capture(1).status == AudinCaptureResetStatus::inactive);
  REQUIRE(session.retire(20001) == MicrophoneRetirement::failed);
  REQUIRE(session.stats()->resources_retired);
  REQUIRE(session.retire(20002) == MicrophoneRetirement::failed);
  REQUIRE(attempts == 1);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}

TEST_CASE("Microphone session stops capture below another provider before ordered retirement") {
  Fixture fixture;
  bool admitted = true;
  const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) {
    return *static_cast<bool *>(owner);
  };
  MicrophoneSession session(*fixture.context, send, &admitted);
  RdpsndSink sink;
  RdpsndProvider sound;
  REQUIRE(sound.bind(*fixture.context, sink) == CHANNEL_RC_OK);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(session.pump(0) == MicrophonePump::delivered);
  REQUIRE(session.retire(100) == MicrophoneRetirement::pending);
  REQUIRE_FALSE(session.stats()->resources_retired);
  REQUIRE_FALSE(session.stats()->source.opened);
  REQUIRE(session.stats()->close_status == ERROR_INVALID_STATE);
  REQUIRE(host.destroy_attempts == 0);
  REQUIRE(sound.close() == CHANNEL_RC_OK);
  REQUIRE(session.retire(101) == MicrophoneRetirement::done);
  REQUIRE(session.stats()->resources_retired);
  REQUIRE(host.destroy_attempts == 1);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}

TEST_CASE("Microphone session refuses foreign reentrant and regressing owner operations") {
  Fixture fixture;
  struct Probe {
    MicrophoneSession *session = nullptr;
    MicrophonePump pump = MicrophonePump::idle;
    MicrophoneRetirement retirement = MicrophoneRetirement::done;
    bridge::ipc::microphone::Result submit = bridge::ipc::microphone::Result::accepted;
    AudinCaptureResetStatus reset = AudinCaptureResetStatus::reset;
    bool snapshots = true;
  } probe;
  const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) {
    auto &value = *static_cast<Probe *>(owner);
    value.pump = value.session->pump(1000000);
    value.retirement = value.session->retire(1000000);
    value.submit = value.session->submit({});
    value.reset = value.session->reset_capture(1).status;
    value.snapshots = value.session->stats().has_value() ||
                      value.session->published_state().has_value() ||
                      value.session->capture_deadline().has_value();
    return true;
  };
  REQUIRE_THROWS_AS(MicrophoneSession(*fixture.context, nullptr, &probe), std::invalid_argument);
  REQUIRE_THROWS_AS(MicrophoneSession(*fixture.context, send, nullptr), std::invalid_argument);
  REQUIRE_THROWS_AS(MicrophoneSession(*fixture.context, send, &probe, 19999),
                    std::invalid_argument);
  REQUIRE_THROWS_AS(MicrophoneSession(*fixture.context, send, &probe, 1000001),
                    std::invalid_argument);
  MicrophoneSession session(*fixture.context, send, &probe);
  probe.session = &session;
  REQUIRE(session.pump(100) == MicrophonePump::idle);
  REQUIRE(probe.pump == MicrophonePump::invalid);
  REQUIRE(probe.retirement == MicrophoneRetirement::invalid);
  REQUIRE(probe.submit == bridge::ipc::microphone::Result::busy);
  REQUIRE(probe.reset == AudinCaptureResetStatus::busy);
  REQUIRE_FALSE(probe.snapshots);
  std::thread foreign([&] {
    probe.pump = session.pump(1000000);
    probe.retirement = session.retire(1000000);
    probe.submit = session.submit({});
    probe.reset = session.reset_capture(1).status;
    probe.snapshots = session.stats().has_value() || session.published_state().has_value() ||
                      session.capture_deadline().has_value();
  });
  foreign.join();
  REQUIRE(probe.pump == MicrophonePump::invalid);
  REQUIRE(probe.retirement == MicrophoneRetirement::invalid);
  REQUIRE(probe.submit == bridge::ipc::microphone::Result::unavailable);
  REQUIRE(probe.reset == AudinCaptureResetStatus::inactive);
  REQUIRE_FALSE(probe.snapshots);
  REQUIRE(session.pump(99) == MicrophonePump::invalid);
  REQUIRE(session.retire(UINT64_MAX) == MicrophoneRetirement::invalid);
  REQUIRE(session.stats()->invalid_calls == 2);
  REQUIRE(session.pump(101) == MicrophonePump::idle);
  REQUIRE(session.retire(102) == MicrophoneRetirement::done);
}

TEST_CASE(
    "Microphone session owns guarded PCM scheduling reset status and delayed host termination") {
  Fixture fixture;
  bool admitted = true;
  const auto send = [](void *owner, bridge::ipc::Kind kind, ::bridge::compat::span<const BYTE> bytes) {
    REQUIRE(kind == bridge::ipc::Kind::microphone_state);
    REQUIRE(bridge::ipc::microphone::decode_state(bytes).enabled);
    return *static_cast<bool *>(owner);
  };
  MicrophoneSession session(*fixture.context, send, &admitted);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(session.pump(0) == MicrophonePump::idle);
  REQUIRE(session.published_state()->availability == bridge::ipc::audio::Availability::waiting);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  admitted = false;
  REQUIRE(session.pump(100) == MicrophonePump::blocked);
  REQUIRE(session.published_state()->epoch == 0);
  std::vector<BYTE> pcm(3840, 0x41);
  REQUIRE(session.submit({1, 0, true, pcm}) == bridge::ipc::microphone::Result::unavailable);
  admitted = true;
  REQUIRE(session.pump(200) == MicrophonePump::delivered);
  REQUIRE(session.published_state()->epoch == 1);
  REQUIRE(session.submit({1, 0, true, pcm}) == bridge::ipc::microphone::Result::accepted);
  REQUIRE(session.submit({1, 20000, false, pcm}) == bridge::ipc::microphone::Result::accepted);
  REQUIRE(session.pump(20199) == MicrophonePump::idle);
  REQUIRE(session.pump(20200) == MicrophonePump::delivered);
  REQUIRE(host.writes.back()[1] == 0x41);
  REQUIRE(session.reset_capture(1).status == AudinCaptureResetStatus::reset);
  REQUIRE_FALSE(session.capture_deadline());
  REQUIRE(session.submit({1, 40000, false, pcm}) == bridge::ipc::microphone::Result::stale);
  REQUIRE(session.submit({2, 0, true, pcm}) == bridge::ipc::microphone::Result::unavailable);
  REQUIRE(session.pump(20300) == MicrophonePump::delivered);
  REQUIRE(session.published_state()->epoch == 2);
  REQUIRE(std::all_of(host.writes.back().begin() + 1, host.writes.back().end(),
                      [](BYTE value) { return value == 0; }));
  REQUIRE(session.stats()->source.capture_resets == 1);
  REQUIRE(session.retire(20400) == MicrophoneRetirement::done);
  REQUIRE(session.stats()->resources_retired);
  REQUIRE_FALSE(session.published_state());
  REQUIRE(session.submit({2, 0, true, pcm}) == bridge::ipc::microphone::Result::unavailable);
  REQUIRE(session.pump(20500) == MicrophonePump::invalid);
  UINT late = ERROR_INTERNAL_ERROR;
  std::thread thread([&] { late = host.close(); });
  thread.join();
  REQUIRE(late == CHANNEL_RC_OK);
}

TEST_CASE(
    "Microphone session retains failed listener for finite owner retries and disables source") {
  Fixture fixture;
  bool admitted = true;
  const auto send = [](void *owner, bridge::ipc::Kind, ::bridge::compat::span<const BYTE>) {
    return *static_cast<bool *>(owner);
  };
  MicrophoneSession session(*fixture.context, send, &admitted, 20000);
  Host host(fixture);
  host.general_loader = true;
  host.verify_fixture_source = false;
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(session.pump(0) == MicrophonePump::delivered);
  host.destroy_failures = 1;
  REQUIRE(session.retire(100) == MicrophoneRetirement::pending);
  REQUIRE(host.destroy_attempts == 1);
  REQUIRE_FALSE(session.stats()->source.opened);
  REQUIRE_FALSE(session.published_state());
  REQUIRE(session.retire(101) == MicrophoneRetirement::done);
  REQUIRE(host.destroy_attempts == 2);
  REQUIRE(session.stats()->close_attempts == 2);
  REQUIRE(session.stats()->resources_retired);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}

TEST_CASE(
    "AUDIN input authority follows admitted microphone status and rechecks actual reset epoch") {
  Fixture fixture;
  AudinRegistration registration(*fixture.context, fixture.source);
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) == CHANNEL_RC_OK);
  Host host(fixture, false, false, &registration);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  CaptureStatePublisher publisher(true);
  bool admitted = true;
  const auto send = [](void *owner, bridge::ipc::Kind kind, ::bridge::compat::span<const BYTE> bytes) {
    REQUIRE(kind == bridge::ipc::Kind::microphone_state);
    REQUIRE(bridge::ipc::microphone::decode_state(bytes).enabled);
    return *static_cast<bool *>(owner);
  };
  using Availability = bridge::ipc::audio::Availability;
  REQUIRE(publisher.observe(Availability::waiting, 0, 0));
  REQUIRE(publisher.publish(send, &admitted) == CapturePublication::published);
  negotiate(host);
  auto &gate = registration.gate();
  REQUIRE(gate.ready());
  admitted = false;
  REQUIRE(publisher.observe(Availability::ready, fixture.source.stats()->epoch, 100));
  REQUIRE(publisher.publish(send, &admitted) == CapturePublication::busy);
  CaptureHandoff handoff;
  std::vector<BYTE> pcm(3840, 0x21);
  const auto packet = bridge::ipc::microphone::encode_pcm({1, 0, true, pcm});
  auto authority = *publisher.published();
  REQUIRE(handoff.enqueue(1, packet, 100, authority.epoch,
                          authority.availability == Availability::ready) ==
          bridge::ipc::microphone::Result::unavailable);
  admitted = true;
  REQUIRE(publisher.publish(send, &admitted) == CapturePublication::published);
  authority = *publisher.published();
  REQUIRE_FALSE(handoff.enqueue(2, packet, 101, authority.epoch,
                                authority.availability == Availability::ready));
  REQUIRE(gate.reset_capture(1).status == AudinCaptureResetStatus::reset);
  REQUIRE(handoff
              .service(102, fixture.source.stats()->epoch, gate.ready(), submit_capture,
                       &fixture.source)
              ->result == bridge::ipc::microphone::Result::stale);
  admitted = false;
  REQUIRE(publisher.observe(Availability::ready, fixture.source.stats()->epoch, 103));
  REQUIRE(publisher.publish(send, &admitted) == CapturePublication::busy);
  const auto fresh = bridge::ipc::microphone::encode_pcm({2, 0, true, pcm});
  REQUIRE(handoff.enqueue(3, fresh, 104, publisher.published()->epoch, true) ==
          bridge::ipc::microphone::Result::stale);
  admitted = true;
  REQUIRE(publisher.publish(send, &admitted) == CapturePublication::published);
  REQUIRE_FALSE(handoff.enqueue(4, fresh, 105, publisher.published()->epoch, true));
  REQUIRE(handoff
              .service(106, fixture.source.stats()->epoch, gate.ready(), submit_capture,
                       &fixture.source)
              ->result == bridge::ipc::microphone::Result::accepted);
  REQUIRE(handoff.retire());
  REQUIRE(publisher.retire());
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}

TEST_CASE(
    "AUDIN capture handoff transfers bounded IPC PCM to the RDP owner and rejects reset races") {
  Fixture fixture;
  AudinRegistration registration(*fixture.context, fixture.source);
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) == CHANNEL_RC_OK);
  Host host(fixture, false, false, &registration);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  auto &gate = registration.gate();
  CaptureHandoff handoff;
  std::mutex mutex;
  std::vector<BYTE> samples(3840, 0x41);
  for (std::uint64_t packet = 0; packet < 3; ++packet) {
    const auto wire =
        bridge::ipc::microphone::encode_pcm({1, packet * 20000, packet == 0, samples});
    const auto epoch = fixture.source.stats()->epoch;
    const auto ready = gate.ready();
    std::optional<bridge::ipc::microphone::Result> queued;
    std::thread producer([&] {
      std::lock_guard lock(mutex);
      queued = handoff.enqueue(packet + 1, wire, packet * 20000, epoch, ready);
    });
    producer.join();
    REQUIRE_FALSE(queued);
    if (packet == 2)
      REQUIRE(gate.reset_capture(1).status == AudinCaptureResetStatus::reset);
    std::optional<CaptureCompletion> completed;
    {
      std::lock_guard lock(mutex);
      completed = handoff.service(packet * 20000 + 1, fixture.source.stats()->epoch, gate.ready(),
                                  submit_capture, &fixture.source);
    }
    REQUIRE(completed);
    REQUIRE(completed->request_id == packet + 1);
    REQUIRE(completed->result == (packet == 2 ? bridge::ipc::microphone::Result::stale
                                              : bridge::ipc::microphone::Result::accepted));
    REQUIRE(gate.tick(packet * 20000) == AudinScheduledStatus::delivered);
    if (packet == 1)
      REQUIRE(host.writes.back()[1] == 0x41);
    else
      REQUIRE(std::all_of(host.writes.back().begin() + 1, host.writes.back().end(),
                          [](BYTE value) { return value == 0; }));
  }
  REQUIRE(handoff.stats().accepted == 2);
  REQUIRE(handoff.stats().stale == 1);
  REQUIRE(handoff.stats().owned_bytes == 0);
  REQUIRE(handoff.retire());
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}

TEST_CASE("AUDIN capture reset wipes queued samples without reopening the negotiated channel") {
  Fixture fixture;
  AudinRegistration registration(*fixture.context, fixture.source);
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) == CHANNEL_RC_OK);
  Host host(fixture, false, false, &registration);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  auto &gate = registration.gate();
  std::vector<BYTE> input(3840, 0x35);
  REQUIRE(fixture.source.submit({1, 0, true, input}) == CaptureStatus::accepted);
  REQUIRE(fixture.source.submit({1, 20000, false, input}) == CaptureStatus::accepted);
  REQUIRE(gate.tick(1000) == AudinScheduledStatus::delivered);
  REQUIRE(host.writes.back()[1] == 0x35);
  REQUIRE(gate.capture_deadline() == 21000);
  REQUIRE(gate.reset_capture(0).status == AudinCaptureResetStatus::invalid);
  REQUIRE(gate.reset_capture(2).status == AudinCaptureResetStatus::stale);
  REQUIRE(gate.capture_deadline() == 21000);
  REQUIRE(fixture.source.stats()->capture.queue.queued_frames == 960);
  const auto count = host.writes.size();
  const auto reset = gate.reset_capture(1);
  REQUIRE(reset.status == AudinCaptureResetStatus::reset);
  REQUIRE(reset.epoch == 2);
  REQUIRE(gate.ready());
  REQUIRE(host.writes.size() == count); // No forged Open/FormatChange reply.
  REQUIRE_FALSE(gate.capture_deadline());
  REQUIRE(fixture.source.stats()->capture.queue.queued_frames == 0);
  REQUIRE(gate.tick(2000) == AudinScheduledStatus::delivered);
  REQUIRE(host.writes.size() == count + 2);
  REQUIRE(std::all_of(host.writes.back().begin() + 1, host.writes.back().end(),
                      [](BYTE v) { return v == 0; }));
  REQUIRE(gate.capture_deadline() == 22000);
  REQUIRE(fixture.source.submit({1, 40000, false, input}) == CaptureStatus::stale);
  REQUIRE(fixture.source.submit({2, 0, true, input}) == CaptureStatus::accepted);
  REQUIRE(fixture.source.submit({2, 20000, false, input}) == CaptureStatus::accepted);
  REQUIRE(gate.reset_capture(1).status == AudinCaptureResetStatus::stale);
  REQUIRE(fixture.source.stats()->capture.queue.queued_frames == 1920);
  REQUIRE(gate.tick(22000) == AudinScheduledStatus::delivered);
  REQUIRE(host.writes.back()[1] == 0x35);
  REQUIRE(host.send({7, 1, 0, 0, 0}) == CHANNEL_RC_OK);
  REQUIRE(fixture.source.stats()->epoch == 3);
  REQUIRE(gate.reset_capture(2).status == AudinCaptureResetStatus::stale);
  REQUIRE_FALSE(gate.capture_deadline());
  REQUIRE(gate.tick(22000) == AudinScheduledStatus::delivered);
  REQUIRE(host.writes.back().size() == 1921);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(gate.reset_capture(3).status == AudinCaptureResetStatus::inactive);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}

TEST_CASE("AUDIN capture reset refuses reentrant and foreign queue mutation") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Host host(fixture, false, true);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  host.reset_during_write = true;
  REQUIRE(host.gate.tick(0) == AudinScheduledStatus::delivered);
  REQUIRE(host.nested_reset.status == AudinCaptureResetStatus::busy);
  REQUIRE(host.nested_reset.epoch == 0);
  REQUIRE(fixture.source.stats()->epoch == 1);
  AudinCaptureReset foreign{AudinCaptureResetStatus::reset};
  std::thread thread([&] { foreign = host.gate.reset_capture(1); });
  thread.join();
  REQUIRE(foreign.status == AudinCaptureResetStatus::inactive);
  REQUIRE(foreign.epoch == 0);
  REQUIRE(host.gate.capture_deadline() == 20000);
  REQUIRE(fixture.source.stats()->epoch == 1);
  REQUIRE(host.close() == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
}

TEST_CASE("AUDIN scheduled capture skips stale PCM and emits one pair without bursts") {
  Fixture fixture;
  AudinRegistration registration(*fixture.context, fixture.source);
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) == CHANNEL_RC_OK);
  Host host(fixture, false, false, &registration);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  auto &gate = registration.gate();
  REQUIRE(gate.tick(0) == AudinScheduledStatus::inactive);
  negotiate(host);
  for (unsigned packet = 0; packet < 6; ++packet) {
    std::vector<BYTE> input(3840, static_cast<BYTE>(packet + 1));
    REQUIRE(fixture.source.submit({1, packet * 20000ULL, packet == 0, input}) ==
            CaptureStatus::accepted);
  }
  REQUIRE(gate.tick(0) == AudinScheduledStatus::delivered);
  REQUIRE(host.writes.size() == 7);
  REQUIRE(host.writes.back()[1] == 1);
  REQUIRE(gate.capture_deadline() == 20000);
  REQUIRE(gate.tick(19999) == AudinScheduledStatus::waiting);
  REQUIRE(host.writes.size() == 7);
  REQUIRE(gate.tick(85000) == AudinScheduledStatus::delivered);
  REQUIRE(host.writes.size() == 9);
  REQUIRE(host.writes.back()[1] == 5);
  REQUIRE(gate.cadence_stats()->skipped_frames == 2880);
  REQUIRE(fixture.source.stats()->capture.queue.playback_skipped_frames == 2880);
  REQUIRE(gate.tick(85000) == AudinScheduledStatus::waiting);
  REQUIRE(host.writes.size() == 9);
  REQUIRE(host.send({7, 1, 0, 0, 0}) == CHANNEL_RC_OK);
  REQUIRE(gate.tick(85000) == AudinScheduledStatus::delivered);
  REQUIRE(host.writes.size() == 12); // One format reply plus one new-epoch PCM pair.
  REQUIRE(host.writes.back().size() == 1921);
  REQUIRE(std::all_of(host.writes.back().begin() + 1, host.writes.back().end(),
                      [](BYTE v) { return v == 0; }));
  REQUIRE(gate.capture_deadline() == 105000);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE_FALSE(gate.capture_deadline());
  REQUIRE(gate.tick(105000) == AudinScheduledStatus::inactive);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}

TEST_CASE("AUDIN scheduled capture stops on backward clock or failed transport") {
  for (const bool transport_failure : {false, true}) {
    Fixture fixture;
    REQUIRE(fixture.bind() == CHANNEL_RC_OK);
    Host host(fixture, false, true);
    REQUIRE(host.install() == CHANNEL_RC_OK);
    host.open();
    negotiate(host);
    REQUIRE(host.gate.tick(1000) == AudinScheduledStatus::delivered);
    if (transport_failure)
      host.write_status = ERROR_INTERNAL_ERROR;
    REQUIRE(host.gate.tick(transport_failure ? 21000 : 999) == AudinScheduledStatus::failed);
    REQUIRE_FALSE(host.gate.ready());
    REQUIRE_FALSE(fixture.source.stats()->opened);
    const auto count = host.writes.size();
    REQUIRE(host.gate.tick(41000) == AudinScheduledStatus::inactive);
    REQUIRE(host.writes.size() == count);
    REQUIRE(host.close() == CHANNEL_RC_OK);
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  }
}

TEST_CASE("AUDIN scheduled capture refuses foreign or reentrant mutation of its clock and queue") {
  Fixture fixture;
  AudinRegistration registration(*fixture.context, fixture.source);
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) == CHANNEL_RC_OK);
  Host host(fixture, false, false, &registration);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  host.tick_during_write = true;
  auto &gate = registration.gate();
  REQUIRE(gate.tick(0) == AudinScheduledStatus::delivered);
  REQUIRE(host.nested_tick == AudinScheduledStatus::inactive);
  REQUIRE(gate.cadence_stats()->callbacks == 1);
  REQUIRE(gate.capture_deadline() == 20000);
  AudinScheduledStatus foreign = AudinScheduledStatus::delivered;
  CaptureStatus skipped = CaptureStatus::accepted;
  bool deadline = true, stats = true;
  std::thread thread([&] {
    foreign = gate.tick(1000000);
    skipped = fixture.source.skip(960);
    deadline = gate.capture_deadline().has_value();
    stats = gate.cadence_stats().has_value();
  });
  thread.join();
  REQUIRE(foreign == AudinScheduledStatus::inactive);
  REQUIRE(skipped == CaptureStatus::inactive);
  REQUIRE_FALSE(deadline);
  REQUIRE_FALSE(stats);
  REQUIRE(gate.capture_deadline() == 20000);
  REQUIRE(gate.cadence_stats()->skipped_frames == 0);
  REQUIRE(gate.tick(20000) == AudinScheduledStatus::delivered);
  REQUIRE(host.writes.size() == 9);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}

TEST_CASE("AUDIN scoped channel loads guarded fixed backend and retires before delayed host") {
  Fixture fixture;
  AudinRegistration registration(*fixture.context, fixture.source);
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) == CHANNEL_RC_OK);
  std::copy_n("sys:winmm", sizeof("sys:winmm"), fixture.selection); // Host selection is ignored.
  Host host(fixture, false, false, &registration);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(registration.gate().ready());
  REQUIRE(registration.gate().pump() == AudinPumpStatus::delivered);
  REQUIRE(host.writes.back().size() == 3841);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(registration.retired());
  REQUIRE(fixture.source.retired());
  REQUIRE(host.destroyed == 1);
  REQUIRE_FALSE(host.listener_callback);
  UINT closed = ERROR_INTERNAL_ERROR;
  std::thread late([&] { closed = host.close(); });
  late.join();
  REQUIRE(closed == CHANNEL_RC_OK);
  REQUIRE(host.destroyed == 1);
}
TEST_CASE("AUDIN scoped channel retires partial listener creation without retrying Initialize") {
  for (const bool partial : {false, true}) {
    Fixture fixture;
    AudinRegistration registration(*fixture.context, fixture.source);
    REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) ==
            CHANNEL_RC_OK);
    Host host(fixture, false, false, &registration);
    host.listener_status = CHANNEL_RC_NOT_CONNECTED;
    host.return_listener = partial;
    REQUIRE(host.install() == CHANNEL_RC_OK);
    REQUIRE(host.plugin->Initialize(host.plugin, &host.manager.api) == CHANNEL_RC_NOT_CONNECTED);
    REQUIRE(host.plugin->Initialize(host.plugin, &host.manager.api) == ERROR_INVALID_STATE);
    REQUIRE_FALSE(registration.gate().ready());
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
    REQUIRE(registration.retired());
    REQUIRE(host.destroyed == (partial ? 1U : 0U));
    REQUIRE(host.close() == CHANNEL_RC_OK);
  }
}
TEST_CASE(
    "AUDIN scoped channel consumes uncertain host registration and preserves cached wrapper") {
  for (const bool throws : {false, true}) {
    Fixture fixture;
    AudinRegistration registration(*fixture.context, fixture.source);
    REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) ==
            CHANNEL_RC_OK);
    Host host(fixture, false, false, &registration);
    host.retain_failed_registration = true;
    host.register_status = CHANNEL_RC_NOT_CONNECTED;
    host.register_throws = throws;
    const UINT expected = throws ? ERROR_INTERNAL_ERROR : CHANNEL_RC_NOT_CONNECTED;
    REQUIRE(host.install() == expected);
    REQUIRE(host.plugin);
    REQUIRE(registration.retired());
    REQUIRE(fixture.source.retired());
    REQUIRE(host.plugin->Initialize(host.plugin, &host.manager.api) == ERROR_INVALID_STATE);
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
    REQUIRE(host.close() == CHANNEL_RC_OK);
  }
}
TEST_CASE("AUDIN scoped channel retains failed listener handle and retries once per owner close") {
  for (const bool throws : {false, true}) {
    Fixture fixture;
    AudinRegistration registration(*fixture.context, fixture.source);
    REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) ==
            CHANNEL_RC_OK);
    Host host(fixture, false, false, &registration);
    REQUIRE(host.install() == CHANNEL_RC_OK);
    host.open();
    negotiate(host);
    auto *listener = host.listener_callback;
    host.destroy_failures = 2;
    host.destroy_throws = throws;
    const UINT expected = throws ? ERROR_INTERNAL_ERROR : CHANNEL_RC_NOT_CONNECTED;
    REQUIRE(fixture.provider.close() == expected);
    REQUIRE_FALSE(registration.retired());
    REQUIRE(fixture.source.retired());
    REQUIRE(host.destroy_attempts == 1);
    REQUIRE(host.listener_callback == listener);
    BOOL accepted = TRUE;
    IWTSVirtualChannelCallback *callback = host.callback;
    REQUIRE(listener->OnNewChannelConnection(listener, &host.channel.api, nullptr, &accepted,
                                             &callback) == ERROR_INVALID_STATE);
    REQUIRE_FALSE(accepted);
    REQUIRE_FALSE(callback);
    REQUIRE(fixture.provider.close() == expected);
    REQUIRE(host.destroy_attempts == 2);
    REQUIRE_FALSE(registration.retired());
    REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
    REQUIRE(host.destroy_attempts == 3);
    REQUIRE(host.destroyed == 1);
    REQUIRE(registration.retired());
    REQUIRE(host.close() == CHANNEL_RC_OK);
    REQUIRE(host.destroy_attempts == 3);
  }
}
TEST_CASE(
    "AUDIN scoped channel detaches before silence capture and preserves controller teardown") {
  Fixture fixture;
  AudinRegistration registration(*fixture.context, fixture.source);
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) == CHANNEL_RC_OK);
  Host host(fixture, false, false, &registration);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  REQUIRE(host.plugin->Detached(host.plugin) == CHANNEL_RC_OK);
  REQUIRE_FALSE(registration.gate().ready());
  REQUIRE_FALSE(fixture.source.stats()->opened);
  REQUIRE(registration.gate().pump() == AudinPumpStatus::inactive);
  REQUIRE(host.writes.size() == 5);
  REQUIRE(host.plugin->Attached(host.plugin) == CHANNEL_RC_OK);
  REQUIRE_FALSE(registration.gate().ready()); // No same-plugin DVC reopen/resume is claimed.
  REQUIRE(host.plugin->Disconnected(host.plugin, 0) == CHANNEL_RC_OK);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}
TEST_CASE("AUDIN scoped channel blocks plugin termination inside transport callback") {
  Fixture fixture;
  AudinRegistration registration(*fixture.context, fixture.source);
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) == CHANNEL_RC_OK);
  Host host(fixture, false, false, &registration);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  negotiate(host);
  host.terminate_during_write = true;
  REQUIRE(registration.gate().pump() == AudinPumpStatus::delivered);
  REQUIRE(host.nested_termination == ERROR_INVALID_STATE);
  REQUIRE_FALSE(registration.retired());
  REQUIRE(registration.gate().ready());
  host.terminate_during_write = false;
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}
TEST_CASE(
    "AUDIN scoped channel protects preflight ownership and rejects foreign plugin callbacks") {
  Fixture fixture;
  AudinRegistration registration(*fixture.context, fixture.source);
  REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) == CHANNEL_RC_OK);
  Host host(fixture, false, false, &registration);
  host.retire_during_probe = true;
  REQUIRE(host.install() == CHANNEL_RC_OK);
  REQUIRE(host.probe_retirement == ERROR_INVALID_STATE);
  REQUIRE_FALSE(registration.retired());
  host.retire_during_probe = false;
  host.open();
  negotiate(host);
  UINT detached = CHANNEL_RC_OK, terminated = CHANNEL_RC_OK;
  std::thread foreign([&] {
    detached = host.plugin->Detached(host.plugin);
    terminated = host.plugin->Terminated(host.plugin);
  });
  foreign.join();
  REQUIRE(detached == ERROR_INVALID_STATE);
  REQUIRE(terminated == ERROR_INVALID_STATE);
  REQUIRE(registration.gate().ready());
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
  REQUIRE(host.close() == CHANNEL_RC_OK);
}
TEST_CASE("AUDIN scoped channel composes guarded registration with RDPSND in either order") {
  for (const bool microphone_first : {false, true}) {
    Fixture fixture;
    AudinRegistration registration(*fixture.context, fixture.source);
    RdpsndSink sink;
    RdpsndProvider sound;
    if (microphone_first) {
      REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) ==
              CHANNEL_RC_OK);
      REQUIRE(sound.bind(*fixture.context, sink) == CHANNEL_RC_OK);
    } else {
      REQUIRE(sound.bind(*fixture.context, sink) == CHANNEL_RC_OK);
      REQUIRE(fixture.provider.bind(*fixture.context, fixture.source, &registration) ==
              CHANNEL_RC_OK);
    }
    Host host(fixture, false, false, &registration);
    REQUIRE(host.install() == CHANNEL_RC_OK);
    host.open();
    negotiate(host);
    REQUIRE(registration.gate().pump() == AudinPumpStatus::delivered);
    if (microphone_first) {
      REQUIRE(fixture.provider.close() == ERROR_INVALID_STATE);
      REQUIRE_FALSE(registration.retired());
      REQUIRE(sound.close() == CHANNEL_RC_OK);
      REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
    } else {
      REQUIRE(sound.close() == ERROR_INVALID_STATE);
      REQUIRE_FALSE(sink.retired());
      REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
      REQUIRE(sound.close() == CHANNEL_RC_OK);
    }
    REQUIRE(host.close() == CHANNEL_RC_OK);
  }
}
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
TEST_CASE("AUDIN negotiation diagnostics preserve validated lifecycle counts through close") {
  Fixture fixture;
  REQUIRE(fixture.bind() == CHANNEL_RC_OK);
  Host host(fixture, false, true);
  REQUIRE(host.gate.negotiation_stats()->channels == 0);
  REQUIRE(host.install() == CHANNEL_RC_OK);
  host.open();
  REQUIRE(host.gate.negotiation_stats()->channels == 1);
  REQUIRE(host.gate.negotiation_stats()->versions == 0);
  negotiate(host);
  const auto active = host.gate.negotiation_stats();
  REQUIRE(active);
  REQUIRE(active->versions == 1);
  REQUIRE(active->offers == 1);
  REQUIRE(active->server_formats == 2);
  REQUIRE(active->client_formats == 2);
  REQUIRE(active->opens == 1);
  REQUIRE(active->refused == 0);
  REQUIRE(active->recording == 1);
  REQUIRE(active->failures == 0);
  REQUIRE(host.send({7, 1, 0, 0, 0}) == CHANNEL_RC_OK);
  REQUIRE(host.gate.negotiation_stats()->recording == 2);
  REQUIRE(host.send({7, 99, 0, 0, 0}) == ERROR_INVALID_DATA);
  REQUIRE(host.gate.negotiation_stats()->failures == 1);
  REQUIRE(host.close() == CHANNEL_RC_OK);
  REQUIRE(host.gate.negotiation_stats()->offers == 1);
  REQUIRE(host.gate.negotiation_stats()->client_formats == 2);
  REQUIRE(host.gate.negotiation_stats()->recording == 2);
  REQUIRE(host.gate.negotiation_stats()->failures == 1);
  REQUIRE(fixture.provider.close() == CHANNEL_RC_OK);
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
  REQUIRE(host.gate.negotiation_stats()->server_formats == 2);
  REQUIRE(host.gate.negotiation_stats()->client_formats == 0);
  REQUIRE(host.gate.negotiation_stats()->opens == 0);
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
  std::optional<AudinNegotiationStats> foreign_stats;
  std::thread thread([&] {
    foreign_stats = host.gate.negotiation_stats();
    close = host.callback->OnClose(host.callback);
    retire = host.gate.retire();
    pumped = host.gate.pump();
  });
  thread.join();
  REQUIRE(close == ERROR_INVALID_STATE);
  REQUIRE(retire == ERROR_INVALID_STATE);
  REQUIRE(pumped == AudinPumpStatus::inactive);
  REQUIRE_FALSE(foreign_stats);
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
    REQUIRE(::bridge::compat::bit_cast<PFREERDP_AUDIN_DEVICE_ENTRY>(raw)(nullptr) == ERROR_INVALID_STATE);
  }
  const auto dynamic = freerdp_load_channel_addin_entry(AUDIN_CHANNEL_NAME, nullptr, nullptr,
                                                        FREERDP_ADDIN_CHANNEL_DYNAMIC);
  REQUIRE(dynamic);
  REQUIRE(::bridge::compat::bit_cast<PDVC_PLUGIN_ENTRY>(dynamic)(nullptr) == ERROR_NOT_SUPPORTED);
  const auto legacy = freerdp_load_channel_addin_entry(AUDIN_CHANNEL_NAME, nullptr, nullptr,
                                                       FREERDP_ADDIN_CHANNEL_STATIC);
  REQUIRE(legacy);
  REQUIRE_FALSE(legacy(nullptr));
  const auto ex = freerdp_load_channel_addin_entry(AUDIN_CHANNEL_NAME, nullptr, nullptr,
                                                   FREERDP_ADDIN_CHANNEL_STATIC |
                                                       FREERDP_ADDIN_CHANNEL_ENTRYEX);
  REQUIRE(ex);
  REQUIRE_FALSE(::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(ex)(nullptr, nullptr));
  Registrar registrar;
  auto args = points(fixture, registrar);
  auto entry = fixture.entry();
  UINT foreign = CHANNEL_RC_OK, close = CHANNEL_RC_OK;
  bool nonnull = false;
  std::thread thread([&] {
    const auto raw = freerdp_load_channel_addin_entry(AUDIN_CHANNEL_NAME, "browser", nullptr, 0);
    nonnull = raw != nullptr;
    foreign = raw ? ::bridge::compat::bit_cast<PFREERDP_AUDIN_DEVICE_ENTRY>(raw)(&args) : CHANNEL_RC_OK;
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
