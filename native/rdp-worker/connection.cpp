#include "connection.hpp"
#include <algorithm>
#include <chrono>
#include <cstring>
#include <freerdp/client/cmdline.h>
#include <freerdp/error.h>
#include <freerdp/gdi/gdi.h>
#include <freerdp/settings.h>
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
    : context_(nullptr, freerdp_client_context_free), send_(std::move(send)) {
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
  boolean(FreeRDP_SupportGraphicsPipeline, FALSE);
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
  return freerdp_client_load_addins(instance->context->channels, instance->context->settings);
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
  ++owner(instance).revision_;
  return TRUE;
}
BOOL Connection::resize(rdpContext *context) {
  const auto width = freerdp_settings_get_uint32(context->settings, FreeRDP_DesktopWidth);
  const auto height = freerdp_settings_get_uint32(context->settings, FreeRDP_DesktopHeight);
  if (width == 0 || width > 7680 || height == 0 || height > 4320)
    return FALSE;
  if (!gdi_resize(context->gdi, width, height))
    return FALSE;
  ++owner(context->instance).revision_;
  return TRUE;
}
BOOL Connection::begin_paint(rdpContext *context) {
  context->gdi->primary->hdc->hwnd->invalid->null = TRUE;
  return TRUE;
}
BOOL Connection::end_paint(rdpContext *context) {
  if (!context->gdi->primary->hdc->hwnd->invalid->null)
    ++owner(context->instance).revision_;
  return TRUE;
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
  const bool changed = !ending && (revision_ != requested_revision_ || force_idr_);
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
  append_be(payload, revision_, 8);
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
  frame_request_ = 0;
  next_frame_ = now + std::chrono::milliseconds(requested_avc_ ? 34 : 50);
}
void Connection::post_disconnect(freerdp *instance) { gdi_free(instance); }
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
        capture_pending();
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
        if (result == WAIT_FAILED || !freerdp_check_event_handles(context_.get())) {
          healthy = false;
          break;
        }
      }
      connected_ = false;
      capture_pending(true);
      const auto disconnected = freerdp_disconnect(context_->instance);
      state(stopping_ || (healthy && disconnected) ? RdpState::closed : RdpState::failed,
            stopping_ || (healthy && disconnected) ? RdpError::none : RdpError::disconnect);
    }
  } catch (...) {
    connected_ = false;
    erase_password();
    state(RdpState::failed, RdpError::protocol);
  }
  finished_ = true;
  condition_.notify_all();
}
} // namespace bridge
