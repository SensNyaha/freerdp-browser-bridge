#pragma once
#include "text.hpp"
#include <array>
#include <functional>
#include <optional>
#include <vector>

namespace bridge::clipboard {
inline constexpr std::size_t max_control_bytes = 65536, max_formats = 64, max_name_bytes = 512;
struct PduInfo {
  std::uint16_t kind;
  bool long_names;
  bool quota_refused = false;
};
// Complete CLIPRDR record inspection; no allocation and no content diagnostics.
// A quota_refused result must be replaced with failure, never forwarded as data.
std::optional<PduInfo> inspect_pdu(std::span<const std::uint8_t>, bool long_names,
                                   std::size_t maximum) noexcept;
struct SvcFragment {
  std::span<const std::uint8_t> bytes;
  std::size_t total;
  bool first, last;
};
struct IngressStats {
  std::uint64_t forwarded = 0, rejected = 0, quota_refused = 0;
  std::size_t stored = 0, allocated = 0, fragments = 0;
  bool partial = false, closed = false, failed = false, discarding = false;
};
// One serialized SVC message. Header is inspected in fixed storage before any
// body allocation. A complete packet is borrowed until synchronous forwarding ends.
class ClipboardIngress final {
public:
  using Forward = std::function<bool(std::span<const std::uint8_t>)>;
  static constexpr std::size_t max_fragments = 16384;
  explicit ClipboardIngress(Forward, std::size_t maximum = max_item_bytes,
                            std::uint64_t timeout_ms = 2000);
  ~ClipboardIngress();
  ClipboardIngress(const ClipboardIngress &) = delete;
  ClipboardIngress &operator=(const ClipboardIngress &) = delete;
  bool receive(SvcFragment, std::uint64_t now_ms) noexcept;
  bool poll(std::uint64_t now_ms) noexcept;
  void close() noexcept;
  IngressStats stats() const noexcept;

private:
  Forward forward_;
  const std::size_t maximum_;
  const std::uint64_t timeout_;
  std::array<std::uint8_t, 8> header_{};
  std::vector<std::uint8_t> bytes_;
  std::size_t used_ = 0, total_ = 0, fragments_ = 0;
  std::optional<std::uint64_t> observed_, deadline_;
  IngressStats counters_;
  bool long_names_ = false, closed_ = false, failed_ = false, busy_ = false;
  bool discarding_ = false;
  void release() noexcept;
  bool fail() noexcept;
  bool dispatch(std::span<const std::uint8_t>, bool quota_refused = false) noexcept;
};
} // namespace bridge::clipboard
