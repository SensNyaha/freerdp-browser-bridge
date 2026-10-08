#include "connection.hpp"
#include "cursor_convert.hpp"
#include "event_pump.hpp"
#include "gdi_dirty.hpp"
#include <algorithm>
#include <chrono>
#include <cstring>
#include <freerdp/client/cmdline.h>
#include <freerdp/config.h>
#include <freerdp/error.h>
#include <freerdp/gdi/gdi.h>
#include <freerdp/input.h>
#include <freerdp/settings.h>
#include <limits>
#include <winpr/synch.h>
#ifdef _WIN32
#include <winpr/winsock.h>
#endif

namespace bridge {
using namespace ipc;
#ifdef _WIN32
static BOOL network_init() {
  WSADATA data{};
  return WSAStartup(0x0202, &data) == 0;
}
static void network_free() { (void)WSACleanup(); }
#endif
Connection &Connection::owner(freerdp *instance) {
  return *reinterpret_cast<Context *>(instance->context)->owner;
}
Connection::Connection(std::function<void(const Packet &)> send)
    : context_(nullptr, freerdp_client_context_free), send_(std::move(send)), cursor_(send_) {
  RDP_CLIENT_ENTRY_POINTS entry{};
  entry.Size = sizeof(entry);
  entry.Version = RDP_CLIENT_INTERFACE_VERSION;
  entry.ContextSize = sizeof(Context);
#ifdef _WIN32
  entry.GlobalInit = network_init;
  entry.GlobalUninit = network_free;
#endif
  context_.reset(freerdp_client_context_new(&entry));
  if (!context_)
    throw std::runtime_error("FreeRDP context initialization failed");
  reinterpret_cast<Context *>(context_.get())->owner = this;
  auto *instance = context_->instance;
  instance->PreConnect = pre_connect;
  instance->PostConnect = post_connect;
  instance->PostDisconnect = post_disconnect;
  instance->AuthenticateEx = authenticate;
  instance->VerifyX509Certificate = verify;
  instance->ChooseSmartcard = nullptr;
  instance->GetAccessToken = nullptr;
  instance->RetryDialog = nullptr;
  instance->PresentGatewayMessage = nullptr;
  media_event_ = CreateEvent(nullptr, FALSE, FALSE, nullptr);
  if (!media_event_)
    throw ProtocolError();
}
Connection::~Connection() {
  stop();
  if (thread_.joinable())
    thread_.join();
  if (media_event_ && !CloseHandle(media_event_))
    reason_ = RdpError::protocol;
  erase_password();
}
void Connection::configure(std::span<const std::uint8_t> payload) {
  if (config_ || started_)
    throw ProtocolError();
  config_ = decode_connection_config(payload);
  const auto &c = *config_;
  auto *s = context_->settings;
  const auto boolean = [&](auto key, BOOL value) {
    if (!freerdp_settings_set_bool(s, key, value))
      throw ProtocolError();
  };
  const auto number = [&](auto key, UINT32 value) {
    if (!freerdp_settings_set_uint32(s, key, value))
      throw ProtocolError();
  };
  const auto text = [&](auto key, const char *value) {
    if (!freerdp_settings_set_string(s, key, value))
      throw ProtocolError();
  };
  text(FreeRDP_ServerHostname, c.host.c_str());
  text(FreeRDP_Username, c.username.c_str());
  text(FreeRDP_Domain, c.domain.c_str());
  text(FreeRDP_ConfigPath, ".");
  number(FreeRDP_ServerPort, c.port);
  number(FreeRDP_DesktopWidth, c.width);
  number(FreeRDP_DesktopHeight, c.height);
  number(FreeRDP_ColorDepth, c.color_depth);
  number(FreeRDP_TcpConnectTimeout, c.connect_ms);
  number(FreeRDP_TcpAckTimeout, c.tcp_ack_ms);
  number(FreeRDP_AuthenticationLevel, 2);
  if (!freerdp_settings_set_uint16(s, FreeRDP_TLSMinVersion, c.minimum_tls == 3 ? 0x0304 : 0x0303))
    throw ProtocolError();
  boolean(FreeRDP_NlaSecurity, c.security != 2);
  boolean(FreeRDP_TlsSecurity, c.security != 1);
  boolean(FreeRDP_RdpSecurity, FALSE); // Never silently fall back to legacy insecure RDP.
  boolean(FreeRDP_ExtSecurity, FALSE);
  boolean(FreeRDP_ExternalCertificateManagement, TRUE);
  boolean(FreeRDP_IgnoreCertificate, FALSE);
  boolean(FreeRDP_AutoAcceptCertificate, FALSE);
  boolean(FreeRDP_AutoReconnectionEnabled, FALSE);
  boolean(FreeRDP_AutoLogonEnabled, TRUE);
  boolean(FreeRDP_RedirectClipboard, FALSE);
  boolean(FreeRDP_RedirectDrives, FALSE);
  boolean(FreeRDP_RedirectPrinters, FALSE);
  boolean(FreeRDP_RedirectSmartCards, FALSE);
  boolean(FreeRDP_AudioPlayback, FALSE);
  boolean(FreeRDP_AudioCapture, FALSE);
#ifdef CHANNEL_RDPGFX_CLIENT
  boolean(FreeRDP_SupportGraphicsPipeline, c.color_depth == 32);
#else
  boolean(FreeRDP_SupportGraphicsPipeline, FALSE);
#endif
  boolean(FreeRDP_SynchronousDynamicChannels, TRUE);
  boolean(FreeRDP_AsyncChannels, FALSE);
  boolean(FreeRDP_AsyncUpdate, FALSE);
  boolean(FreeRDP_RemoteApplicationMode, FALSE);
  boolean(FreeRDP_BitmapCachePersistEnabled, FALSE);
  boolean(FreeRDP_GfxSmallCache, TRUE);
  boolean(FreeRDP_GfxThinClient, TRUE);
  boolean(FreeRDP_SoftwareGdi, TRUE);
#ifdef WITH_GFX_H264
  boolean(FreeRDP_GfxH264, TRUE);
  boolean(FreeRDP_GfxAVC444, FALSE); // AVC420 is verified; dual-stream AVC444 gate remains open.
#else
  boolean(FreeRDP_GfxH264, FALSE);
  boolean(FreeRDP_GfxAVC444, FALSE);
#endif
  boolean(FreeRDP_GrabMouse, TRUE); // Enables remote SetPosition callbacks; no GUI is created.
  number(FreeRDP_PointerCacheSize, 20);
  number(FreeRDP_ColorPointerCacheSize, 20);
}
void Connection::secret(std::span<const std::uint8_t> payload) {
  if (!config_ || supplied_ || started_)
    throw ProtocolError();
  validate_secret(payload);
  // Public API copies the UTF-8 value; the transport copy is wiped by the IPC loop.
  if (!freerdp_settings_set_string_len(context_->settings, FreeRDP_Password,
                                       reinterpret_cast<const char *>(payload.data()),
                                       payload.size()))
    throw ProtocolError();
  supplied_ = true;
}
void Connection::erase_password() noexcept {
  auto *s = context_->settings;
  const auto *password = freerdp_settings_get_string(s, FreeRDP_Password);
  if (password) {
    // Settings owns this mutable allocation; clear it before the setter frees/replaces it.
    auto *bytes = reinterpret_cast<std::uint8_t *>(const_cast<char *>(password));
    wipe({bytes, std::strlen(password)});
  }
  if (!freerdp_settings_set_string(s, FreeRDP_Password, nullptr))
    reason_ = RdpError::protocol;
}
BOOL Connection::pre_connect(freerdp *instance) {
  auto &self = owner(instance);
  auto *pubsub = instance->context->pubSub;
  if (PubSub_SubscribeChannelConnected(pubsub, channel_connected) < 0)
    return FALSE;
  self.subscribed_connected_ = true;
  if (PubSub_SubscribeChannelDisconnected(pubsub, channel_disconnected) < 0)
    return FALSE;
  self.subscribed_disconnected_ = true;
  return freerdp_client_load_addins(instance->context->channels, instance->context->settings);
}
void Connection::channel_connected(void *context, const ChannelConnectedEventArgs *event) {
  auto *base = static_cast<rdpContext *>(context);
  if (!event || !event->name || std::strcmp(event->name, RDPGFX_DVC_CHANNEL_NAME) != 0)
    return;
  auto &self = owner(base->instance);
  if (!self.gfx_->bind(reinterpret_cast<Context *>(base)->base,
                       static_cast<RdpgfxClientContext *>(event->pInterface))) {
    self.reason_ = RdpError::protocol;
    setChannelError(base, ERROR_BAD_CONFIGURATION, "Bridge GFX initialization failed");
  }
}
void Connection::channel_disconnected(void *context, const ChannelDisconnectedEventArgs *event) {
  auto *base = static_cast<rdpContext *>(context);
  if (!event || !event->name || std::strcmp(event->name, RDPGFX_DVC_CHANNEL_NAME) != 0)
    return;
  auto &self = owner(base->instance);
  if (!self.gfx_->unbind())
    self.reason_ = RdpError::protocol;
}
namespace {
struct CursorPointer {
  rdpPointer base;
  std::uint64_t id;
};
} // namespace
BOOL Connection::pointer_new(rdpContext *context, rdpPointer *pointer) {
  auto &self = owner(context->instance);
  if (!pointer || self.next_cursor_id_ == (std::numeric_limits<std::uint64_t>::max)() ||
      !pointer->width || !pointer->height || pointer->width > cursor::max_dimension ||
      pointer->height > cursor::max_dimension)
    return FALSE;
  reinterpret_cast<CursorPointer *>(pointer)->id = ++self.next_cursor_id_;
  return TRUE;
}
BOOL Connection::pointer_set(rdpContext *context, rdpPointer *pointer) {
  try {
    auto &self = owner(context->instance);
    const auto id = reinterpret_cast<CursorPointer *>(pointer)->id;
    if (self.cursor_.shape_id() == id)
      self.cursor_.visibility(true);
    else
      self.cursor_.shape(cursor::convert(*pointer, id, &context->gdi->palette));
    return TRUE;
  } catch (...) {
    return FALSE;
  }
}
BOOL Connection::pointer_null(rdpContext *context) {
  try {
    owner(context->instance).cursor_.visibility(false);
    return TRUE;
  } catch (...) {
    return FALSE;
  }
}
BOOL Connection::pointer_default(rdpContext *context) {
  try {
    owner(context->instance).cursor_.default_shape();
    return TRUE;
  } catch (...) {
    return FALSE;
  }
}
BOOL Connection::pointer_position(rdpContext *context, UINT32 x, UINT32 y) {
  try {
    owner(context->instance).cursor_.position(x, y);
    return TRUE;
  } catch (...) {
    return FALSE;
  }
}
BOOL Connection::post_connect(freerdp *instance) {
  // Decode and encode on the same RDP thread; no queue or copy of raw desktops.
  const auto width = freerdp_settings_get_uint32(instance->context->settings, FreeRDP_DesktopWidth);
  const auto height =
      freerdp_settings_get_uint32(instance->context->settings, FreeRDP_DesktopHeight);
  if (width == 0 || width > 7680 || height == 0 || height > 4320)
    return FALSE;
  if (!gdi_init(instance, PIXEL_FORMAT_BGRA32))
    return FALSE;
  instance->context->update->DesktopResize = resize;
  instance->context->update->BeginPaint = begin_paint;
  instance->context->update->EndPaint = end_paint;
  rdpPointer prototype{};
  prototype.size = sizeof(CursorPointer);
  prototype.New = pointer_new;
  prototype.Set = pointer_set;
  prototype.SetNull = pointer_null;
  prototype.SetDefault = pointer_default;
  prototype.SetPosition = pointer_position;
  graphics_register_pointer(instance->context->graphics, &prototype);
  try {
    owner(instance).cursor_.initialize();
    owner(instance).dirty_.resize(width, height);
  } catch (...) {
    return FALSE;
  }
  return TRUE;
}
BOOL Connection::resize(rdpContext *context) {
  const auto width = freerdp_settings_get_uint32(context->settings, FreeRDP_DesktopWidth);
  const auto height = freerdp_settings_get_uint32(context->settings, FreeRDP_DesktopHeight);
  if (width == 0 || width > 7680 || height == 0 || height > 4320)
    return FALSE;
  if (!gdi_resize(context->gdi, width, height))
    return FALSE;
  try {
    owner(context->instance).dirty_.resize(width, height);
    return TRUE;
  } catch (...) {
    return FALSE;
  }
}
BOOL Connection::begin_paint(rdpContext *context) {
  return media::begin_gdi_paint(context->gdi) ? TRUE : FALSE;
}
BOOL Connection::end_paint(rdpContext *context) {
  auto &self = owner(context->instance);
  const auto before = self.dirty_.revision();
  if (!media::end_gdi_paint(context->gdi, self.dirty_))
    return FALSE;
  if (self.dirty_.revision() != before)
    self.pipeline_stats_.paint();
  return TRUE;
}
std::vector<std::uint8_t> Connection::pipeline_stats() {
  std::vector<std::uint8_t> p;
  for (const auto value : pipeline_stats_.snapshot())
    append_be(p, value, 8);
  return p;
}
bool Connection::capture(std::uint64_t request, std::span<const std::uint8_t> payload, bool avc) {
  std::lock_guard lock(media_mutex_);
  if (payload.size() != (avc ? 12U : 8U) || request == 0 || frame_request_ != 0 ||
      (avc && (payload[8] > 1 || read_be(payload.subspan(9, 3)) != 0)))
    throw ProtocolError();
  if (!connected_ || stopping_)
    return false;
  requested_revision_ = read_be(payload.first(8));
  requested_avc_ = avc;
  force_idr_ = avc && (payload[8] == 1 || requested_revision_ == 0);
  frame_request_ = request;
  if (!SetEvent(media_event_))
    throw ProtocolError();
  return true;
}
void Connection::capture_pending(bool ending) {
  std::lock_guard lock(media_mutex_);
  const auto now = std::chrono::steady_clock::now();
  if (!frame_request_ || (!ending && now < next_frame_))
    return;
  const auto *gdi = context_->gdi;
  const auto snapshot = dirty_.snapshot();
  const bool changed = !ending && (snapshot.revision != requested_revision_ || force_idr_);
  const auto timestamp = static_cast<std::uint64_t>(
      std::chrono::duration_cast<std::chrono::microseconds>(now.time_since_epoch()).count());
  std::span<const std::uint8_t> jpeg;
  media::AvcUnit avc{};
  if (changed) {
    try {
      if (!gdi || gdi->width < 1 || gdi->height < 1 || gdi->stride > INT32_MAX)
        throw ProtocolError();
      const std::span<const std::uint8_t> pixels{gdi->primary_buffer,
                                                 static_cast<std::size_t>(gdi->stride) *
                                                     static_cast<std::size_t>(gdi->height)};
      if (requested_avc_) {
        if (!avc_encoder_)
          avc_encoder_ = std::make_unique<media::SoftwareH264Encoder>();
        avc = avc_encoder_->encode(
            {pixels, gdi->width, gdi->height, static_cast<int>(gdi->stride), timestamp},
            force_idr_);
      } else {
        if (!encoder_)
          encoder_ = std::make_unique<media::JpegEncoder>();
        jpeg = encoder_->encode(pixels, gdi->width, gdi->height, static_cast<int>(gdi->stride));
      }
      pipeline_stats_.encode(
          static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(
                                         std::chrono::steady_clock::now() - now)
                                         .count()));
    } catch (...) {
      std::vector<std::uint8_t> error;
      append_be(error, 4, 4);
      send_({Kind::error, frame_request_, std::move(error)});
      frame_request_ = 0;
      avc_encoder_.reset(); // A failed predictive chain must restart from config/IDR.
      next_frame_ = now + std::chrono::milliseconds(50);
      return; // Media provider failure does not disconnect the remote session.
    }
  }
  std::vector<std::uint8_t> payload;
  payload.reserve(avc_metadata_bytes + avc.config.size() + avc.bytes.size() + jpeg.size());
  append_be(payload, snapshot.revision, 8);
  append_be(payload, timestamp, 8);
  append_be(payload, gdi ? static_cast<std::uint64_t>(gdi->width) : config_->width, 2);
  append_be(payload, gdi ? static_cast<std::uint64_t>(gdi->height) : config_->height, 2);
  if (requested_avc_) {
    append_be(payload, changed ? (avc.keyframe ? 2 : 1) : 0, 1);
    append_be(payload, 0, 1);
    append_be(payload, avc.config.size(), 2);
    append_be(payload, avc.bytes.size(), 4);
    payload.insert(payload.end(), avc.config.begin(), avc.config.end());
    payload.insert(payload.end(), avc.bytes.begin(), avc.bytes.end());
  } else {
    append_be(payload, changed ? 1 : 0, 1);
    append_be(payload, 0, 3);
    payload.insert(payload.end(), jpeg.begin(), jpeg.end());
  }
  send_({requested_avc_ ? Kind::frame_avc : Kind::frame, frame_request_, std::move(payload)});
  if (changed)
    dirty_.consume(snapshot.revision);
  frame_request_ = 0;
  next_frame_ = now + std::chrono::milliseconds(requested_avc_ ? 34 : 50);
}
void Connection::post_disconnect(freerdp *instance) {
  auto &self = owner(instance);
  if (!self.gfx_->unbind())
    self.reason_ = RdpError::protocol;
  if (self.subscribed_connected_) {
    PubSub_UnsubscribeChannelConnected(instance->context->pubSub, channel_connected);
    self.subscribed_connected_ = false;
  }
  if (self.subscribed_disconnected_) {
    PubSub_UnsubscribeChannelDisconnected(instance->context->pubSub, channel_disconnected);
    self.subscribed_disconnected_ = false;
  }
  gdi_free(instance);
}
unsigned Connection::enqueue_input(std::uint64_t request, std::span<const std::uint8_t> payload) {
  const auto event = input::decode(payload);
  std::lock_guard lock(input_mutex_);
  if (!connected_ || stopping_)
    return 5;
  if (input_queue_.size() >= 64 || input_overflow_) {
    input_overflow_ = true;
    if (!SetEvent(media_event_))
      throw ProtocolError();
    return 6;
  }
  input_queue_.emplace_back(request, event);
  if (!SetEvent(media_event_))
    throw ProtocolError();
  return 0;
}
bool Connection::send_input(const input::Event &e) {
  auto *in = context_->input;
  switch (e.type) {
  case input::Type::key:
    return freerdp_input_send_keyboard_event_ex(in, (e.flags & 1) != 0, (e.flags & 2) != 0, e.a) !=
           FALSE;
  case input::Type::move:
    return freerdp_input_send_mouse_event(in, PTR_FLAGS_MOVE, e.a, e.b) != FALSE;
  case input::Type::button: {
    if (e.c >= 3)
      return freerdp_input_send_extended_mouse_event(
                 in,
                 static_cast<UINT16>((e.flags ? PTR_XFLAGS_DOWN : 0) |
                                     (e.c == 3 ? PTR_XFLAGS_BUTTON1 : PTR_XFLAGS_BUTTON2)),
                 e.a, e.b) != FALSE;
    constexpr std::array<UINT16, 3> buttons{PTR_FLAGS_BUTTON1, PTR_FLAGS_BUTTON3,
                                            PTR_FLAGS_BUTTON2};
    return freerdp_input_send_mouse_event(
               in, static_cast<UINT16>(buttons[e.c] | (e.flags ? PTR_FLAGS_DOWN : 0)), e.a, e.b) !=
           FALSE;
  }
  case input::Type::wheel:
    return freerdp_input_send_mouse_event(
               in,
               static_cast<UINT16>((e.flags ? PTR_FLAGS_HWHEEL : PTR_FLAGS_WHEEL) |
                                   (e.a & WheelRotationMask)),
               0, 0) != FALSE;
  case input::Type::sync:
    return freerdp_input_send_synchronize_event(in, e.a) != FALSE;
  case input::Type::reset:
    return false; // Expanded to tracked releases by State, never sent directly.
  }
  return false;
}
void Connection::input_pending(bool ending) {
  std::lock_guard lock(input_mutex_);
  const input::State::Sink sink = [this](const auto &e) { return send_input(e); };
  while (!input_queue_.empty()) {
    const auto [request, event] = input_queue_.front();
    input_queue_.pop_front();
    if (ending) {
      std::vector<std::uint8_t> p;
      append_be(p, 5, 4);
      send_({Kind::error, request, std::move(p)});
    } else {
      const auto *gdi = context_->gdi;
      if (!gdi || !input_state_.apply(event, sink, static_cast<std::uint16_t>(gdi->width),
                                      static_cast<std::uint16_t>(gdi->height)))
        throw ProtocolError();
      send_({Kind::input_ack, request, {}});
    }
  }
  if (ending || input_overflow_) {
    input_overflow_ = false;
    if (!input_state_.release(sink) && !ending)
      throw ProtocolError();
  }
}
BOOL Connection::authenticate(freerdp *instance, char **username, char **password, char **,
                              rdp_auth_reason) {
  if (username && password && *username && **username && *password)
    return TRUE;
  owner(instance).reason_ = RdpError::authentication;
  return FALSE; // Interactive credential replacement is a later protocol slice.
}
int Connection::verify(freerdp *instance, const BYTE *pem, std::size_t length, const char *host,
                       UINT16, DWORD) {
  auto &self = owner(instance);
  try {
    if (!host || !self.config_ || self.config_->host != host)
      return 0; // Redirected endpoints require a separate policy.
    const auto check = check_certificate({pem, length}, host);
    if (check.flags == 0)
      return 2;
    self.reason_ = RdpError::certificate;
    if (self.config_->certificate_policy == 0)
      return 0;
    std::unique_lock lock(self.mutex_);
    self.certificate_ = check;
    self.decision_.reset();
    ++self.challenge_;
    std::vector<std::uint8_t> payload;
    append_be(payload, self.challenge_, 8);
    append_be(payload, check.flags, 2);
    payload.insert(payload.end(), check.fingerprint.begin(), check.fingerprint.end());
    self.state(RdpState::awaiting_user);
    self.send_({Kind::certificate, 0, std::move(payload)});
    self.condition_.wait_for(lock, std::chrono::seconds(30), [&] {
      return self.stopping_ || self.timed_out_ || self.decision_.has_value();
    });
    const bool accepted = self.decision_.value_or(false) && !self.stopping_ && !self.timed_out_;
    self.certificate_.reset();
    self.decision_.reset();
    if (accepted) {
      self.reason_ = RdpError::none;
      self.state(RdpState::connecting);
      return 2; // Session-only acceptance; never persist a server certificate.
    }
  } catch (...) {
    self.reason_ = RdpError::certificate;
  }
  return 0;
}
void Connection::decide(std::span<const std::uint8_t> payload) {
  std::lock_guard lock(mutex_);
  if (payload.size() != 41 || !certificate_ || decision_ || payload[40] > 1 ||
      read_be(payload.first(8)) != challenge_ ||
      !std::equal(certificate_->fingerprint.begin(), certificate_->fingerprint.end(),
                  payload.begin() + 8))
    throw ProtocolError();
  decision_ = payload[40] != 0;
  condition_.notify_all();
}
void Connection::state(RdpState value, RdpError error) noexcept {
  try {
    std::vector<std::uint8_t> payload;
    append_be(payload, static_cast<std::uint16_t>(value), 2);
    append_be(payload, static_cast<std::uint16_t>(error), 2);
    append_be(payload, freerdp_get_last_error(context_.get()), 4);
    send_({Kind::state, 0, std::move(payload)});
  } catch (...) {
    stopping_ = true;
  }
}
void Connection::start() {
  if (!config_ || !supplied_ || started_)
    throw ProtocolError();
  started_ = true;
  thread_ = std::thread([this] { run(); });
}
void Connection::stop() noexcept {
  stopping_ = true;
  if (media_event_ && !SetEvent(media_event_))
    reason_ = RdpError::protocol;
  condition_.notify_all();
  if (started_ && !finished_ && !freerdp_abort_connect_context(context_.get()))
    reason_ = RdpError::protocol;
}
void Connection::run() noexcept {
  try {
    const auto deadline =
        std::chrono::steady_clock::now() + std::chrono::milliseconds(config_->connect_ms);
    std::jthread watchdog([this, deadline](std::stop_token token) {
      std::unique_lock lock(mutex_);
      condition_.wait_until(lock, deadline,
                            [&] { return finished_ || stopping_ || token.stop_requested(); });
      if (!finished_ && !stopping_ && !token.stop_requested()) {
        timed_out_ = true;
        condition_.notify_all();
        if (!freerdp_abort_connect_context(context_.get()))
          reason_ = RdpError::protocol;
      }
    });
    state(RdpState::connecting);
    const auto connected = !stopping_ && freerdp_connect(context_->instance);
    // The connect watchdog applies only until authentication/activation completes.
    watchdog.request_stop();
    condition_.notify_all();
    watchdog.join();
    erase_password();
    if (!connected) {
      auto error = reason_.load();
      const auto native = freerdp_get_last_error(context_.get());
      if (timed_out_)
        error = RdpError::timeout;
      else if (error == RdpError::none) {
        error = native == FREERDP_ERROR_AUTHENTICATION_FAILED ||
                        native == FREERDP_ERROR_CONNECT_LOGON_FAILURE ||
                        native == FREERDP_ERROR_CONNECT_WRONG_PASSWORD ||
                        native == FREERDP_ERROR_CONNECT_NO_OR_MISSING_CREDENTIALS
                    ? RdpError::authentication
                    : RdpError::connection;
      }
      state(stopping_ ? RdpState::closed : RdpState::failed, stopping_ ? RdpError::none : error);
    } else {
      connected_ = true;
      state(RdpState::connected);
      bool healthy = true;
      while (!stopping_ && !freerdp_shall_disconnect_context(context_.get())) {
        std::array<HANDLE, 64> events{};
        const auto count = freerdp_get_event_handles(context_.get(), events.data(),
                                                     static_cast<DWORD>(events.size() - 1));
        if (count == 0 || count >= events.size()) {
          healthy = false;
          break;
        }
        input_pending();
        events[count] = media_event_;
        DWORD wait_ms = 50;
        {
          std::lock_guard lock(media_mutex_);
          if (frame_request_) {
            const auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(
                                       next_frame_ - std::chrono::steady_clock::now())
                                       .count() +
                                   1;
            wait_ms = static_cast<DWORD>(std::clamp<std::int64_t>(remaining, 1, 50));
          }
        }
        const auto result = WaitForMultipleObjects(count + 1, events.data(), FALSE, wait_ms);
        if (result == WAIT_FAILED) {
          healthy = false;
          break;
        }
        bool ready_ok = true;
        const auto batch = pump_ready_events(
            [&] { return freerdp_check_event_handles(context_.get()) != FALSE; },
            [&] {
              // Exclude our media/input wakeup: only drain pending FreeRDP work.
              const auto ready = WaitForMultipleObjects(count, events.data(), FALSE, 0);
              ready_ok = ready == WAIT_TIMEOUT || ready < count;
              return ready_ok && ready != WAIT_TIMEOUT;
            },
            [&] { return stopping_ || freerdp_shall_disconnect_context(context_.get()); },
            [] { return std::chrono::steady_clock::now(); });
        pipeline_stats_.read(batch.checks, static_cast<std::uint64_t>(batch.elapsed.count()));
        if (!batch.healthy || !ready_ok) {
          healthy = false;
          break;
        }
        if (stopping_ || freerdp_shall_disconnect_context(context_.get()))
          break;
        input_pending();
        capture_pending();
      }
      connected_ = false;
      input_pending(true);
      capture_pending(true);
      const auto disconnected = freerdp_disconnect(context_->instance);
      state(stopping_ || (healthy && disconnected) ? RdpState::closed : RdpState::failed,
            stopping_ || (healthy && disconnected) ? RdpError::none : RdpError::disconnect);
    }
  } catch (...) {
    connected_ = false;
    if (context_->gdi) {
      // Attempt every tracked release before tearing down a failed transport.
      try {
        (void)input_state_.release([this](const auto &e) { return send_input(e); });
      } catch (...) {
      }
      (void)freerdp_disconnect(context_->instance);
    }
    erase_password();
    state(RdpState::failed, RdpError::protocol);
  }
  finished_ = true;
  condition_.notify_all();
}
} // namespace bridge
