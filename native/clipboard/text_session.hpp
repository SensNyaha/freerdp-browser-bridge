#pragma once
#include "../compat/span.hpp"
#include "html.hpp"
#include "image.hpp"
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
  bool html = false;
  bool image = false;
};
struct TextSnapshot {
  std::uint64_t revision = 0;
  bool ready = false, remote_text = false, local_accepted = false;
  bool awaiting_local = false, awaiting_remote = false, failed = false;
  bool local_response_ok = false;
  bool remote_html = false, local_html_accepted = false;
  bool remote_image = false, local_image_accepted = false;
};
struct HtmlView {
  ::bridge::compat::span<const std::uint8_t> body;
  std::size_t fragment_offset = 0, fragment_bytes = 0;
  std::size_t selection_offset = 0, selection_bytes = 0;
  bool context = false, selection = false;
  std::size_t wire_bytes = 0; // Admitted CF_HTML size, used for aggregate item quota.
};
struct ImageView {
  std::uint32_t width = 0, height = 0;
  ::bridge::compat::span<const std::uint8_t> rgba;
  std::size_t wire_bytes = 0;
};
// Exclusive public CLIPRDR text/HTML/image callback owner. Bind/dispatch/poll/close on the
// constructing RDP thread with a synchronous SDK; context must outlive close.
// Notifications borrow text only until callback return. No OS clipboard access.
class TextSession final {
public:
  using Clock = std::function<std::uint64_t()>;
  using Offer = std::function<bool(std::uint64_t, bool)>;
  using Reply =
      std::function<bool(std::uint64_t, TextReply, ::bridge::compat::span<const std::uint8_t>)>;
  // Borrow only validated UTF8 body, never CF_HTML headers/SourceURL/padding.
  // Offsets are relative to body; refused/stale replies have an empty view.
  using HtmlReply = std::function<bool(std::uint64_t, TextReply, HtmlView)>;
  // Validated compact top-down straight sRGB RGBA8, borrowed through callback return.
  // Refused/stale replies carry zero dimensions and no pixels/encoded length.
  using ImageReply = std::function<bool(std::uint64_t, TextReply, ImageView)>;
  using Resolve = UINT16 (*)(freerdp *);
  static UINT16 resolve_channel(freerdp *);
  TextSession(TextPolicy, Offer, Reply, Clock, Resolve = resolve_channel, HtmlReply = {},
              ImageReply = {});
  ~TextSession();
  TextSession(const TextSession &) = delete;
  TextSession &operator=(const TextSession &) = delete;
  UINT bind(CliprdrClientContext &) noexcept;
  UINT set_local(::bridge::compat::span<const std::uint8_t>) noexcept;
  // One item, optionally with a Unicode fallback. Maximum covers the sum of
  // both encoded representations. Empty fallback differs from absent fallback.
  UINT set_local_html(::bridge::compat::span<const std::uint8_t> fragment,
                      std::optional<::bridge::compat::span<const std::uint8_t>> text = {}) noexcept;
  // One image-only item. Complete canonical CF_DIBV5 budget is checked before
  // allocation; successful replacement wipes all previous representations.
  UINT set_local_image(::bridge::compat::span<const std::uint8_t> rgba, std::uint32_t width,
                       std::uint32_t height) noexcept;
  // No formats, distinct from offering an empty Unicode value. One local ACK
  // must finish before revocation; cached text is wiped before the SDK call.
  UINT revoke_local() noexcept;
  UINT request(std::uint64_t revision, std::uint64_t request_id) noexcept;
  UINT request_html(std::uint64_t revision, std::uint64_t request_id) noexcept;
  UINT request_image(std::uint64_t revision, std::uint64_t request_id) noexcept;
  bool poll() noexcept;
  bool close() noexcept;
  std::optional<TextSnapshot> snapshot() const noexcept;

private:
  struct Operation;
  const TextPolicy policy_;
  Offer offer_;
  Reply reply_;
  HtmlReply html_reply_;
  ImageReply image_reply_;
  Clock clock_;
  Resolve resolve_;
  UINT16 revoke_channel_ = 0;
  const std::thread::id thread_ = std::this_thread::get_id();
  CliprdrClientContext *context_ = nullptr;
  CliprdrClientContext saved_{};
  TextSnapshot state_;
  std::vector<std::uint8_t> local_, local_html_, local_image_;
  UINT32 remote_html_id_ = 0;
  UINT32 remote_image_id_ = 0;
  enum class Format { text, html, image };
  Format request_format_ = Format::text;
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
  UINT request_format(std::uint64_t, std::uint64_t, Format) noexcept;
  UINT received_html(const CLIPRDR_FORMAT_DATA_RESPONSE &, std::uint64_t id) noexcept;
  UINT received_image(const CLIPRDR_FORMAT_DATA_RESPONSE &, std::uint64_t id) noexcept;
  static TextSession *owner(CliprdrClientContext *) noexcept;
  static UINT capabilities(CliprdrClientContext *, const CLIPRDR_CAPABILITIES *) noexcept;
  static UINT ready(CliprdrClientContext *, const CLIPRDR_MONITOR_READY *) noexcept;
  static UINT formats(CliprdrClientContext *, const CLIPRDR_FORMAT_LIST *) noexcept;
  static UINT acknowledged(CliprdrClientContext *, const CLIPRDR_FORMAT_LIST_RESPONSE *) noexcept;
  static UINT requested(CliprdrClientContext *, const CLIPRDR_FORMAT_DATA_REQUEST *) noexcept;
  static UINT received(CliprdrClientContext *, const CLIPRDR_FORMAT_DATA_RESPONSE *) noexcept;
};
} // namespace bridge::clipboard
