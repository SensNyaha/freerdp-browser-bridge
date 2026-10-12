#pragma once
#include "../audio/capture_handoff.hpp"
#include "../audio/microphone_opus_owner.hpp"
#include "../audio/microphone_session.hpp"
#include "../audio/reset_control.hpp"
#include "../audio/session.hpp"
#include "certificate.hpp"
#include "connection_config.hpp"
#include "contacts.hpp"
#include "control.hpp"
#include "cursor.hpp"
#include "dirty_regions.hpp"
#include "dispatch_queue.hpp"
#include "display.hpp"
#include "gfx.hpp"
#include "input.hpp"
#include "jpeg.hpp"
#include "pipeline_stats.hpp"
#include "rdpei_plugin.hpp"
#include "video_encoder.hpp"
#include <atomic>
#include <condition_variable>
#include <deque>
#include <freerdp/client.h>
#include <freerdp/config.h>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <thread>
#include <winpr/synch.h>

namespace bridge {
enum class RdpState : std::uint16_t { connecting = 1, awaiting_user, connected, closed, failed };
enum class RdpError : std::uint16_t {
  none,
  connection,
  authentication,
  certificate,
  timeout,
  protocol,
  cancelled,
  disconnect
};
class Connection {
  struct Context {
    media::GfxClientContext base;
    Connection *owner;
  };
  using ContextPtr = std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)>;
#ifdef CHANNEL_RDPEI_CLIENT
  // Declared before context_: the host's final plugin callback must see this wrapper.
  touch::PluginRegistration touch_registration_;
  std::unique_ptr<touch::Contacts> touch_contacts_;
#endif
  // Host final callbacks must see this wrapper through context destruction.
  std::unique_ptr<audio::AudioSession> audio_;
  std::unique_ptr<audio::MicrophoneSession> microphone_;
  std::unique_ptr<audio::MicrophoneOpusOwner> microphone_opus_;
  ContextPtr context_;
  std::function<void(const ipc::Packet &)> send_;
  audio::PcmPublisher::TrySend audio_send_;
  audio::PcmPublisher::TryDiscard audio_discard_;
  std::mutex audio_reset_mutex_;
  audio::ResetControl audio_reset_;
  void service_audio_reset(bool ending = false);
  std::mutex microphone_mutex_;
  std::unique_ptr<audio::CaptureHandoff> microphone_handoff_ =
      std::make_unique<audio::CaptureHandoff>();
  audio::ResetControl microphone_reset_;
  std::optional<ipc::microphone::State> microphone_state_;
  static bool publish_microphone(void *, ipc::Kind, std::span<const std::uint8_t>);
  static ipc::microphone::Result submit_microphone(void *, const ipc::microphone::PcmPacket &);
  static ipc::microphone::Result submit_microphone_opus(void *,
                                                        const ipc::microphone::opus::Packet &);
  void service_microphone(bool ending = false);
  void service_microphone_reset(bool ending = false);
  std::optional<ipc::ConnectionConfig> config_;
  bool supplied_ = false, started_ = false;
  std::atomic<bool> stopping_{false}, timed_out_{false}, finished_{false};
  std::thread thread_;
  std::mutex mutex_;
  std::condition_variable condition_;
  std::uint64_t challenge_ = 0;
  std::optional<CertificateCheck> certificate_;
  std::optional<bool> decision_;
  std::atomic<RdpError> reason_{RdpError::none};
  std::mutex media_mutex_;
  HANDLE media_event_ = nullptr;
  std::atomic<bool> connected_{false};
  std::uint64_t frame_request_ = 0, requested_revision_ = 0;
  media::DirtyRegions dirty_;
  std::unique_ptr<media::Gfx> gfx_ = std::make_unique<media::Gfx>();
  display::Control display_;
  struct ResizeRequest {
    std::uint64_t id, generation;
    ipc::DisplaySize size;
  };
  std::mutex display_mutex_;
  std::optional<ResizeRequest> queued_resize_, active_resize_;
  std::atomic<bool> resizing_{false};
  std::uint64_t display_generation_ = 0, display_revision_ = 0;
  std::vector<std::uint8_t> last_display_;
  void publish_display();
  void resize_pending(bool ending = false);
  bool subscribed_connected_ = false, subscribed_disconnected_ = false;
  std::chrono::steady_clock::time_point next_frame_{};
  std::unique_ptr<media::JpegEncoder> encoder_;
  std::unique_ptr<media::SoftwareH264Encoder> avc_encoder_;
  bool requested_avc_ = false, force_idr_ = false;
  std::mutex input_mutex_;
  std::unique_ptr<input::Queue> input_queue_ = std::make_unique<input::Queue>();
  std::optional<std::uint64_t> pending_reset_;
  std::chrono::steady_clock::time_point reset_deadline_{};
  std::atomic<bool> touch_ready_{false};
  std::optional<touch::Update> last_touch_;
  void service_touch();
  void publish_touch();
  bool reset_touch();
  bool input_overflow_ = false;
  input::State input_state_;
  std::atomic<bool> unicode_input_{false};
  PipelineStats pipeline_stats_;
  cursor::State cursor_;
  std::uint64_t next_cursor_id_ = 0;
  static BOOL pointer_new(rdpContext *context, rdpPointer *pointer);
  static BOOL pointer_set(rdpContext *context, rdpPointer *pointer);
  static BOOL pointer_null(rdpContext *context);
  static BOOL pointer_default(rdpContext *context);
  static BOOL pointer_position(rdpContext *context, UINT32 x, UINT32 y);
  bool send_input(const input::Event &event);
  void input_pending(bool ending = false);
  void capture_pending(bool ending = false);
  void state(RdpState state, RdpError error = RdpError::none) noexcept;
  void run() noexcept;
  void erase_password() noexcept;
  static Connection &owner(freerdp *instance);
  static BOOL pre_connect(freerdp *instance);
  static BOOL load_channels(freerdp *instance);
  static void channel_connected(void *context, const ChannelConnectedEventArgs *event);
  static void channel_disconnected(void *context, const ChannelDisconnectedEventArgs *event);
  static BOOL post_connect(freerdp *instance);
  static BOOL resize(rdpContext *context);
  static BOOL begin_paint(rdpContext *context);
  static BOOL end_paint(rdpContext *context);
  static void post_disconnect(freerdp *instance);
  static BOOL authenticate(freerdp *instance, char **username, char **password, char **domain,
                           rdp_auth_reason reason);
  static int verify(freerdp *instance, const BYTE *pem, std::size_t length, const char *host,
                    UINT16 port, DWORD flags);

public:
  explicit Connection(std::function<void(const ipc::Packet &)> send,
                      audio::PcmPublisher::TrySend audio_send = {},
                      audio::PcmPublisher::TryDiscard audio_discard = {});
  ~Connection();
  void configure(std::span<const std::uint8_t> payload);
  void secret(std::span<const std::uint8_t> payload);
  void start();
  void decide(std::span<const std::uint8_t> payload);
  bool capture(std::uint64_t request, std::span<const std::uint8_t> payload, bool avc);
  unsigned enqueue_input(std::uint64_t request, std::span<const std::uint8_t> payload,
                         bool text = false);
  unsigned enqueue_touch(std::uint64_t request, std::span<const std::uint8_t> payload);
  void enqueue_resize(std::uint64_t request, std::span<const std::uint8_t> payload);
  void enqueue_audio_reset(std::uint64_t request, std::span<const std::uint8_t> payload);
  void enqueue_microphone_reset(std::uint64_t request, std::span<const std::uint8_t> payload);
  void enqueue_microphone(std::uint64_t request, std::span<const std::uint8_t> payload,
                          bool opus = false);
  std::vector<std::uint8_t> pipeline_stats();
  void stop() noexcept;
};
} // namespace bridge
