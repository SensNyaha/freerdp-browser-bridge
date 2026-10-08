#pragma once
#include "certificate.hpp"
#include "connection_config.hpp"
#include "jpeg.hpp"
#include "video_encoder.hpp"
#include <atomic>
#include <condition_variable>
#include <freerdp/client.h>
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
    rdpClientContext base;
    Connection *owner;
  };
  using ContextPtr = std::unique_ptr<rdpContext, decltype(&freerdp_client_context_free)>;
  ContextPtr context_;
  std::function<void(const ipc::Packet &)> send_;
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
  std::uint64_t frame_request_ = 0, requested_revision_ = 0, revision_ = 0;
  std::chrono::steady_clock::time_point next_frame_{};
  std::unique_ptr<media::JpegEncoder> encoder_;
  std::unique_ptr<media::SoftwareH264Encoder> avc_encoder_;
  bool requested_avc_ = false, force_idr_ = false;
  void capture_pending(bool ending = false);
  void state(RdpState state, RdpError error = RdpError::none) noexcept;
  void run() noexcept;
  void erase_password() noexcept;
  static Connection &owner(freerdp *instance);
  static BOOL pre_connect(freerdp *instance);
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
  explicit Connection(std::function<void(const ipc::Packet &)> send);
  ~Connection();
  void configure(std::span<const std::uint8_t> payload);
  void secret(std::span<const std::uint8_t> payload);
  void start();
  void decide(std::span<const std::uint8_t> payload);
  bool capture(std::uint64_t request, std::span<const std::uint8_t> payload, bool avc);
  void stop() noexcept;
};
} // namespace bridge
