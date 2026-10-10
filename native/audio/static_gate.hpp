#pragma once
#include "ingress.hpp"
#include "pcm_offer.hpp"
#include "rdpsnd_sink.hpp"
#include <freerdp/svc.h>

namespace bridge::audio {
// Pinned public static-channel adapter. Must outlive the host's Terminated event.
// One serialized RDP owner; synchronous profile. Not installed by the worker yet.
class AudioStaticGate {
  CHANNEL_ENTRY_POINTS_FREERDP_EX host_{}, wrapped_{};
  rdpContext *context_;
  RdpsndSink &sink_;
  std::thread::id thread_;
  AudioAssembler assembler_;
  AudioPduValidator validator_;
  std::array<BYTE, max_pcm_offer_bytes> offers_{};
  std::uint16_t selected_count_ = 0;
  LPVOID handle_ = nullptr, delegate_user_ = nullptr;
  PCHANNEL_INIT_EVENT_EX_FN delegate_init_ = nullptr;
  PCHANNEL_OPEN_EVENT_EX_FN delegate_open_ = nullptr;
  std::array<LPVOID, 64> writes_{};
  char channel_[7] = "rdpsnd", subsystem_[12] = "sys:browser", format_[9] = "format:1";
  char *arg_values_[3]{channel_, subsystem_, format_};
  ADDIN_ARGV args_{3, arg_values_};
  DWORD open_handle_ = 0, completion_handle_ = 0;
  bool attempted_ = false, registered_ = false, connected_ = false, disconnected_ = false;
  bool failed_ = false;
  bool busy_ = false, writing_ = false;
  std::atomic<bool> retired_{false}, host_terminated_{false};
  bool on_thread() const noexcept;
  void fail() noexcept;
  static UINT VCAPITYPE init(LPVOID, LPVOID, LPVOID, PCHANNEL_DEF, INT, ULONG,
                             PCHANNEL_INIT_EVENT_EX_FN) noexcept;
  static UINT VCAPITYPE open(LPVOID, LPDWORD, PCHAR, PCHANNEL_OPEN_EVENT_EX_FN) noexcept;
  static UINT VCAPITYPE close(LPVOID, DWORD) noexcept;
  static UINT VCAPITYPE write(LPVOID, DWORD, LPVOID, ULONG, LPVOID) noexcept;
  static void VCAPITYPE init_event(LPVOID, LPVOID, UINT, LPVOID, UINT) noexcept;
  static void VCAPITYPE open_event(LPVOID, DWORD, UINT, LPVOID, UINT, UINT, UINT) noexcept;

public:
  AudioStaticGate(rdpContext &, RdpsndSink &) noexcept(false);
  ~AudioStaticGate();
  AudioStaticGate(const AudioStaticGate &) = delete;
  AudioStaticGate &operator=(const AudioStaticGate &) = delete;
  BOOL install(CHANNEL_ENTRY_POINTS_FREERDP_EX *, LPVOID, PVIRTUALCHANNELENTRYEX) noexcept;
  UINT retire() noexcept;
  bool ready_for(const rdpContext &, const RdpsndSink &) const noexcept;
  bool retired() const noexcept { return retired_.load(std::memory_order_acquire); }
};
} // namespace bridge::audio
