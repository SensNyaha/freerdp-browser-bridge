#pragma once
#include <algorithm>
#include <array>
#include <cstdint>
#include <mutex>

namespace bridge {
// Fixed-size recent timing window; no frame pixels, identifiers or input values.
class PipelineStats {
  std::mutex mutex_;
  std::uint64_t checks_{}, paints_{}, captures_{}, total_us_{}, max_us_{};
  std::uint64_t max_batch_{}, max_batch_us_{};
  std::array<std::uint64_t, 128> recent_{};

public:
  void paint() {
    std::lock_guard lock(mutex_);
    ++paints_;
  }
  void encode(std::uint64_t us) {
    std::lock_guard lock(mutex_);
    recent_[captures_ % recent_.size()] = us;
    ++captures_;
    total_us_ += us;
    max_us_ = (std::max)(max_us_, us);
  }
  void read(std::uint64_t count, std::uint64_t us) {
    std::lock_guard lock(mutex_);
    checks_ += count;
    max_batch_ = (std::max)(max_batch_, count);
    max_batch_us_ = (std::max)(max_batch_us_, us);
  }
  std::array<std::uint64_t, 8> snapshot() {
    std::lock_guard lock(mutex_);
    auto sorted = recent_;
    const auto size = static_cast<std::size_t>(std::min<std::uint64_t>(captures_, sorted.size()));
    std::sort(sorted.begin(), sorted.begin() + static_cast<std::ptrdiff_t>(size));
    return {checks_,
            paints_,
            captures_,
            captures_ ? total_us_ / captures_ : 0,
            size ? sorted[(size * 95 + 99) / 100 - 1] : 0,
            max_us_,
            max_batch_,
            max_batch_us_};
  }
};
} // namespace bridge
