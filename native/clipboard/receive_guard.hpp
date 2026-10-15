#pragma once
#include "ingress.hpp"
#include <freerdp/freerdp.h>

namespace bridge::clipboard {
// Public ReceiveChannelData adapter. The RDP owner installs/routes/polls it and
// retains it through synchronous delegated callbacks. Not selected by the worker.
class ClipboardReceiveGuard final {
public:
  using Resolve = UINT16 (*)(freerdp *);
  ClipboardReceiveGuard(freerdp &, pReceiveChannelData, std::size_t maximum = max_item_bytes,
                        Resolve = resolve_channel);
  ClipboardReceiveGuard(const ClipboardReceiveGuard &) = delete;
  ClipboardReceiveGuard &operator=(const ClipboardReceiveGuard &) = delete;
  bool receive(UINT16, const BYTE *, std::size_t, UINT32, std::size_t, std::uint64_t) noexcept;
  bool poll(std::uint64_t) noexcept;
  void close() noexcept;
  IngressStats stats() const noexcept;
  static UINT16 resolve_channel(freerdp *);

private:
  freerdp &instance_;
  const pReceiveChannelData delegate_;
  const Resolve resolve_;
  ClipboardIngress ingress_;
  UINT16 channel_ = 0;
  UINT32 metadata_ = 0;
  bool busy_ = false, closed_ = false, failed_ = false;
  bool fail() noexcept;
  bool route(UINT16, const BYTE *, std::size_t, UINT32, std::size_t, std::uint64_t);
};
} // namespace bridge::clipboard
