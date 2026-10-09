#include "dvc_gate.hpp"
#include <algorithm>
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <freerdp/channels/rdpei.h>
#include <freerdp/client.h>
#include <memory>
#include <span>
#include <stdexcept>
#include <thread>
#include <winpr/error.h>
#include <winpr/stream.h>
using namespace bridge::touch;
namespace {
enum class Mode {
  normal,
  no_reply,
  wrong_version,
  wrong_flags,
  wrong_count,
  wrong_length,
  error_after_reply,
  throws,
  closes
};
struct Fixture {
  struct ActiveCall {
    bool &active;
    explicit ActiveCall(bool &value) : active(value) { active = true; }
    ~ActiveCall() { active = false; }
  };
  struct Transport {
    IWTSVirtualChannel api{};
    Fixture *owner;
  } transport{{}, this};
  DvcGate gate;
  std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)> context{
      nullptr, freerdp_client_context_free};
  IWTSListenerCallback listener{};
  IWTSVirtualChannelCallback delegate{}, *callback = nullptr;
  IWTSVirtualChannel *wrapped = nullptr;
  BOOL accepted = FALSE, allow = TRUE;
  UINT listener_result = CHANNEL_RC_OK;
  unsigned receives = 0, writes = 0, closes = 0, transport_closes = 0;
  bool ready_during_write = false, ready_before_delegate_return = false;
  bool close_during_write = false, throw_write = false;
  bool delegate_active = false, closed_inside_delegate = false;
  bool close_during_open = false, close_during_bind = false;
  Mode mode = Mode::normal;
  Fixture() {
    RDP_CLIENT_ENTRY_POINTS client{};
    client.Size = sizeof(client);
    client.Version = RDP_CLIENT_INTERFACE_VERSION;
    client.ContextSize = sizeof(rdpClientContext);
    context.reset(freerdp_client_context_new(&client));
    REQUIRE(context);
    boolean(FreeRDP_SynchronousDynamicChannels, TRUE);
    boolean(FreeRDP_AsyncChannels, FALSE);
    boolean(FreeRDP_AsyncUpdate, FALSE);
    listener.pInterface = this;
    delegate.pInterface = this;
    listener.OnNewChannelConnection = [](IWTSListenerCallback *l, IWTSVirtualChannel *c, BYTE *,
                                         BOOL *accepted,
                                         IWTSVirtualChannelCallback **callback) -> UINT {
      auto &f = *static_cast<Fixture *>(l->pInterface);
      f.wrapped = c;
      *accepted = f.allow;
      *callback = &f.delegate;
      if (f.close_during_bind) {
        ActiveCall active(f.delegate_active);
        return f.gate.close();
      }
      return f.listener_result;
    };
    delegate.OnClose = [](IWTSVirtualChannelCallback *c) -> UINT {
      auto &f = *static_cast<Fixture *>(c->pInterface);
      ++f.closes;
      f.closed_inside_delegate = f.delegate_active;
      return CHANNEL_RC_OK;
    };
    delegate.OnOpen = [](IWTSVirtualChannelCallback *c) -> UINT {
      auto &f = *static_cast<Fixture *>(c->pInterface);
      ActiveCall active(f.delegate_active);
      return f.close_during_open ? f.gate.close() : CHANNEL_RC_OK;
    };
    delegate.OnDataReceived = [](IWTSVirtualChannelCallback *c, wStream *s) -> UINT {
      auto &f = *static_cast<Fixture *>(c->pInterface);
      ActiveCall active(f.delegate_active);
      ++f.receives;
      if (f.mode == Mode::throws)
        throw std::runtime_error("fixture");
      if (f.mode == Mode::closes)
        return f.gate.close();
      const auto *bytes = static_cast<const BYTE *>(Stream_Pointer(s));
      if (bytes[0] != 1 || f.mode == Mode::no_reply)
        return CHANNEL_RC_OK;
      std::uint32_t version = 0;
      for (unsigned i = 0; i < 4; ++i)
        version |= std::uint32_t{bytes[6 + i]} << (i * 8);
      version = (std::min)(version, std::uint32_t{RDPINPUT_PROTOCOL_V300});
      std::array<BYTE, 16> reply{2, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 0};
      for (unsigned i = 0; i < 4; ++i)
        reply[10 + i] = static_cast<BYTE>(version >> (i * 8));
      if (f.mode == Mode::wrong_version)
        reply[10] = 1;
      if (f.mode == Mode::wrong_flags)
        reply[6] = 8;
      if (f.mode == Mode::wrong_count)
        reply[14] = 0;
      if (f.mode == Mode::wrong_length)
        reply[2] = 15;
      const auto result =
          f.wrapped->Write(f.wrapped, static_cast<ULONG>(reply.size()), reply.data(), nullptr);
      f.ready_before_delegate_return = f.gate.ready();
      return f.mode == Mode::error_after_reply ? ERROR_INTERNAL_ERROR : result;
    };
    transport.api.Write = [](IWTSVirtualChannel *c, ULONG, const BYTE *, void *) -> UINT {
      auto &f = *reinterpret_cast<Transport *>(c)->owner;
      ++f.writes;
      f.ready_during_write = f.gate.ready();
      if (f.throw_write)
        throw std::runtime_error("fixture");
      if (f.close_during_write)
        return f.gate.close();
      return CHANNEL_RC_OK;
    };
    transport.api.Close = [](IWTSVirtualChannel *c) -> UINT {
      ++reinterpret_cast<Transport *>(c)->owner->transport_closes;
      return CHANNEL_RC_OK;
    };
  }
  ~Fixture() { (void)gate.close(); }
  void boolean(FreeRDP_Settings_Keys_Bool key, BOOL value) {
    REQUIRE(freerdp_settings_set_bool(context->settings, key, value));
  }
  UINT bind() {
    return gate.open(*context, &listener, &transport.api, nullptr, &accepted, &callback);
  }
  UINT receive(std::span<BYTE> bytes, std::size_t offset = 0) {
    const std::unique_ptr<wStream, void (*)(wStream *)> stream(
        Stream_New(bytes.data(), bytes.size()), [](wStream *s) { Stream_Free(s, FALSE); });
    REQUIRE(stream);
    REQUIRE(Stream_SetPosition(stream.get(), offset));
    return callback->OnDataReceived(callback, stream.get());
  }
  UINT ready() {
    std::array<BYTE, 10> bytes{1, 0, 10, 0, 0, 0, 0, 0, 1, 0};
    return receive(bytes);
  }
};
} // namespace
TEST_CASE("DVC gate rejects absent or asynchronous public interfaces before binding") {
  for (const auto key :
       {FreeRDP_SynchronousDynamicChannels, FreeRDP_AsyncChannels, FreeRDP_AsyncUpdate}) {
    Fixture f;
    f.boolean(key, key == FreeRDP_SynchronousDynamicChannels ? FALSE : TRUE);
    REQUIRE(f.bind() == ERROR_INVALID_PARAMETER);
    REQUIRE_FALSE(f.accepted);
    REQUIRE(f.callback == nullptr);
    REQUIRE(f.gate.phase() == Phase::closed);
  }
  Fixture f;
  auto *const write = f.transport.api.Write;
  f.transport.api.Write = nullptr;
  REQUIRE(f.bind() == ERROR_INVALID_PARAMETER);
  f.transport.api.Write = write;
  REQUIRE(f.gate.open(*f.context, nullptr, &f.transport.api, nullptr, &f.accepted, &f.callback) ==
          ERROR_INVALID_PARAMETER);
  REQUIRE(f.gate.open(*f.context, &f.listener, &f.transport.api, nullptr, nullptr, &f.callback) ==
          ERROR_INVALID_PARAMETER);
  REQUIRE(f.gate.open(*f.context, &f.listener, &f.transport.api, nullptr, &f.accepted, nullptr) ==
          ERROR_INVALID_PARAMETER);
  REQUIRE(f.closes == 0);
}
TEST_CASE("DVC gate owns partial callbacks and preserves an existing binding on duplicate open") {
  for (const bool rejected : {false, true}) {
    Fixture f;
    f.allow = rejected ? FALSE : TRUE;
    f.listener_result = rejected ? CHANNEL_RC_OK : ERROR_INTERNAL_ERROR;
    REQUIRE(f.bind() != CHANNEL_RC_OK);
    REQUIRE(f.closes == 1);
    REQUIRE(f.gate.phase() == Phase::closed);
    REQUIRE(f.gate.close() == CHANNEL_RC_OK);
    REQUIRE(f.closes == 1);
  }
  Fixture f;
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  BOOL accepted = TRUE;
  IWTSVirtualChannelCallback *callback = nullptr;
  REQUIRE(f.gate.open(*f.context, &f.listener, &f.transport.api, nullptr, &accepted, &callback) ==
          CHANNEL_RC_ALREADY_INITIALIZED);
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  REQUIRE(f.gate.ready());
  REQUIRE(f.gate.close() == CHANNEL_RC_OK);
  REQUIRE(f.closes == 1);
}
TEST_CASE("DVC gate requires successful reply write and delegated receive before publishing") {
  Fixture f;
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  REQUIRE_FALSE(f.ready_during_write);
  REQUIRE_FALSE(f.ready_before_delegate_return);
  REQUIRE(f.gate.ready());
  REQUIRE(f.gate.negotiated() == Negotiated{RDPINPUT_PROTOCOL_V10, 64});
  for (const auto mode : {Mode::no_reply, Mode::wrong_version, Mode::wrong_flags, Mode::wrong_count,
                          Mode::wrong_length, Mode::error_after_reply, Mode::throws}) {
    Fixture broken;
    broken.mode = mode;
    REQUIRE(broken.bind() == CHANNEL_RC_OK);
    REQUIRE(broken.ready() != CHANNEL_RC_OK);
    REQUIRE(broken.gate.phase() == Phase::failed);
    REQUIRE_FALSE(broken.gate.ready());
    REQUIRE_FALSE(broken.gate.negotiated());
  }
}
TEST_CASE("DVC gate does not resurrect readiness after reentrant close or write exception") {
  for (const bool during_write : {false, true}) {
    Fixture f;
    f.mode = during_write ? Mode::normal : Mode::closes;
    f.close_during_write = during_write;
    REQUIRE(f.bind() == CHANNEL_RC_OK);
    REQUIRE(f.ready() == ERROR_INVALID_STATE);
    REQUIRE(f.gate.phase() == Phase::closed);
    REQUIRE_FALSE(f.gate.ready());
    REQUIRE(f.closes == 1);
    REQUIRE_FALSE(f.closed_inside_delegate);
    REQUIRE_FALSE(f.closed_inside_delegate);
    REQUIRE(f.gate.close() == CHANNEL_RC_OK);
    REQUIRE(f.closes == 1);
  }
  Fixture f;
  f.throw_write = true;
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  REQUIRE(f.ready() == ERROR_INTERNAL_ERROR);
  REQUIRE(f.gate.phase() == Phase::failed);
}
TEST_CASE("DVC gate defers callback destruction during listener and OnOpen delegation") {
  Fixture binding;
  binding.close_during_bind = true;
  REQUIRE(binding.bind() == ERROR_INVALID_STATE);
  REQUIRE_FALSE(binding.accepted);
  REQUIRE(binding.callback == nullptr);
  REQUIRE(binding.closes == 1);
  REQUIRE_FALSE(binding.closed_inside_delegate);
  Fixture opening;
  opening.close_during_open = true;
  REQUIRE(opening.bind() == CHANNEL_RC_OK);
  REQUIRE(opening.callback->OnOpen(opening.callback) == ERROR_INVALID_STATE);
  REQUIRE_FALSE(opening.gate.ready());
  REQUIRE(opening.closes == 1);
  REQUIRE_FALSE(opening.closed_inside_delegate);
}
TEST_CASE("DVC gate validates lengths and every header byte before delegated parsing") {
  Fixture f;
  for (std::size_t length = 0; length <= 32; ++length) {
    REQUIRE(f.bind() == CHANNEL_RC_OK);
    std::array<BYTE, 32> bytes{1, 0, 10, 0, 0, 0, 0, 0, 1, 0};
    bytes[2] = static_cast<BYTE>(length);
    const auto result = f.receive(std::span(bytes).first(length));
    REQUIRE(result == static_cast<UINT>(length == 10 ? CHANNEL_RC_OK : ERROR_INVALID_DATA));
    REQUIRE(f.gate.close() == CHANNEL_RC_OK);
  }
  for (std::size_t index = 0; index < 6; ++index) {
    for (unsigned value = 0; value <= 255; ++value) {
      REQUIRE(f.bind() == CHANNEL_RC_OK);
      std::array<BYTE, 10> bytes{1, 0, 10, 0, 0, 0, 0, 0, 1, 0};
      const bool unchanged = bytes[index] == value;
      bytes[index] = static_cast<BYTE>(value);
      REQUIRE(f.receive(bytes) ==
              static_cast<UINT>(unchanged ? CHANNEL_RC_OK : ERROR_INVALID_DATA));
      REQUIRE(f.gate.close() == CHANNEL_RC_OK);
    }
  }
  REQUIRE(f.receives == 7);
  REQUIRE(f.writes == 7);
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  std::array<BYTE, 12> offset{99, 99, 1, 0, 10, 0, 0, 0, 0, 0, 1, 0};
  REQUIRE(f.receive(offset, 2) == CHANNEL_RC_OK);
  REQUIRE(f.gate.ready());
}
TEST_CASE("DVC gate drops bounded suspended frames without retaining packets or changing native "
          "settings") {
  Fixture f;
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  std::array<BYTE, 6> suspend{4, 0, 6, 0, 0, 0}, resume{5, 0, 6, 0, 0, 0};
  REQUIRE(f.receive(suspend) == CHANNEL_RC_OK);
  REQUIRE(f.receive(suspend) == CHANNEL_RC_OK); // Repeated Boolean notifications are idempotent.
  for (unsigned i = 0; i < 1000; ++i) {
    std::array<BYTE, 6> frame{static_cast<BYTE>(i % 2 ? 3 : 7), 0, 6, 0, 0, 0};
    REQUIRE(f.wrapped->Write(f.wrapped, static_cast<ULONG>(frame.size()), frame.data(), nullptr) ==
            CHANNEL_RC_OK);
  }
  REQUIRE(f.gate.suppressed_frames() == 1000);
  REQUIRE(f.writes == 1);
  REQUIRE_FALSE(freerdp_settings_get_bool(f.context->settings, FreeRDP_SuspendInput));
  REQUIRE(f.receive(resume) == CHANNEL_RC_OK);
  REQUIRE(f.receive(resume) == CHANNEL_RC_OK);
  REQUIRE(f.gate.ready());
  REQUIRE(f.writes == 1); // There is no automatic replay when transport resumes.
  std::array<BYTE, 6> frame{3, 0, 6, 0, 0, 0};
  REQUIRE(f.wrapped->Write(f.wrapped, static_cast<ULONG>(frame.size()), frame.data(), nullptr) ==
          CHANNEL_RC_OK);
  REQUIRE(f.writes == 2);
  frame[2] = 5;
  REQUIRE(f.wrapped->Write(f.wrapped, static_cast<ULONG>(frame.size()), frame.data(), nullptr) ==
          ERROR_INVALID_DATA);
  REQUIRE(f.gate.phase() == Phase::failed);
}
TEST_CASE("DVC gate rejects outbound oversize before buffer inspection and foreign-thread calls") {
  SECTION("length limit") {
    Fixture f;
    REQUIRE(f.bind() == CHANNEL_RC_OK);
    REQUIRE(f.ready() == CHANNEL_RC_OK);
    const std::array<BYTE, 6> header{3, 0, 6, 0, 0, 0};
    REQUIRE(f.wrapped->Write(f.wrapped, DvcGate::max_outbound_bytes + 1, header.data(), nullptr) ==
            ERROR_INVALID_DATA);
    REQUIRE(f.writes == 1);
    REQUIRE_FALSE(f.gate.ready());
  }
  SECTION("thread ownership") {
    Fixture f;
    REQUIRE(f.bind() == CHANNEL_RC_OK);
    REQUIRE(f.ready() == CHANNEL_RC_OK);
    UINT read = 0, write = 0, close = 0;
    bool ready = true;
    std::thread other([&] {
      const std::array<BYTE, 6> header{3, 0, 6, 0, 0, 0};
      read = f.callback->OnDataReceived(f.callback, nullptr);
      write =
          f.wrapped->Write(f.wrapped, static_cast<ULONG>(header.size()), header.data(), nullptr);
      close = f.gate.close();
      ready = f.gate.ready();
    });
    other.join();
    REQUIRE(read == ERROR_INVALID_STATE);
    REQUIRE(write == ERROR_INVALID_STATE);
    REQUIRE(close == ERROR_INVALID_STATE);
    REQUIRE_FALSE(ready);
    REQUIRE(f.gate.ready());
    REQUIRE(f.writes == 1);
  }
}
TEST_CASE("DVC gate delegates transport close once and stays unavailable until host OnClose") {
  Fixture f;
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  REQUIRE(f.ready() == CHANNEL_RC_OK);
  REQUIRE(f.wrapped->Close(f.wrapped) == CHANNEL_RC_OK);
  REQUIRE(f.wrapped->Close(f.wrapped) == ERROR_INVALID_STATE);
  REQUIRE(f.transport_closes == 1);
  REQUIRE(f.gate.phase() == Phase::closed);
  REQUIRE_FALSE(f.gate.ready());
  REQUIRE(f.callback->OnClose(f.callback) == CHANNEL_RC_OK);
  REQUIRE(f.closes == 1);
  REQUIRE(f.gate.close() == CHANNEL_RC_OK);
  REQUIRE(f.closes == 1);
  REQUIRE(f.bind() == CHANNEL_RC_OK);
  REQUIRE(f.gate.phase() == Phase::handshake);
  REQUIRE_FALSE(f.gate.negotiated());
}
