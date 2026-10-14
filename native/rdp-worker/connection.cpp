#include "connection.hpp"
#include "addin_provider.hpp"
#include "cursor_convert.hpp"
#include "event_pump.hpp"
#include "gdi_dirty.hpp"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <freerdp/channels/channels.h>
#include <freerdp/client/cmdline.h>
#include <freerdp/config.h>
#include <freerdp/error.h>
#include <freerdp/gdi/gdi.h>
#include <freerdp/input.h>
#include <freerdp/scancode.h>
#include <freerdp/settings.h>
#include <limits>
#include <winpr/synch.h>
#include <winpr/wtsapi.h>
#ifdef _WIN32
#include <winpr/winsock.h>
#endif

namespace bridge {
using namespace ipc;
namespace {
std::uint64_t audio_time_us() {
  return static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(
                                        std::chrono::steady_clock::now().time_since_epoch())
                                        .count());
}
Packet audio_reset_reply(std::uint64_t id, ipc::audio::ResetResult result) {
  const auto body = ipc::audio::encode_reset_result(result);
  return {Kind::audio_reset_result, id, {body.begin(), body.end()}};
}
Packet microphone_reset_reply(std::uint64_t id, ipc::microphone::ResetResult result) {
  const auto body = ipc::microphone::encode_reset_result(result);
  return {Kind::microphone_reset_result, id, {body.begin(), body.end()}};
}
} // namespace
// Keep the physical international-key wire table aligned with pinned public API.
static_assert(RDP_SCANCODE_ABNT_C1 == 0x73 && RDP_SCANCODE_BACKSLASH_JP == 0x7d &&
              RDP_SCANCODE_HIRAGANA == 0x70 && RDP_SCANCODE_CONVERT_JP == 0x79 &&
              RDP_SCANCODE_NONCONVERT_JP == 0x7b && RDP_SCANCODE_HANGUL == 0x72 &&
              RDP_SCANCODE_HANJA == 0x71 && RDP_SCANCODE_ABNT_C2 == 0x7e);
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
BOOL Connection::receive_channels(freerdp *instance, UINT16 channel, const BYTE *data,
                                  std::size_t size, UINT32 flags, std::size_t total) {
  if (!instance || !instance->context)
    return FALSE;
  auto &self = owner(instance);
  if (!self.dvc_receive_ ||
      !self.dvc_receive_->receive(channel, data, size, flags, total, audio_time_us() / 1000)) {
    self.reason_ = RdpError::protocol;
    return FALSE;
  }
  return TRUE;
}
BOOL Connection::receive_delegated(freerdp *instance, UINT16 channel, const BYTE *data,
                                   std::size_t size, UINT32 flags, std::size_t total) {
  auto &self = owner(instance);
  const auto now = audio_time_us() / 1000;
  if (!self.receive_original_ || !self.dvc_channels_ || !self.dvc_plugins_ ||
      !self.dvc_channels_->poll(now) || self.dvc_plugins_->stats().failed)
    return FALSE;
  const auto dynamic_id = freerdp_channels_get_id_by_name(instance, "drdynvc");
  // The outer guard passes whole inspected DVC messages here, before native
  // DATA_FIRST allocation. Empty SUSPEND/RESUME notifications carry no PDU.
  if (dynamic_id && channel == dynamic_id &&
      !(flags & (CHANNEL_FLAG_SUSPEND | CHANNEL_FLAG_RESUME)) &&
      !self.dvc_channels_->admit({data, size}, now))
    return FALSE;
  const auto accepted = self.receive_original_(instance, channel, data, size, flags, total);
  // Negative CREATE and some close paths leave the SDK global error zero.
  return accepted && self.dvc_channels_->poll(audio_time_us() / 1000) &&
         !self.dvc_plugins_->stats().failed;
}
Connection::Connection(std::function<void(const Packet &)> send,
                       bridge::audio::PcmPublisher::TrySend audio_send,
                       bridge::audio::PcmPublisher::TryDiscard audio_discard)
    : context_(nullptr, freerdp_client_context_free), send_(std::move(send)),
      audio_send_(std::move(audio_send)), audio_discard_(std::move(audio_discard)), cursor_(send_) {
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
#if defined(__linux__)
  // Settings creation requires the inherited HOME, but session files belong to
  // the private worker cwd. Use the public settings API without changing HOME.
  if (!freerdp_settings_set_string(context_->settings, FreeRDP_HomePath, ".") ||
      !freerdp_settings_set_string(context_->settings, FreeRDP_ConfigPath, ".") ||
      !freerdp_settings_set_string(context_->settings, FreeRDP_ActionScript, nullptr))
    throw std::runtime_error("FreeRDP private paths initialization failed");
#endif
  reinterpret_cast<Context *>(context_.get())->owner = this;
  auto *instance = context_->instance;
  instance->PreConnect = pre_connect;
  instance->LoadChannels = load_channels;
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
#if (defined(_WIN32) || defined(__linux__)) && defined(CHANNEL_RDPSND_CLIENT)
  if ((c.pcm_output || c.opus_output) && (!audio_send_ || !audio_discard_))
    throw ProtocolError();
#else
  if (c.pcm_output || c.opus_output)
    throw ProtocolError();
#endif
  // Raw private schema-7/8 input only; typed/public Opus selection remains gated.
#if defined(_WIN32) && defined(CHANNEL_AUDIN_CLIENT)
  if ((c.pcm_input || c.opus_input) && !audio_send_)
    throw ProtocolError();
#else
  if (c.pcm_input || c.opus_input)
    throw ProtocolError();
#endif
  if (c.pcm_input || c.opus_input) {
    std::lock_guard lock(microphone_mutex_);
    if (microphone_handoff_->pending())
      throw ProtocolError();
    microphone_handoff_ = std::make_unique<bridge::audio::CaptureHandoff>(
        c.opus_input ? bridge::audio::CaptureCodec::opus : bridge::audio::CaptureCodec::pcm);
  }
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
  // Add the guarded static channel in PreConnect. TRUE here would let the
  // pinned generic loader auto-add an unprotected dynamic rdpsnd channel.
  boolean(FreeRDP_AudioPlayback, FALSE);
  boolean(FreeRDP_AudioCapture, c.pcm_input || c.opus_input);
#ifdef CHANNEL_RDPEI_CLIENT
  boolean(FreeRDP_MultiTouchInput, c.touch);
#else
  if (c.touch)
    throw ProtocolError();
  boolean(FreeRDP_MultiTouchInput, FALSE);
#endif
#ifdef CHANNEL_DISP_CLIENT
  boolean(FreeRDP_SupportDisplayControl, TRUE);
#else
  boolean(FreeRDP_SupportDisplayControl, FALSE);
#endif
  // Layout writes belong to the RDP thread, never to FreeRDP window automation.
  boolean(FreeRDP_DynamicResolutionUpdate, FALSE);
#ifdef CHANNEL_RDPGFX_CLIENT
  boolean(FreeRDP_SupportGraphicsPipeline, c.color_depth == 32);
#else
  boolean(FreeRDP_SupportGraphicsPipeline, FALSE);
#endif
  boolean(FreeRDP_SynchronousDynamicChannels, TRUE);
  boolean(FreeRDP_SynchronousStaticChannels, TRUE);
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
  if (self.config_->pcm_output || self.config_->opus_output) {
    const char *args[] = {"rdpsnd"}; // Provider supplies fixed browser/PCM arguments.
    if (!freerdp_client_add_static_channel(instance->context->settings, 1, args))
      return FALSE;
  }
  return TRUE; // The core replaces channels after PreConnect, then invokes LoadChannels.
}
BOOL Connection::load_channels(freerdp *instance) {
  const auto loaded =
      freerdp_client_load_addins(instance->context->channels, instance->context->settings);
  if (!loaded)
    owner(instance).reason_ = RdpError::protocol;
  return loaded;
}
void Connection::channel_connected(void *context, const ChannelConnectedEventArgs *event) {
  auto *base = static_cast<rdpContext *>(context);
  if (!event || !event->name)
    return;
  auto &self = owner(base->instance);
  if (std::strcmp(event->name, DISP_DVC_CHANNEL_NAME) == 0) {
    if (!self.display_.bind(*base, static_cast<DispClientContext *>(event->pInterface))) {
      self.reason_ = RdpError::protocol;
      setChannelError(base, ERROR_BAD_CONFIGURATION, "Bridge display initialization failed");
    }
  } else if (std::strcmp(event->name, RDPGFX_DVC_CHANNEL_NAME) == 0 &&
             !self.gfx_->bind(reinterpret_cast<Context *>(base)->base,
                              static_cast<RdpgfxClientContext *>(event->pInterface))) {
    self.reason_ = RdpError::protocol;
    setChannelError(base, ERROR_BAD_CONFIGURATION, "Bridge GFX initialization failed");
  }
}
void Connection::channel_disconnected(void *context, const ChannelDisconnectedEventArgs *event) {
  auto *base = static_cast<rdpContext *>(context);
  if (!event || !event->name)
    return;
  auto &self = owner(base->instance);
  if ((std::strcmp(event->name, DISP_DVC_CHANNEL_NAME) == 0 && !self.display_.unbind()) ||
      (std::strcmp(event->name, RDPGFX_DVC_CHANNEL_NAME) == 0 && !self.gfx_->unbind()))
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
  owner(instance).unicode_input_ =
      freerdp_settings_get_bool(instance->context->settings, FreeRDP_UnicodeInput) != FALSE;
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
    if (!owner(instance).display_.observe({width, height}))
      return FALSE;
    owner(instance).display_generation_ = 1;
    owner(instance).display_revision_ = owner(instance).dirty_.revision();
  } catch (...) {
    return FALSE;
  }
  return TRUE;
}
BOOL Connection::resize(rdpContext *context) {
  auto &self = owner(context->instance);
  (void)self.reset_touch();
  if (self.display_generation_ == (std::numeric_limits<std::uint64_t>::max)())
    return FALSE;
  if (!media::resize_gdi_desktop(context, self.dirty_))
    return FALSE;
  if (!self.display_.observe(
          {static_cast<UINT32>(context->gdi->width), static_cast<UINT32>(context->gdi->height)}))
    return FALSE;
  // A same-size graphics reset also invalidates a predictive chain. Encoders are lazy.
  self.encoder_.reset();
  self.avc_encoder_.reset();
  ++self.display_generation_;
  self.display_revision_ = self.dirty_.revision();
  return TRUE;
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
  const auto fps = requested_avc_ ? config_->h264_fps : config_->jpeg_fps;
  const auto interval = std::chrono::milliseconds((1000 + fps - 1) / fps);
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
        if (!avc_encoder_) {
          media::EncoderOptions options;
          options.fps = config_->h264_fps;
          options.bitrate = static_cast<int>(config_->target_bitrate);
          options.max_bitrate = static_cast<int>(config_->max_bitrate);
          avc_encoder_ = std::make_unique<media::SoftwareH264Encoder>(options);
        }
        avc = avc_encoder_->encode(
            {pixels, gdi->width, gdi->height, static_cast<int>(gdi->stride), timestamp},
            force_idr_);
      } else {
        if (!encoder_)
          encoder_ = std::make_unique<media::JpegEncoder>(config_->jpeg_quality);
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
      next_frame_ = now + interval;
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
  next_frame_ = now + interval;
}
void Connection::post_disconnect(freerdp *instance) {
  auto &self = owner(instance);
  if (!self.display_.unbind())
    self.reason_ = RdpError::protocol;
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
unsigned Connection::enqueue_input(std::uint64_t request, std::span<const std::uint8_t> payload,
                                   bool text) {
  const auto event = text ? input::decode_text(payload) : input::decode(payload);
  std::lock_guard lock(input_mutex_);
  if (!connected_ || stopping_)
    return 5;
  if (resizing_ && event.type != input::Type::reset)
    return 8;
  if (text && !unicode_input_)
    return 9;
  if (input_overflow_ || !input_queue_->push(request, event)) {
    input_overflow_ = true;
    if (!SetEvent(media_event_))
      throw ProtocolError();
    return 6;
  }
  if (!SetEvent(media_event_))
    throw ProtocolError();
  return 0;
}
unsigned Connection::enqueue_touch(std::uint64_t request, std::span<const std::uint8_t> payload) {
  // v1 is retained for codec compatibility, but has no geometry ownership token.
  if (payload.size() == 16) {
    (void)touch::decode_ipc(payload);
    return 10;
  }
  const auto event = touch::decode_request(payload);
  std::lock_guard lock(input_mutex_);
  if (!connected_ || stopping_)
    return 5;
  if (!config_->touch || !touch_ready_)
    return 10;
  if (resizing_)
    return 8;
  if (input_overflow_ || !input_queue_->push(request, event)) {
    input_overflow_ = true;
    if (!SetEvent(media_event_))
      throw ProtocolError();
    return 6;
  }
  if (!SetEvent(media_event_))
    throw ProtocolError();
  return 0;
}
bool Connection::reset_touch() {
  touch_ready_ = false;
#ifdef CHANNEL_RDPEI_CLIENT
  if (touch_contacts_) {
    touch_contacts_->reset();
    const auto drain = touch_contacts_->service();
    if (drain == touch::Drain::failed)
      throw ProtocolError();
    return touch_contacts_->owned() == 0;
  }
#endif
  return true;
}
void Connection::service_touch() {
#ifdef CHANNEL_RDPEI_CLIENT
  if (touch_contacts_ && touch_contacts_->service() == touch::Drain::failed)
    throw ProtocolError();
#endif
  publish_touch();
}
void Connection::publish_touch() {
#ifdef CHANNEL_RDPEI_CLIENT
  if (!connected_ || !context_->gdi || !display_generation_)
    return;
  auto availability = touch::Availability::unavailable;
  std::uint16_t contacts = 0;
  if (touch_contacts_) {
    const auto &gate = touch_registration_.gate();
    if (gate.phase() == touch::Phase::handshake)
      availability = touch::Availability::handshake;
    else if (gate.phase() == touch::Phase::suspended)
      availability = touch::Availability::suspended;
    else if (gate.ready()) {
      if (!gate.timestamps_disabled() || !gate.negotiated() ||
          gate.negotiated()->version <= RDPINPUT_PROTOCOL_V10)
        availability = touch::Availability::incompatible;
      else if (touch_contacts_->ready() && !resizing_ && !pending_reset_) {
        availability = touch::Availability::ready;
        contacts =
            static_cast<std::uint16_t>(std::min<std::uint16_t>(10, gate.negotiated()->contacts));
      } else
        availability = touch::Availability::draining;
    }
  }
  touch_ready_ = availability == touch::Availability::ready;
  touch::Update update{last_touch_ ? last_touch_->revision : 0,
                       display_generation_,
                       static_cast<std::uint16_t>(context_->gdi->width),
                       static_cast<std::uint16_t>(context_->gdi->height),
                       contacts,
                       config_->touch,
                       availability};
  if (last_touch_ && update == *last_touch_)
    return;
  if (update.revision == UINT64_MAX)
    throw ProtocolError();
  ++update.revision;
  send_({Kind::touch_update, 0, touch::encode_update(update)});
  last_touch_ = update;
#endif
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
  case input::Type::unicode:
    return freerdp_input_send_unicode_keyboard_event(
               in, e.flags ? KBD_FLAGS_DOWN : KBD_FLAGS_RELEASE, e.a) != FALSE;
  case input::Type::text:
  case input::Type::reset:
    return false; // Expanded to tracked releases by State, never sent directly.
  }
  return false;
}
void Connection::input_pending(bool ending) {
  std::lock_guard lock(input_mutex_);
  const input::State::Sink sink = [this](const auto &e) { return send_input(e); };
  const auto reject = [&](std::uint64_t request, unsigned code) {
    std::vector<std::uint8_t> p;
    append_be(p, code, 4);
    send_({Kind::error, request, std::move(p)});
  };
  if (ending || input_overflow_) {
    while (const auto record = input_queue_->pop())
      reject(record->request, ending ? 5 : 6);
    if (pending_reset_ && *pending_reset_)
      reject(*pending_reset_, ending ? 5 : 6);
    pending_reset_.reset();
    input_overflow_ = false;
    if (!input_state_.release(sink) && !ending)
      throw ProtocolError();
    const bool empty = reset_touch();
    if (ending)
      return;
    if (!empty) {
      pending_reset_ = 0; // Internal overflow cleanup has no request acknowledgement.
      reset_deadline_ = std::chrono::steady_clock::now() + std::chrono::seconds(2);
    }
  }
  service_touch();
  if (pending_reset_) {
    bool empty = true;
#ifdef CHANNEL_RDPEI_CLIENT
    empty = !touch_contacts_ || touch_contacts_->owned() == 0;
#endif
    if (!empty) {
      if (std::chrono::steady_clock::now() >= reset_deadline_)
        throw ProtocolError();
      return;
    }
    const auto request = *pending_reset_;
    pending_reset_.reset();
    publish_touch();
    if (request)
      send_({Kind::input_ack, request, {}});
  }
  while (const auto record = input_queue_->pop()) {
    const auto request = record->request;
    const auto *gdi = context_->gdi;
    if (!gdi)
      throw ProtocolError();
    if (const auto *event = std::get_if<input::Event>(&record->event)) {
      if (resizing_ && event->type != input::Type::reset) {
        reject(request, 8);
        continue;
      }
      if (!input_state_.apply(*event, sink, static_cast<std::uint16_t>(gdi->width),
                              static_cast<std::uint16_t>(gdi->height)))
        throw ProtocolError();
      if (event->type == input::Type::reset && !reset_touch()) {
        pending_reset_ = request;
        reset_deadline_ = std::chrono::steady_clock::now() + std::chrono::seconds(2);
        publish_touch();
        return;
      }
    } else {
      const auto &touch = std::get<touch::Request>(record->event);
      if (resizing_ || touch.generation != display_generation_) {
        reject(request, 8);
        continue;
      }
#ifdef CHANNEL_RDPEI_CLIENT
      if (!touch_contacts_ || !touch_contacts_->ready()) {
        reject(request, 10);
        continue;
      }
      const auto result =
          touch_contacts_->apply(touch.event, static_cast<std::uint32_t>(gdi->width),
                                 static_cast<std::uint32_t>(gdi->height));
      if (result == touch::Result::failed)
        throw ProtocolError();
      if (result != touch::Result::accepted) {
        reject(request, result == touch::Result::invalid ? 11
                        : result == touch::Result::full  ? 6
                                                         : 10);
        continue;
      }
#else
      reject(request, 10);
      continue;
#endif
    }
    send_({Kind::input_ack, request, {}});
  }
  publish_touch();
}
void Connection::publish_display() {
#ifndef CHANNEL_DISP_CLIENT
  return;
#else
  if (!display_generation_ || !display_revision_)
    return;
  const auto actual = display_.actual();
  if (!actual)
    throw ProtocolError();
  const auto caps = display_.capabilities();
  auto bytes = encode_display_update(
      {display_generation_,
       display_revision_,
       {static_cast<std::uint16_t>(actual->width), static_cast<std::uint16_t>(actual->height)},
       config_->dynamic_resolution,
       display_.ready(),
       {static_cast<std::uint16_t>(caps ? display::Control::max_width : 0),
        static_cast<std::uint16_t>(caps ? display::Control::max_height : 0)},
       static_cast<std::uint32_t>(caps ? caps->usable_area : 0)});
  if (bytes != last_display_) {
    send_({Kind::display_update, 0, bytes});
    last_display_ = std::move(bytes);
  }
#endif
}
void Connection::enqueue_resize(std::uint64_t request, std::span<const std::uint8_t> payload) {
  const auto size = decode_display_resize(payload);
  if (!request)
    throw ProtocolError();
  std::lock_guard lock(display_mutex_);
  if (!connected_ || stopping_) {
    send_({Kind::display_resize_result, request, encode_resize_result(ResizeResult::disconnected)});
  } else if (!config_->dynamic_resolution) {
    send_({Kind::display_resize_result, request, encode_resize_result(ResizeResult::unavailable)});
  } else if (queued_resize_ || active_resize_) {
    send_({Kind::display_resize_result, request, encode_resize_result(ResizeResult::busy)});
  } else {
    queued_resize_ = ResizeRequest{request, 0, size};
    resizing_ = true;
    if (!SetEvent(media_event_))
      throw ProtocolError();
  }
}
void Connection::resize_pending(bool ending) {
  std::lock_guard lock(display_mutex_);
  const auto reply = [&](std::optional<ResizeRequest> &request, ResizeResult result) {
    const auto id = request->id;
    request.reset();
    // Resume input before the parent can act on the completion reply.
    resizing_ = queued_resize_.has_value() || active_resize_.has_value();
    send_({Kind::display_resize_result, id, encode_resize_result(result)});
  };
  if (!ending)
    publish_display(); // The observed dimensions/reset precede any successful result/media.
  if (active_resize_) {
    if (ending)
      reply(active_resize_, ResizeResult::disconnected);
    else if (display_.expire(std::chrono::steady_clock::now()))
      reply(active_resize_, ResizeResult::timeout);
    else if (!display_.requested()) {
      const auto actual = display_.actual();
      const bool applied = actual && actual->width == active_resize_->size.width &&
                           actual->height == active_resize_->size.height &&
                           display_generation_ > active_resize_->generation;
      reply(active_resize_, applied ? ResizeResult::applied : ResizeResult::unavailable);
    }
  }
  if (queued_resize_) {
    if (ending) {
      reply(queued_resize_, ResizeResult::disconnected);
    } else {
      // Releases complete before sending layout; paused input is never replayed afterwards.
      if (!reset_touch() || pending_reset_)
        return;
      if (!input_state_.release([this](const auto &event) { return send_input(event); }))
        throw ProtocolError();
      queued_resize_->generation = display_generation_;
      const auto result =
          display_.request({queued_resize_->size.width, queued_resize_->size.height},
                           std::chrono::steady_clock::now());
      switch (result) {
      case display::Request::sent:
        active_resize_ = queued_resize_;
        queued_resize_.reset();
        break;
      case display::Request::unchanged:
        reply(queued_resize_, ResizeResult::unchanged);
        break;
      case display::Request::unavailable:
        reply(queued_resize_, ResizeResult::unavailable);
        break;
      case display::Request::invalid:
        reply(queued_resize_, ResizeResult::invalid);
        break;
      case display::Request::busy:
        reply(queued_resize_, ResizeResult::busy);
        break;
      case display::Request::send_failed:
        reply(queued_resize_, ResizeResult::send_failed);
        break;
      }
    }
  }
  resizing_ = queued_resize_.has_value() || active_resize_.has_value();
}
void Connection::enqueue_audio_reset(std::uint64_t request, std::span<const std::uint8_t> payload) {
  const auto epoch = ipc::audio::decode_reset(payload);
  std::optional<ipc::audio::ResetResult> result;
  {
    std::lock_guard lock(audio_reset_mutex_);
    result = audio_reset_.enqueue(request, epoch, audio_time_us(), connected_ && !stopping_);
    if (!result && !SetEvent(media_event_))
      throw ProtocolError();
  }
  if (result)
    send_(audio_reset_reply(request, *result));
}
bool Connection::publish_microphone(void *owner, Kind kind, std::span<const std::uint8_t> bytes) {
  auto &self = *static_cast<Connection *>(owner);
  if (kind != Kind::microphone_state)
    throw ProtocolError();
  const auto state = ipc::microphone::decode_state(bytes);
  // Admission and producer authority change together. Lock order: microphone -> output.
  std::lock_guard lock(self.microphone_mutex_);
  if (!self.audio_send_(kind, bytes))
    return false;
  if (!self.microphone_reset_.observe(state))
    throw ProtocolError();
  self.microphone_state_ = state;
  return true;
}
ipc::microphone::Result Connection::submit_microphone(void *owner,
                                                      const ipc::microphone::PcmPacket &packet) {
  auto &self = *static_cast<Connection *>(owner);
  return self.microphone_ ? self.microphone_->submit(packet) : ipc::microphone::Result::unavailable;
}
ipc::microphone::Result
Connection::submit_microphone_opus(void *owner, const ipc::microphone::opus::Packet &packet) {
  auto &self = *static_cast<Connection *>(owner);
  return self.microphone_opus_ ? self.microphone_opus_->submit(packet)
                               : ipc::microphone::Result::unavailable;
}
void Connection::enqueue_microphone(std::uint64_t request, std::span<const std::uint8_t> payload,
                                    bool opus) {
  // Validate the incoming grammar even when its profile is unselected.
  if (opus)
    (void)ipc::microphone::opus::decode_packet(payload);
  else
    (void)ipc::microphone::decode_pcm(payload);
  std::optional<ipc::microphone::Result> result;
  {
    std::lock_guard lock(microphone_mutex_);
    const auto epoch = microphone_state_ ? microphone_state_->epoch : 0;
    const bool ready = microphone_state_ &&
                       microphone_state_->availability == ipc::audio::Availability::ready &&
                       connected_ && !stopping_;
    if (!config_ || !(opus ? config_->opus_input : config_->pcm_input))
      result = ipc::microphone::Result::unavailable;
    else
      result = microphone_handoff_->enqueue(request, payload, audio_time_us(), epoch, ready);
    if (!result && !SetEvent(media_event_))
      throw ProtocolError();
  }
  if (result) {
    const auto body = ipc::microphone::encode_result(*result);
    send_({Kind::microphone_result, request, {body.begin(), body.end()}});
  }
}
void Connection::service_microphone(bool ending) {
  // Actual source stats are read on RDP owner, never by the IPC producer.
  const auto state = microphone_ ? microphone_->published_state() : std::nullopt;
  const auto stats = microphone_ ? microphone_->stats() : std::nullopt;
  const auto epoch = stats ? stats->source.epoch : 0;
  bool ready = !ending && connected_ && !stopping_ && state && stats &&
               state->availability == ipc::audio::Availability::ready && state->epoch == epoch &&
               stats->source.opened && microphone_->input_ready(epoch);
  if (microphone_opus_)
    ready = microphone_opus_->synchronize() && ready;
  std::optional<bridge::audio::CaptureCompletion> completion;
  bool codec_failed = false;
  {
    std::lock_guard lock(microphone_mutex_);
    completion =
        config_ && config_->opus_input
            ? microphone_handoff_->service_opus(audio_time_us(), epoch, ready,
                                                submit_microphone_opus, this)
            : microphone_handoff_->service(audio_time_us(), epoch, ready, submit_microphone, this);
    if (microphone_opus_) {
      const auto codec = microphone_opus_->stats();
      if (!codec)
        throw ProtocolError();
      codec_failed = codec->failed;
      if (ending && !microphone_opus_->retire())
        throw ProtocolError();
    }
    if (ending && !microphone_handoff_->retire())
      throw ProtocolError();
  }
  if (completion) {
    const auto body = ipc::microphone::encode_result(completion->result);
    send_({Kind::microphone_result, completion->request_id, {body.begin(), body.end()}});
  }
  if (codec_failed)
    throw ProtocolError(); // Correlated completion precedes terminal connection failure.
}
void Connection::enqueue_microphone_reset(std::uint64_t request,
                                          std::span<const std::uint8_t> payload) {
  const auto epoch = ipc::microphone::decode_reset(payload);
  std::optional<ipc::microphone::ResetResult> result;
  {
    std::lock_guard lock(microphone_mutex_);
    result = microphone_reset_.enqueue(request, epoch, audio_time_us(), connected_ && !stopping_);
    if (!result && !SetEvent(media_event_))
      throw ProtocolError();
  }
  if (result)
    send_(microphone_reset_reply(request, *result));
}
void Connection::service_microphone_reset(bool ending) {
  std::optional<bridge::audio::ResetCompletion> completion;
  {
    std::lock_guard lock(microphone_mutex_);
    completion =
        microphone_reset_.service(audio_time_us(), !ending && connected_ && !stopping_, [this] {
          const auto state = microphone_ ? microphone_->published_state() : std::nullopt;
          const auto stats = microphone_ ? microphone_->stats() : std::nullopt;
          if (!(state && stats && stats->source.opened &&
                state->availability == ipc::audio::Availability::ready &&
                state->epoch == stats->source.epoch &&
                microphone_->reset_capture(state->epoch).status ==
                    bridge::audio::AudinCaptureResetStatus::reset))
            return false;
          if (microphone_opus_ && !microphone_opus_->invalidate())
            throw ProtocolError();
          return true;
        });
  }
  if (completion)
    send_(microphone_reset_reply(completion->request_id, completion->result));
}
void Connection::service_audio_reset(bool ending) {
  std::optional<bridge::audio::ResetCompletion> completion;
  {
    std::lock_guard lock(audio_reset_mutex_);
    completion = audio_reset_.service(audio_time_us(), !ending && connected_ && !stopping_, [this] {
      const auto stats = audio_ ? audio_->stats() : std::nullopt;
      return stats && stats->source.availability == bridge::audio::SourceAvailability::ready &&
             audio_->reset();
    });
  }
  if (completion)
    send_(audio_reset_reply(completion->request_id, completion->result));
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
  auto terminal_state = RdpState::failed;
  auto terminal_error = RdpError::protocol;
  bool explicitly_disconnected = false;
  const auto receive_delegate = context_->instance->ReceiveChannelData;
  bool receive_installed = false;
  std::unique_ptr<channels::DvcProvider> dvc_provider;
  bool dvc_retired = false;
  unsigned diagnostic_stage = 0;
  bool diagnostic_emitted = false;
  const auto diagnose_failure = [&]() noexcept {
    if (diagnostic_emitted)
      return;
    diagnostic_emitted = true;
    const auto receive = dvc_receive_ ? dvc_receive_->stats() : channels::DvcReceiveStats{};
    const auto registry =
        dvc_channels_ ? dvc_channels_->stats() : channels::DvcChannelRegistryStats{};
    (void)std::fprintf(
        stderr,
        "bridge.rdp.failure v=1 stage=%u channel=%u receive=%u assembly=%u registry=%u plugins=%u "
        "reserved=%llu active=%llu abandoned=%llu\n",
        diagnostic_stage, static_cast<unsigned>(getChannelError(context_.get())),
        static_cast<unsigned>(receive.failed), static_cast<unsigned>(receive.assembly.failed),
        static_cast<unsigned>(registry.failed),
        static_cast<unsigned>(dvc_plugins_ && dvc_plugins_->stats().failed),
        static_cast<unsigned long long>(registry.budget.reserved_bytes),
        static_cast<unsigned long long>(registry.budget.active),
        static_cast<unsigned long long>(registry.budget.abandonments));
  };
  UINT dvc_retirement = CHANNEL_RC_OK;
  const auto retire_dvc = [&]() noexcept -> UINT {
    if (dvc_retired)
      return dvc_retirement;
    if (dvc_provider)
      dvc_retirement = dvc_provider->close();
    else if (dvc_plugins_)
      dvc_retirement = dvc_plugins_->retire();
    else if (dvc_channels_)
      dvc_retirement = dvc_channels_->retire();
    if (dvc_retirement == ERROR_IO_PENDING || (dvc_provider && dvc_provider->bound()))
      std::terminate(); // Never let SDK plugin teardown free a currently borrowed target.
    dvc_retired = true;
    return dvc_retirement;
  };
#ifdef CHANNEL_RDPEI_CLIENT
  touch::AddinProvider touch_provider;
#endif
  try {
    if (!freerdp_settings_get_bool(context_->settings, FreeRDP_SynchronousDynamicChannels) ||
        freerdp_settings_get_bool(context_->settings, FreeRDP_AsyncChannels) ||
        freerdp_settings_get_bool(context_->settings, FreeRDP_AsyncUpdate))
      throw ProtocolError();
    const auto clock = [](void *) -> std::uint64_t { return audio_time_us() / 1000; };
    dvc_channels_ = std::make_unique<channels::DvcChannelRegistry>(clock);
    dvc_plugins_ = std::make_unique<channels::DvcPluginRegistry>(*dvc_channels_, clock);
    receive_original_ = receive_delegate;
    dvc_receive_ = std::make_unique<channels::DvcReceiveGuard>(
        *context_->instance, receive_delegated, channels::DvcAllocationLimits{},
        channels::DvcReceiveGuard::resolve_channel,
        channels::DvcReceiveGuard::resolve_audio_channel);
    context_->instance->ReceiveChannelData = receive_channels;
    receive_installed = true;
#ifdef CHANNEL_RDPEI_CLIENT
    // client_context_new installs the default process provider. Bind only here,
    // after context creation/configuration, on the synchronous RDP dispatch thread.
    if (touch_provider.bind(*context_, touch_registration_) != CHANNEL_RC_OK)
      throw ProtocolError();
    if (config_->touch)
      touch_contacts_ = std::make_unique<touch::Contacts>(touch_registration_);
#endif
    if (config_->pcm_output || config_->opus_output)
      audio_ = std::make_unique<bridge::audio::AudioSession>(
          *context_,
          [this](Kind kind, std::span<const std::uint8_t> bytes) {
            std::optional<ipc::audio::State> state;
            if (kind == Kind::audio_state)
              state = config_->opus_output ? ipc::audio::opus::decode_state(bytes)
                                           : ipc::audio::decode_state(bytes);
            if (!audio_send_(kind, bytes))
              return false;
            if (state) {
              std::lock_guard lock(audio_reset_mutex_);
              if (!audio_reset_.observe(*state))
                throw ProtocolError();
            }
            return true;
          },
          audio_discard_, bridge::audio::AudioSession::Drain{}, 1000000,
          config_->opus_output ? OutputAudioCodec::opus : OutputAudioCodec::pcm,
          config_->audio_buffer_200 ? bridge::audio::OutputBufferProfile::compatibility
                                    : bridge::audio::OutputBufferProfile::low_latency);
    if (config_->pcm_input || config_->opus_input)
      microphone_ =
          std::make_unique<bridge::audio::MicrophoneSession>(*context_, publish_microphone, this);
    if (config_->opus_input)
      microphone_opus_ = std::make_unique<bridge::audio::MicrophoneOpusOwner>(*microphone_);
    // Last scope is first to retire, before microphone/audio/touch providers.
    dvc_provider = std::make_unique<channels::DvcProvider>(*dvc_plugins_);
    if (dvc_provider->bind(*context_) != CHANNEL_RC_OK)
      throw ProtocolError();
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
    if (dvc_plugins_->stats().failed) {
      reason_ = RdpError::protocol;
      if (connected)
        throw ProtocolError();
    }
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
      terminal_state = stopping_ ? RdpState::closed : RdpState::failed;
      terminal_error = stopping_ ? RdpError::none : error;
    } else {
      connected_ = true;
      state(RdpState::connected);
      publish_display();
      service_touch();
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
        DWORD wait_ms = audio_ || microphone_ ? 20 : 50;
        {
          std::lock_guard lock(media_mutex_);
          if (frame_request_) {
            const auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(
                                       next_frame_ - std::chrono::steady_clock::now())
                                       .count() +
                                   1;
            wait_ms = static_cast<DWORD>(std::clamp<std::int64_t>(remaining, 1, 50));
            if (audio_ || microphone_)
              wait_ms = std::min<DWORD>(wait_ms, 20);
          }
        }
        if (microphone_) {
          if (const auto microphone_deadline = microphone_->capture_deadline()) {
            const auto now = audio_time_us();
            const auto remaining =
                *microphone_deadline <= now ? 0 : (*microphone_deadline - now + 999) / 1000;
            wait_ms = std::min<DWORD>(wait_ms,
                                      static_cast<DWORD>(std::min<std::uint64_t>(remaining, 20)));
          }
        }
        const auto result = WaitForMultipleObjects(count + 1, events.data(), FALSE, wait_ms);
        if (result == WAIT_FAILED) {
          healthy = false;
          break;
        }
        diagnostic_stage = 1;
        if (!dvc_receive_->poll(audio_time_us() / 1000) ||
            !dvc_channels_->poll(audio_time_us() / 1000) || dvc_plugins_->stats().failed)
          throw ProtocolError();
        diagnostic_stage = 2;
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
        diagnostic_stage = 3;
        if (!dvc_receive_->poll(audio_time_us() / 1000) ||
            !dvc_channels_->poll(audio_time_us() / 1000) || dvc_plugins_->stats().failed)
          throw ProtocolError();
        if (stopping_ || freerdp_shall_disconnect_context(context_.get()))
          break;
        diagnostic_stage = 4;
        input_pending();
        diagnostic_stage = 5;
        resize_pending();
        diagnostic_stage = 6;
        service_audio_reset();
        diagnostic_stage = 7;
        service_microphone_reset();
        diagnostic_stage = 8;
        service_microphone();
        if (microphone_) {
          const auto microphone_publication = microphone_->pump(audio_time_us());
          if (microphone_publication == bridge::audio::MicrophonePump::failed ||
              microphone_publication == bridge::audio::MicrophonePump::invalid)
            throw ProtocolError();
        }
        diagnostic_stage = 9;
        if (audio_) {
          const auto published = audio_->pump(audio_time_us());
          if (published == bridge::audio::PublishStatus::failed ||
              published == bridge::audio::PublishStatus::invalid)
            throw ProtocolError();
        }
        diagnostic_stage = 10;
        capture_pending();
      }
      connected_ = false;
      if (!healthy)
        (void)std::fprintf(stderr, "bridge.rdp.channel_error=%u\n",
                           static_cast<unsigned>(getChannelError(context_.get())));
      resize_pending(true);
      input_pending(true);
      capture_pending(true);
      const auto retired = retire_dvc();
      const auto disconnected = freerdp_disconnect(context_->instance);
      explicitly_disconnected = true;
      terminal_state = disconnected && retired == CHANNEL_RC_OK && (stopping_ || healthy)
                           ? RdpState::closed
                           : RdpState::failed;
      terminal_error =
          terminal_state == RdpState::closed
              ? RdpError::none
              : (dvc_receive_->stats().failed || retired != CHANNEL_RC_OK ? RdpError::protocol
                                                                          : RdpError::disconnect);
    }
  } catch (...) {
    // Code-owned scalars only. Snapshot before retirement erases fault ownership.
    diagnose_failure();
    connected_ = false;
    try {
      resize_pending(true);
      input_pending(true);
    } catch (...) {
    }
    if (context_->gdi) {
      // Attempt every tracked release before tearing down a failed transport.
      try {
        (void)input_state_.release([this](const auto &e) { return send_input(e); });
      } catch (...) {
      }
    }
    erase_password();
    terminal_state = RdpState::failed;
    terminal_error = RdpError::protocol;
  }
  // ContextFree does not synthesize host Terminated. Registered channels must
  // receive public disconnect even if connect failed before GDI was initialized.
  if (retire_dvc() != CHANNEL_RC_OK) {
    terminal_state = RdpState::failed;
    terminal_error = RdpError::protocol;
  }
  if (!explicitly_disconnected && !freerdp_disconnect(context_->instance)) {
    terminal_state = RdpState::failed;
    terminal_error = RdpError::protocol;
  }
  if (dvc_plugins_) {
    const auto status = dvc_plugins_->host_unpublished();
    if (!dvc_plugins_->stats().host_unpublished)
      std::terminate(); // Pinned synchronous disconnect must end every registered plugin.
    if (status != CHANNEL_RC_OK) {
      terminal_state = RdpState::failed;
      terminal_error = RdpError::protocol;
    }
  }
  try {
    service_microphone_reset(true);
  } catch (...) {
    terminal_state = RdpState::failed;
    terminal_error = RdpError::protocol;
  }
  try {
    service_microphone(true);
  } catch (...) {
    terminal_state = RdpState::failed;
    terminal_error = RdpError::protocol;
  }
  // Microphone was bound above output audio and touch: retire scopes in reverse.
  if (microphone_) {
    auto retired = microphone_->retire(audio_time_us());
    while (retired == bridge::audio::MicrophoneRetirement::pending) {
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
      retired = microphone_->retire(audio_time_us());
    }
    const auto stats = microphone_->stats();
    if (!stats || !stats->resources_retired)
      std::terminate(); // Worker fault; preserve live callback targets until process exit.
    if (retired != bridge::audio::MicrophoneRetirement::done) {
      terminal_state = RdpState::failed;
      terminal_error = RdpError::protocol;
    }
  }
  try {
    service_audio_reset(true);
  } catch (...) {
    terminal_state = RdpState::failed;
    terminal_error = RdpError::protocol;
  }
  if (audio_) {
    auto retired = audio_->retire(audio_time_us());
    while (retired == bridge::audio::RetireStatus::pending) {
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
      retired = audio_->retire(audio_time_us());
    }
    const auto stats = audio_->stats();
    if (!stats || !stats->resources_retired)
      std::terminate(); // Owned worker fault; never free live host callback targets.
    // Fixed lifetime counters only; never emit sample, credential or peer data.
    (void)std::fprintf(stderr,
                       "bridge.audio.summary chunks=%llu overflow=%llu skipped=%llu late=%llu "
                       "revisions=%llu resets=%llu packets=%llu\n",
                       static_cast<unsigned long long>(stats->source.chunked_packets),
                       static_cast<unsigned long long>(stats->source.overflow_resets),
                       static_cast<unsigned long long>(stats->source.queue.playback_skipped_frames),
                       static_cast<unsigned long long>(stats->source.packets.skipped_intervals),
                       static_cast<unsigned long long>(stats->source.stream_revision),
                       static_cast<unsigned long long>(stats->publisher.consumer_resets),
                       static_cast<unsigned long long>(stats->publisher.sent_packets));
    const auto &clock = stats->ingress.clock;
    (void)std::fprintf(
        stderr,
        "bridge.audio.causes first=%llu profile=%llu block=%llu arrivalBackward=%llu "
        "arrivalGap=%llu timestampBackward=%llu timestampGap=%llu formats=%llu "
        "close=%llu\n",
        static_cast<unsigned long long>(clock.first),
        static_cast<unsigned long long>(clock.profile),
        static_cast<unsigned long long>(clock.block),
        static_cast<unsigned long long>(clock.arrival_backward),
        static_cast<unsigned long long>(clock.arrival_gap),
        static_cast<unsigned long long>(clock.timestamp_backward),
        static_cast<unsigned long long>(clock.timestamp_gap),
        static_cast<unsigned long long>(stats->ingress.formats),
        static_cast<unsigned long long>(stats->ingress.closes));
    if (retired != bridge::audio::RetireStatus::done) {
      terminal_state = RdpState::failed;
      terminal_error = RdpError::protocol;
    }
  }
  // Also covers connect failures before PostDisconnect; clear callbacks while context lives.
  if (!display_.unbind()) {
    reason_ = RdpError::protocol;
    terminal_state = RdpState::failed;
    terminal_error = RdpError::protocol;
  }
#ifdef CHANNEL_RDPEI_CLIENT
  // Retire delegated input resources before the RDP thread exits. Context may be
  // freed later on the owner thread; only the wrapper's published no-op survives.
  touch_contacts_.reset();
  if (touch_provider.close() != CHANNEL_RC_OK) {
    reason_ = RdpError::protocol;
    terminal_state = RdpState::failed;
    terminal_error = RdpError::protocol;
  }
#endif
  if (terminal_error == RdpError::protocol && !diagnostic_emitted) {
    diagnostic_stage = 11; // Protocol failure reported during retirement, not a caught loop fault.
    diagnose_failure();
  }
  // Publish one terminal outcome only after all owned callback resources retire.
  if (dvc_receive_)
    dvc_receive_->close();
  if (receive_installed) {
    if (context_->instance->ReceiveChannelData == receive_channels)
      context_->instance->ReceiveChannelData = receive_delegate;
    else {
      terminal_state = RdpState::failed;
      terminal_error = RdpError::protocol;
    }
  }
  receive_original_ = nullptr;
  // A cleanup error must not produce the invalid public transition closed -> failed.
  state(terminal_state, terminal_error);
  finished_ = true;
  condition_.notify_all();
}
} // namespace bridge
