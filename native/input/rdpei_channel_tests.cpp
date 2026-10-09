#include "rdpei.hpp"
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
  ChannelFixture() {
    try {
      initialize();
    } catch (...) {
      (void)close();
      throw;
    }
  }
  void initialize() {
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
      *listener = &f.listener;
      return CHANNEL_RC_OK;
    };
    manager.api.DestroyListener = [](IWTSVirtualChannelManager *m, IWTSListener *) -> UINT {
      Interface<IWTSVirtualChannelManager>::get(m).listener_callback = nullptr;
      return CHANNEL_RC_OK;
    };
    channel.api.Write = [](IWTSVirtualChannel *c, ULONG size, const BYTE *bytes, void *) -> UINT {
      auto &f = Interface<IWTSVirtualChannel>::get(c);
      if (f.write_status != CHANNEL_RC_OK)
        return f.write_status;
      if (!bytes || size > f.writes[0].size() || f.count == f.writes.size())
        return ERROR_INVALID_DATA;
      std::memcpy(f.writes[f.count].data(), bytes, size);
      f.lengths[f.count++] = size;
      return CHANNEL_RC_OK;
    };
    const auto entry = freerdp_channels_load_static_addin_entry(
        RDPEI_CHANNEL_NAME, nullptr, nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC);
    REQUIRE(entry);
    REQUIRE(std::bit_cast<PDVC_PLUGIN_ENTRY>(entry)(&entries.api) == CHANNEL_RC_OK);
    REQUIRE(plugin);
    REQUIRE(plugin->Initialize(plugin, &manager.api) == CHANNEL_RC_OK);
    rdpei = static_cast<RdpeiClientContext *>(listener.pInterface);
    REQUIRE(rdpei);
  }
  ~ChannelFixture() { (void)close(); }
  bool open() {
    BOOL accepted = TRUE;
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
