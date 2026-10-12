#pragma once
#include "dvc_svc_ingress.hpp"
#include <freerdp/freerdp.h>

namespace bridge::channels {
struct DvcReceiveStats {
  DvcSvcStats assembly;
  std::uint64_t failures = 0, notifications = 0, other_packets = 0;
  bool closed = false, failed = false;
};
// Serialized public ReceiveChannelData adapter. The caller owns callback routing,
// polls on the RDP thread and keeps this adapter alive through delegated calls.
class DvcReceiveGuard final {
public:
  using Resolve = UINT16 (*)(freerdp *);
  DvcReceiveGuard(freerdp &, pReceiveChannelData, DvcAllocationLimits = {},
                  Resolve = resolve_channel);
  DvcReceiveGuard(const DvcReceiveGuard &) = delete;
  DvcReceiveGuard &operator=(const DvcReceiveGuard &) = delete;
  bool receive(UINT16, const BYTE *, std::size_t, UINT32, std::size_t,
               std::uint64_t now_ms) noexcept;
  bool poll(std::uint64_t now_ms) noexcept;
  void close() noexcept;
  DvcReceiveStats stats() const noexcept;
  static UINT16 resolve_channel(freerdp *);

private:
  freerdp &instance_;
  const pReceiveChannelData delegate_;
  const Resolve resolve_;
  DvcSvcIngress ingress_;
  DvcReceiveStats counters_;
  UINT16 channel_ = 0;
  UINT32 metadata_ = 0;
  bool busy_ = false, closed_ = false, failed_ = false;
  bool fail() noexcept;
  bool call(UINT16, const BYTE *, std::size_t, UINT32, std::size_t);
  bool route(UINT16, const BYTE *, std::size_t, UINT32, std::size_t, std::uint64_t now_ms);
};
} // namespace bridge::channels
