#pragma once
#include "../compat/span.hpp"
#include "text.hpp"
#include <freerdp/client/cliprdr.h>
#include <functional>
#include <optional>
#include <thread>
#include <vector>

namespace bridge::clipboard {
enum class TextReply { ok, refused, stale };
struct TextPolicy {
  bool to_server = false, from_server = false;
  std::size_t maximum = max_item_bytes;
};
struct TextSnapshot {
  std::uint64_t revision = 0;
  bool ready = false, remote_text = false, local_accepted = false;
  bool awaiting_local = false, awaiting_remote = false, failed = false;
  bool local_response_ok = false;
};
// Exclusive public CLIPRDR text callback owner. Bind/dispatch/poll/close on the
// constructing RDP thread with a synchronous SDK; context must outlive close.
// Notifications borrow text only until callback return. No OS clipboard access.
class TextSession final {
public:
  using Clock = std::function<std::uint64_t()>;
  using Offer = std::function<bool(std::uint64_t, bool)>;
  using Reply = std::function<bool(std::uint64_t, TextReply, ::bridge::compat::span<const std::uint8_t>)>;
  using Resolve = UINT16 (*)(freerdp *);
  static UINT16 resolve_channel(freerdp *);
  TextSession(TextPolicy, Offer, Reply, Clock, Resolve = resolve_channel);
  ~TextSession();
  TextSession(const TextSession &) = delete;
  TextSession &operator=(const TextSession &) = delete;
  UINT bind(CliprdrClientContext &) noexcept;
  UINT set_local(::bridge::compat::span<const std::uint8_t>) noexcept;
  // No formats, distinct from offering an empty Unicode value. One local ACK
  // must finish before revocation; cached text is wiped before the SDK call.
  UINT revoke_local() noexcept;
  UINT request(std::uint64_t revision, std::uint64_t request_id) noexcept;
  bool poll() noexcept;
  bool close() noexcept;
  std::optional<TextSnapshot> snapshot() const noexcept;

private:
  struct Operation;
  const TextPolicy policy_;
  Offer offer_;
  Reply reply_;
  Clock clock_;
  Resolve resolve_;
  UINT16 revoke_channel_ = 0;
  const std::thread::id thread_ = std::this_thread::get_id();
  CliprdrClientContext *context_ = nullptr;
  CliprdrClientContext saved_{};
  TextSnapshot state_;
  std::vector<std::uint8_t> local_;
  std::uint64_t now_ = 0, local_deadline_ = 0, remote_deadline_ = 0;
  std::uint64_t request_ = 0, request_revision_ = 0;
  bool clock_seen_ = false, busy_ = false, closed_ = false, bound_once_ = false;
  UINT32 capability_flags_ = 0;
  bool begin() noexcept;
  void finish() noexcept;
  void release() noexcept;
  void wipe_local() noexcept;
  UINT fail() noexcept;
  UINT advertise() noexcept;
  static TextSession *owner(CliprdrClientContext *) noexcept;
  static UINT capabilities(CliprdrClientContext *, const CLIPRDR_CAPABILITIES *) noexcept;
  static UINT ready(CliprdrClientContext *, const CLIPRDR_MONITOR_READY *) noexcept;
  static UINT formats(CliprdrClientContext *, const CLIPRDR_FORMAT_LIST *) noexcept;
  static UINT acknowledged(CliprdrClientContext *, const CLIPRDR_FORMAT_LIST_RESPONSE *) noexcept;
  static UINT requested(CliprdrClientContext *, const CLIPRDR_FORMAT_DATA_REQUEST *) noexcept;
  static UINT received(CliprdrClientContext *, const CLIPRDR_FORMAT_DATA_RESPONSE *) noexcept;
};
} // namespace bridge::clipboard
