#include "dvc_gate.hpp"
#include "rdpei.hpp"
#include "rdpei_plugin.hpp"
#include <algorithm>
#include <array>
#include <bit>
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <cstring>
#include <freerdp/channels/channels.h>
#include <freerdp/client.h>
#include <freerdp/client/channels.h>
#include <freerdp/dvc.h>
#include <memory>
#include <span>
#include <thread>
#include <type_traits>
#include <winpr/error.h>
#include <winpr/stream.h>
using namespace bridge::touch;
static_assert(State::max_contacts == FREERDP_MAX_TOUCH_CONTACTS);
namespace {
struct ChannelFixture;
template <class Api> struct Interface {
  Api api{};
  ChannelFixture *owner;
  explicit Interface(ChannelFixture *value) : owner(value) {}
  static ChannelFixture &get(Api *api) {
    static_assert(std::is_standard_layout_v<Interface>);
    return *reinterpret_cast<Interface *>(api)->owner;
  }
};
// Uses the actual linked addin and public DVC ABI. Only the transport endpoint is fake.
struct ChannelFixture {
  DvcGate gate; // Outlives delegated callback/plugin cleanup in close().
  PluginRegistration registration;
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{
      nullptr, freerdp_client_context_free};
  Interface<IDRDYNVC_ENTRY_POINTS> entries{this};
  Interface<IWTSVirtualChannelManager> manager{this};
  Interface<IWTSVirtualChannel> channel{this};
  IWTSListener listener{};
  IWTSListenerCallback *listener_callback = nullptr;
  IWTSVirtualChannelCallback *callback = nullptr;
  IWTSPlugin *plugin = nullptr;
  RdpeiClientContext *rdpei = nullptr;
  std::array<std::array<BYTE, 1024>, 8> writes{};
  std::array<std::size_t, 8> lengths{};
  std::size_t count = 0;
  UINT write_status = CHANNEL_RC_OK;
  UINT listener_status = CHANNEL_RC_OK, initialize_status = CHANNEL_RC_OK;
  unsigned destroyed_listeners = 0;
  bool return_listener = true, terminate_during_write = false;
  UINT nested_termination = CHANNEL_RC_OK;
  ChannelFixture(bool managed = false, UINT status = CHANNEL_RC_OK, bool partial = true)
      : listener_status(status), return_listener(partial) {
    try {
      initialize(managed);
    } catch (...) {
      (void)close();
      throw;
    }
  }
  void initialize(bool managed) {
    RDP_CLIENT_ENTRY_POINTS client{};
    client.Size = sizeof(client);
    client.Version = RDP_CLIENT_INTERFACE_VERSION;
    client.ContextSize = sizeof(rdpClientContext);
    context.reset(freerdp_client_context_new(&client));
    REQUIRE(context);
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_SynchronousDynamicChannels, TRUE));
    REQUIRE(freerdp_settings_set_bool(context->settings, FreeRDP_SuspendInput, FALSE));
    entries.api.GetPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *) -> IWTSPlugin * {
      return Interface<IDRDYNVC_ENTRY_POINTS>::get(p).plugin;
    };
    entries.api.RegisterPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *name,
                                    IWTSPlugin *plugin) -> UINT {
      if (!name || std::strcmp(name, RDPEI_DVC_CHANNEL_NAME))
        return ERROR_INVALID_DATA;
      Interface<IDRDYNVC_ENTRY_POINTS>::get(p).plugin = plugin;
      return CHANNEL_RC_OK;
    };
    entries.api.GetRdpSettings = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpSettings * {
      return Interface<IDRDYNVC_ENTRY_POINTS>::get(p).context->settings;
    };
    entries.api.GetRdpContext = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpContext * {
      return Interface<IDRDYNVC_ENTRY_POINTS>::get(p).context.get();
    };
    manager.api.CreateListener = [](IWTSVirtualChannelManager *m, const char *name, ULONG,
                                    IWTSListenerCallback *callback,
                                    IWTSListener **listener) -> UINT {
      if (!name || std::strcmp(name, RDPEI_DVC_CHANNEL_NAME))
        return ERROR_INVALID_DATA;
      auto &f = Interface<IWTSVirtualChannelManager>::get(m);
      f.listener_callback = callback;
      *listener = f.return_listener ? &f.listener : nullptr;
      return f.listener_status;
    };
    manager.api.DestroyListener = [](IWTSVirtualChannelManager *m, IWTSListener *) -> UINT {
      auto &f = Interface<IWTSVirtualChannelManager>::get(m);
      f.listener_callback = nullptr;
      ++f.destroyed_listeners;
      return CHANNEL_RC_OK;
    };
    channel.api.Write = [](IWTSVirtualChannel *c, ULONG size, const BYTE *bytes, void *) -> UINT {
      auto &f = Interface<IWTSVirtualChannel>::get(c);
      if (f.terminate_during_write)
        f.nested_termination = f.plugin->Terminated(f.plugin);
      if (f.write_status != CHANNEL_RC_OK)
        return f.write_status;
      if (!bytes || size > f.writes[0].size() || f.count == f.writes.size())
        return ERROR_INVALID_DATA;
      std::memcpy(f.writes[f.count].data(), bytes, size);
      f.lengths[f.count++] = size;
      return CHANNEL_RC_OK;
    };
    if (managed) {
      REQUIRE(registration.install(&entries.api) == CHANNEL_RC_OK);
    } else {
      const auto entry = freerdp_channels_load_static_addin_entry(
          RDPEI_CHANNEL_NAME, nullptr, nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC);
      REQUIRE(entry);
      REQUIRE(std::bit_cast<PDVC_PLUGIN_ENTRY>(entry)(&entries.api) == CHANNEL_RC_OK);
    }
    REQUIRE(plugin);
    initialize_status = plugin->Initialize(plugin, &manager.api);
    if (managed && initialize_status != CHANNEL_RC_OK) {
      rdpei = registration.client();
      return;
    }
    REQUIRE(initialize_status == CHANNEL_RC_OK);
    rdpei = static_cast<RdpeiClientContext *>(listener.pInterface);
    REQUIRE(rdpei);
  }
  ~ChannelFixture() { (void)close(); }
  bool open(bool filtered = false) {
    BOOL accepted = TRUE;
    if (filtered)
      return gate.open(*context, listener_callback, &channel.api, nullptr, &accepted, &callback) ==
                 CHANNEL_RC_OK &&
             accepted && callback;
    return listener_callback->OnNewChannelConnection(listener_callback, &channel.api, nullptr,
                                                     &accepted, &callback) == CHANNEL_RC_OK &&
           accepted && callback;
  }
  bool close() {
    bool ok = true;
    if (callback) {
      ok = callback->OnClose(callback) == CHANNEL_RC_OK;
      callback = nullptr;
    }
    if (plugin) {
      ok = plugin->Terminated(plugin) == CHANNEL_RC_OK && ok;
      plugin = nullptr;
      rdpei = nullptr;
    }
    return ok;
  }
  UINT receive(std::span<BYTE> bytes) {
    const std::unique_ptr<wStream, void (*)(wStream *)> stream(
        Stream_New(bytes.data(), bytes.size()), [](wStream *s) { Stream_Free(s, FALSE); });
    REQUIRE(stream);
    return callback->OnDataReceived(callback, stream.get());
  }
  UINT ready() {
    // SC_READY v1.0, with no v3 feature field. CS_READY is captured by the real addin.
    std::array<BYTE, 10> bytes{1, 0, 10, 0, 0, 0, 0, 0, 1, 0};
    return receive(bytes);
  }
  bool pump() {
    std::this_thread::sleep_for(std::chrono::milliseconds(25));
    return freerdp_channels_check_fds(context->channels, context->instance) != FALSE;
  }
  std::span<const BYTE> packet(std::size_t i) const {
    REQUIRE(i < count);
    return {writes[i].data(), lengths[i]};
  }
};
struct Reader {
  std::span<const BYTE> bytes;
  std::size_t at = 6;
  BYTE byte() {
    REQUIRE(at < bytes.size());
    return bytes[at++];
  }
  std::uint64_t number(unsigned bits, bool signed_value = false) {
    const auto first = byte();
    const unsigned shift = bits == 2 ? 7 : bits == 4 ? 6 : 5;
    const unsigned count = first >> shift;
    const auto mask = static_cast<BYTE>((1U << (shift - unsigned(signed_value))) - 1);
    auto value = std::uint64_t{static_cast<BYTE>(first & mask)};
    for (unsigned i = 0; i < count; ++i)
      value = (value << 8) | byte();
    // Test contacts have positive coordinates; negative rectangle margins are not decoded here.
    REQUIRE_FALSE((signed_value && (first & (1U << (shift - 1)))));
    return value;
  }
};
void check_touch(std::span<const BYTE> bytes, UINT32 flags, UINT32 x, UINT32 y) {
  REQUIRE(bytes.size() >= 6);
  REQUIRE(bytes[0] == 3);
  REQUIRE(bytes[1] == 0);
  const auto length = std::uint32_t{bytes[2]} | (std::uint32_t{bytes[3]} << 8) |
                      (std::uint32_t{bytes[4]} << 16) | (std::uint32_t{bytes[5]} << 24);
  REQUIRE(length == bytes.size());
  Reader reader{bytes};
  (void)reader.number(4);         // encodeTime
  REQUIRE(reader.number(2) == 1); // frameCount
  REQUIRE(reader.number(2) == 1); // contactCount
  (void)reader.number(8);         // frameOffset
  REQUIRE(reader.byte() == 0);    // The real addin allocated contact slot 0.
  REQUIRE(reader.number(2) == CONTACT_DATA_CONTACTRECT_PRESENT);
  REQUIRE(reader.number(4, true) == x);
  REQUIRE(reader.number(4, true) == y);
  REQUIRE(reader.number(4) == flags);
}
} // namespace
TEST_CASE("Real RDPEI addin version and API success do not establish server readiness") {
  ChannelFixture f;
  REQUIRE(f.rdpei->GetVersion(f.rdpei) == RDPINPUT_PROTOCOL_V300);
  REQUIRE(f.count == 0);
  REQUIRE(f.open());
  // No SC_READY has arrived, but the public API already reports success.
  REQUIRE(send_rdpei(f.rdpei, {Action::begin, 1, 20, 30}));
  REQUIRE(f.count == 0);
  REQUIRE(f.close());
}
TEST_CASE("Real RDPEI addin serializes ordered contact transitions after SC_READY") {
  ChannelFixture f;
  REQUIRE(f.open());
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  REQUIRE(f.count == 1);
  const auto ready = f.packet(0);
  REQUIRE(ready.size() == 16);
  REQUIRE(ready[0] == 2);
  REQUIRE(ready[10] == 0);
  REQUIRE(ready[11] == 0);
  REQUIRE(ready[12] == 1);
  REQUIRE(ready[13] == 0);
  REQUIRE(f.rdpei->GetVersion(f.rdpei) == RDPINPUT_PROTOCOL_V10);
  State state;
  const State::Sink sink = [&](const auto &event) { return send_rdpei(f.rdpei, event); };
  REQUIRE(state.apply({Action::begin, 7, 20, 30}, sink, 1920, 1080) == Result::accepted);
  REQUIRE(state.apply({Action::end, 7, 40, 50}, sink, 1920, 1080) == Result::accepted);
  REQUIRE(f.pump());
  REQUIRE(f.count == 4);
  check_touch(f.packet(1),
              RDPINPUT_CONTACT_FLAG_DOWN | RDPINPUT_CONTACT_FLAG_INRANGE |
                  RDPINPUT_CONTACT_FLAG_INCONTACT,
              20, 30);
  check_touch(f.packet(2),
              RDPINPUT_CONTACT_FLAG_UPDATE | RDPINPUT_CONTACT_FLAG_INRANGE |
                  RDPINPUT_CONTACT_FLAG_INCONTACT,
              40, 50);
  check_touch(f.packet(3), RDPINPUT_CONTACT_FLAG_UP, 40, 50);
  REQUIRE(state.active() == 0);
  REQUIRE(f.pump());
  REQUIRE(f.count == 4);
  REQUIRE(f.close());
}
TEST_CASE("Real RDPEI addin cancellation leaves no active periodic contact") {
  ChannelFixture f;
  REQUIRE(f.open());
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  State state;
  const State::Sink sink = [&](const auto &event) { return send_rdpei(f.rdpei, event); };
  REQUIRE(state.apply({Action::begin, 9, 100, 110}, sink, 1920, 1080) == Result::accepted);
  REQUIRE(state.release(sink));
  REQUIRE(f.pump());
  REQUIRE(f.count == 3);
  check_touch(f.packet(2), RDPINPUT_CONTACT_FLAG_UP | RDPINPUT_CONTACT_FLAG_CANCELED, 100, 110);
  REQUIRE(f.pump());
  REQUIRE(f.count == 3);
  REQUIRE(f.close());
}
TEST_CASE("Real RDPEI addin exhausts its pool with OK and a missing contact ID") {
  ChannelFixture f;
  REQUIRE(f.open());
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  // Pinned upstream owns 64 slots; bridge State limits callers to ten before this API.
  for (std::uint32_t id = 0; id < 64; ++id)
    REQUIRE(send_rdpei(f.rdpei, {Action::begin, id, 100, 110}));
  INT32 contact = -2;
  REQUIRE(f.rdpei->TouchRawEvent(f.rdpei, 64, 100, 110, &contact,
                                 RDPINPUT_CONTACT_FLAG_DOWN | RDPINPUT_CONTACT_FLAG_INRANGE |
                                     RDPINPUT_CONTACT_FLAG_INCONTACT,
                                 0) == CHANNEL_RC_OK);
  REQUIRE(contact == -1);
  REQUIRE_FALSE(send_rdpei(f.rdpei, {Action::begin, 64, 100, 110}));
  REQUIRE(f.count == 1); // No pump/no remote transport: only CS_READY has been encoded.
  REQUIRE(f.close());
}
TEST_CASE("Real RDPEI write failure retains bridge cleanup ownership") {
  ChannelFixture f;
  REQUIRE(f.open());
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  State state;
  const State::Sink sink = [&](const auto &event) { return send_rdpei(f.rdpei, event); };
  REQUIRE(state.apply({Action::begin, 5, 100, 110}, sink, 1920, 1080) == Result::accepted);
  f.write_status = ERROR_INTERNAL_ERROR;
  REQUIRE(state.apply({Action::update, 5, 120, 130}, sink, 1920, 1080) == Result::failed);
  REQUIRE(state.active() == 1);
  REQUIRE(state.cleanup_required());
  f.write_status = CHANNEL_RC_OK;
  REQUIRE(state.release(sink));
  REQUIRE(f.pump());
  REQUIRE(state.active() == 0);
  REQUIRE(f.count == 3);
  check_touch(f.packet(2), RDPINPUT_CONTACT_FLAG_UP | RDPINPUT_CONTACT_FLAG_CANCELED, 120, 130);
  REQUIRE(f.close());
}
TEST_CASE("DVC gate becomes ready only after the actual RDPEI readiness exchange") {
  ChannelFixture f;
  REQUIRE_FALSE(f.gate.ready());
  REQUIRE_FALSE(f.gate.negotiated());
  REQUIRE(f.open(true));
  REQUIRE(f.gate.phase() == Phase::handshake);
  REQUIRE_FALSE(f.gate.ready());
  REQUIRE(f.callback->OnOpen(f.callback) == CHANNEL_RC_OK);
  REQUIRE_FALSE(f.gate.ready());
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  REQUIRE(f.gate.ready());
  REQUIRE(f.gate.negotiated() == Negotiated{RDPINPUT_PROTOCOL_V10, 64});
  REQUIRE(f.count == 1);
  REQUIRE(f.close());
  REQUIRE_FALSE(f.gate.ready());
  REQUIRE_FALSE(f.gate.negotiated());
}
TEST_CASE("DVC gate observes real v1.1 v2 v3 and future-server version negotiation") {
  for (const auto version : std::array<std::uint32_t, 4>{
           RDPINPUT_PROTOCOL_V101, RDPINPUT_PROTOCOL_V200, RDPINPUT_PROTOCOL_V300, 0x00040000}) {
    ChannelFixture f;
    REQUIRE(f.open(true));
    std::array<BYTE, 14> bytes{1, 0, 10, 0, 0, 0};
    const std::size_t length = version >= RDPINPUT_PROTOCOL_V300 ? 14 : 10;
    bytes[2] = static_cast<BYTE>(length);
    for (unsigned i = 0; i < 4; ++i)
      bytes[6 + i] = static_cast<BYTE>(version >> (i * 8));
    if (length == 14)
      bytes[10] = SC_READY_MULTIPEN_INJECTION_SUPPORTED;
    REQUIRE(f.receive(std::span(bytes).first(length)) == CHANNEL_RC_OK);
    REQUIRE(f.gate.ready());
    const auto negotiated = f.gate.negotiated();
    REQUIRE(negotiated);
    REQUIRE(negotiated->version == (std::min)(version, std::uint32_t{RDPINPUT_PROTOCOL_V300}));
    REQUIRE(negotiated->contacts == 64);
    REQUIRE(f.count == 1);
    REQUIRE(f.close());
  }
}
TEST_CASE("DVC gate blocks upstream periodic contact frames during server suspension") {
  ChannelFixture f;
  REQUIRE(f.open(true));
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  State state;
  const State::Sink sink = [&](const auto &event) { return send_rdpei(f.rdpei, event); };
  REQUIRE(state.apply({Action::begin, 7, 100, 110}, sink, 1920, 1080) == Result::accepted);
  REQUIRE(f.pump());
  REQUIRE(f.count == 2);
  std::array<BYTE, 6> suspend{4, 0, 6, 0, 0, 0};
  REQUIRE(f.receive(suspend) == CHANNEL_RC_OK);
  REQUIRE(f.gate.phase() == Phase::suspended);
  REQUIRE_FALSE(f.gate.ready());
  REQUIRE(f.gate.negotiated() == Negotiated{RDPINPUT_PROTOCOL_V10, 64});
  REQUIRE(f.pump());
  REQUIRE(f.pump());
  REQUIRE(f.count == 2);
  REQUIRE(f.gate.suppressed_frames() == 2);
  std::array<BYTE, 6> resume{5, 0, 6, 0, 0, 0};
  REQUIRE(f.receive(resume) == CHANNEL_RC_OK);
  REQUIRE(f.gate.ready()); // Transport phase only: the owner still has to release its contact.
  REQUIRE(f.count == 2);   // No suppressed frame is replayed by the gate.
  REQUIRE(state.active() == 1);
  REQUIRE(state.release(sink));
  REQUIRE(f.pump());
  REQUIRE(f.count == 3);
  REQUIRE(f.gate.suppressed_frames() == 2);
  check_touch(f.packet(2), RDPINPUT_CONTACT_FLAG_UP | RDPINPUT_CONTACT_FLAG_CANCELED, 100, 110);
  REQUIRE(f.pump());
  REQUIRE(f.count == 3);
  REQUIRE(f.close());
}
TEST_CASE("DVC gate latches actual CS_READY and pre-handshake periodic write failures") {
  SECTION("CS_READY transport error") {
    const auto fixture = std::make_unique<ChannelFixture>();
    auto &f = *fixture;
    REQUIRE(f.open(true));
    f.write_status = ERROR_INTERNAL_ERROR;
    REQUIRE(f.ready() == ERROR_INTERNAL_ERROR);
    REQUIRE(f.gate.phase() == Phase::failed);
    REQUIRE_FALSE(f.gate.ready());
    REQUIRE_FALSE(f.gate.negotiated());
    REQUIRE(f.count == 0);
    REQUIRE(f.close());
  }
  SECTION("a caller bypasses readiness and queues an early contact") {
    const auto fixture = std::make_unique<ChannelFixture>();
    auto &f = *fixture;
    REQUIRE(f.open(true));
    REQUIRE(send_rdpei(f.rdpei, {Action::begin, 1, 100, 110}));
    REQUIRE_FALSE(f.pump());
    REQUIRE(f.gate.phase() == Phase::failed);
    REQUIRE_FALSE(f.gate.ready());
    REQUIRE(f.count == 0);
    REQUIRE(f.close());
  }
}
TEST_CASE("DVC gate rejects malformed and out-of-phase real server messages before FreeRDP") {
  for (const auto bytes : {std::array<BYTE, 10>{1, 0, 9, 0, 0, 0, 0, 0, 1, 0},
                           {1, 0, 10, 0, 0, 0, 1, 0, 0, 0},
                           {1, 0, 10, 0, 0, 0, 0, 0, 3, 0},
                           {99, 0, 10, 0, 0, 0, 0, 0, 1, 0},
                           {5, 0, 10, 0, 0, 0, 0, 0, 0, 0}}) {
    const auto fixture = std::make_unique<ChannelFixture>();
    auto &f = *fixture;
    REQUIRE(f.open(true));
    auto input = bytes;
    REQUIRE(f.receive(input) == ERROR_INVALID_DATA);
    REQUIRE(f.gate.phase() == Phase::failed);
    REQUIRE(f.count == 0);
    REQUIRE(f.close());
  }
  ChannelFixture f;
  REQUIRE(f.open(true));
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  REQUIRE(f.ready() == ERROR_INVALID_DATA); // Duplicate SC_READY cannot change negotiated state.
  REQUIRE_FALSE(f.gate.ready());
  REQUIRE_FALSE(f.gate.negotiated());
  REQUIRE(f.count == 1);
  REQUIRE(f.close());
}
TEST_CASE(
    "registered public RDPEI wrapper preserves context and routes real handshake and contact") {
  const auto fixture = std::make_unique<ChannelFixture>(true);
  auto &f = *fixture;
  REQUIRE(f.registration.client() == f.rdpei);
  REQUIRE(f.plugin->pInterface == f.rdpei);
  REQUIRE(f.plugin->Connected(f.plugin) == CHANNEL_RC_OK);
  REQUIRE(f.plugin->Attached(f.plugin) == CHANNEL_RC_OK);
  REQUIRE(f.plugin->Detached(f.plugin) == CHANNEL_RC_OK);
  REQUIRE(f.open());
  REQUIRE_FALSE(f.registration.gate().ready());
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  REQUIRE(f.registration.gate().ready());
  REQUIRE(send_rdpei(f.rdpei, {Action::begin, 3, 100, 110}));
  REQUIRE(f.pump());
  check_touch(f.packet(1),
              RDPINPUT_CONTACT_FLAG_DOWN | RDPINPUT_CONTACT_FLAG_INRANGE |
                  RDPINPUT_CONTACT_FLAG_INCONTACT,
              100, 110);
  REQUIRE(send_rdpei(f.rdpei, {Action::cancel, 3, 100, 110}));
  REQUIRE(f.pump());
  check_touch(f.packet(2), RDPINPUT_CONTACT_FLAG_UP | RDPINPUT_CONTACT_FLAG_CANCELED, 100, 110);
  REQUIRE(f.close());
  REQUIRE(f.registration.client() == nullptr);
  REQUIRE_FALSE(f.registration.gate().ready());
  REQUIRE(f.destroyed_listeners == 1);
  REQUIRE(f.pump()); // The actual addin unregisters its periodic pump on termination.
}
TEST_CASE("registered RDPEI wrapper rejects duplicate and replacement channel generations") {
  const auto fixture = std::make_unique<ChannelFixture>(true);
  auto &f = *fixture;
  REQUIRE(f.open());
  BOOL accepted = TRUE;
  IWTSVirtualChannelCallback *replacement = nullptr;
  REQUIRE(f.listener_callback->OnNewChannelConnection(f.listener_callback, &f.channel.api, nullptr,
                                                      &accepted,
                                                      &replacement) == ERROR_INVALID_STATE);
  REQUIRE_FALSE(accepted);
  REQUIRE(replacement == nullptr);
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  REQUIRE(f.plugin->Disconnected(f.plugin, 0) == CHANNEL_RC_OK);
  REQUIRE_FALSE(f.registration.gate().ready());
  REQUIRE(f.callback->OnClose(f.callback) == CHANNEL_RC_OK);
  f.callback = nullptr;
  REQUIRE(f.listener_callback->OnNewChannelConnection(f.listener_callback, &f.channel.api, nullptr,
                                                      &accepted,
                                                      &replacement) == ERROR_INVALID_STATE);
  REQUIRE(f.close());
}
TEST_CASE("registered actual RDPEI addin safely terminates after listener creation failure") {
  for (const bool partial : {false, true}) {
    const auto fixture = std::make_unique<ChannelFixture>(true, ERROR_INTERNAL_ERROR, partial);
    auto &f = *fixture;
    REQUIRE(f.initialize_status == ERROR_INTERNAL_ERROR);
    REQUIRE_FALSE(f.registration.gate().ready());
    REQUIRE_FALSE(f.open()); // A partial host listener cannot activate a failed addin.
    REQUIRE(f.callback == nullptr);
    REQUIRE(f.close());
    REQUIRE(f.destroyed_listeners == (partial ? 1U : 0U));
    REQUIRE(f.pump());
  }
  const auto fixture = std::make_unique<ChannelFixture>(true, CHANNEL_RC_OK, false);
  REQUIRE(fixture->initialize_status == ERROR_INVALID_DATA);
  REQUIRE_FALSE(fixture->open());
  REQUIRE(fixture->close());
}
TEST_CASE("registered RDPEI addin cannot be terminated inside its active transport write") {
  const auto fixture = std::make_unique<ChannelFixture>(true);
  auto &f = *fixture;
  REQUIRE(f.open());
  f.terminate_during_write = true;
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  REQUIRE(f.nested_termination == ERROR_INVALID_STATE);
  REQUIRE(f.registration.client() == f.rdpei);
  REQUIRE(f.registration.gate().ready());
  REQUIRE(f.close());
  REQUIRE(f.destroyed_listeners == 1);
}
