#pragma once
#include "../compat/span.hpp"
#include "dvc_bounds.hpp"
#include <functional>
#include <vector>

namespace bridge::channels {
struct DvcSvcFragment {
  ::bridge::compat::span<const std::uint8_t> bytes;
  std::size_t total_bytes = 0;
  bool first = false, last = false;
};
struct DvcSvcStats {
  std::uint64_t fragments = 0, forwarded = 0, rejected = 0, abandoned = 0;
  std::size_t stored_bytes = 0, allocated_bytes = 0;
  bool partial = false, dispatching = false, closed = false, failed = false;
};
// Serialized outer-message owner only. Caller translates validated public SVC
// flags and keeps this owner alive until synchronous forwarding returns.
class DvcSvcIngress final {
public:
  using Forward = std::function<bool(::bridge::compat::span<const std::uint8_t>)>;
  explicit DvcSvcIngress(Forward, DvcAllocationLimits = {}, std::uint64_t timeout_ms = 2000);
  ~DvcSvcIngress();
  DvcSvcIngress(const DvcSvcIngress &) = delete;
  DvcSvcIngress &operator=(const DvcSvcIngress &) = delete;
  bool receive(DvcSvcFragment, std::uint64_t now_ms) noexcept;
  bool poll(std::uint64_t now_ms) noexcept;
  void close() noexcept;
  DvcSvcStats stats() const noexcept;

private:
  Forward forward_;
  const DvcAllocationLimits limits_;
  const std::uint64_t timeout_ms_;
  std::vector<std::uint8_t> bytes_;
  DvcSvcStats counters_;
  std::optional<std::uint64_t> observed_, deadline_;
  std::size_t total_ = 0, used_ = 0;
  bool closed_ = false, failed_ = false, busy_ = false;
  void release() noexcept;
  bool fail(bool abandoned = false) noexcept;
  bool clock(std::uint64_t) noexcept;
  bool dispatch(::bridge::compat::span<const std::uint8_t>) noexcept;
};
} // namespace bridge::channels
