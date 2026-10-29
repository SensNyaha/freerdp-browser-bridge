#pragma once
#include "rdpdr_budget.hpp"
#include <atomic>
#include <freerdp/freerdp.h>
#include <freerdp/svc.h>
#include <winpr/stream.h>
#include <thread>

namespace bridge::files::rdpdr {
struct StaticGateStats {
  WriteBudgetStats budget;
  std::uint64_t writes = 0, completions = 0, cancellations = 0, refusals = 0;
  std::uint64_t pool_trims = 0;
  std::size_t dispatches_since_idle = 0;
  bool failed = false, retired = false, terminated = false;
};
// Pinned RDPDR public synchronous SVC wrapper: write tokens MUST be the SDK's
// public wStream objects. No private plugin layout is used. One serialized owner.
// It must remain alive
// THROUGH the host's final Terminated event, including after provider detach.
// Final Terminated is also allowed on a joined context-destruction thread.
class StaticGate {
public:
  using Clock = std::uint64_t (*)();
  explicit StaticGate(rdpContext &, Clock = monotonic_ms);
  ~StaticGate();
  StaticGate(const StaticGate &) = delete;
  StaticGate &operator=(const StaticGate &) = delete;
  BOOL install(CHANNEL_ENTRY_POINTS_FREERDP_EX *, LPVOID, PVIRTUALCHANNELENTRYEX) noexcept;
  bool ready_for(const rdpContext &) const noexcept;
  // Poll with the same clock used by callbacks; caller clock epochs differ
  // between Windows GetTickCount64 and std::chrono::steady_clock.
  bool poll() noexcept;
  UINT retire() noexcept;
  std::optional<StaticGateStats> stats() const noexcept;
  static std::uint64_t monotonic_ms();

private:
  rdpContext &context_;
  const Clock clock_;
  const std::thread::id thread_;
  CHANNEL_ENTRY_POINTS_FREERDP_EX host_{}, wrapped_{};
  LPVOID handle_ = nullptr, delegate_user_ = nullptr;
  PCHANNEL_INIT_EVENT_EX_FN delegate_init_ = nullptr;
  PCHANNEL_OPEN_EVENT_EX_FN delegate_open_ = nullptr;
  DWORD open_handle_ = 0, completion_handle_ = 0;
  WriteBudget budget_;
  wStreamPool *pool_ = nullptr;
  Ingress ingress_;
  StaticGateStats counters_;
  std::atomic<bool> failed_{false}, host_terminated_{false};
  bool attempted_ = false, registered_ = false, installing_ = false;
  bool initialized_ = false, connected_ = false, disconnected_ = false;
  bool retiring_ = false, retired_ = false, finalizing_ = false;
  bool busy_ = false, writing_ = false, closing_ = false, completing_ = false;
  bool init_observed_ = false;
  UINT close_status_ = CHANNEL_RC_OK;
  bool on_thread() const noexcept;
  void fail() noexcept;
  void disconnect() noexcept;
  void finish() noexcept;
  void complete(BorrowedWrite, UINT) noexcept;
  void trim_idle() noexcept;
  static UINT VCAPITYPE init(LPVOID, LPVOID, LPVOID, PCHANNEL_DEF, INT, ULONG, PCHANNEL_INIT_EVENT_EX_FN) noexcept;
  static UINT VCAPITYPE open(LPVOID, LPDWORD, PCHAR, PCHANNEL_OPEN_EVENT_EX_FN) noexcept;
  static UINT VCAPITYPE close(LPVOID, DWORD) noexcept;
  static UINT VCAPITYPE write(LPVOID, DWORD, LPVOID, ULONG, LPVOID) noexcept;
  static void VCAPITYPE init_event(LPVOID, LPVOID, UINT, LPVOID, UINT) noexcept;
  static void VCAPITYPE open_event(LPVOID, DWORD, UINT, LPVOID, UINT, UINT, UINT) noexcept;
};
} // namespace bridge::files::rdpdr
