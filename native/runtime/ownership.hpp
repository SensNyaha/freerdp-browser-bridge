#pragma once
#include <array>
#include <filesystem>
#include <optional>
#include <stdexcept>
#include <string_view>

namespace bridge::runtime {
struct RuntimeIdentity {
  std::array<char, 32> owner{};
  std::array<char, 32> session{};
};
std::optional<RuntimeIdentity> runtime_identity(std::string_view name) noexcept;
std::optional<RuntimeIdentity> runtime_identity(std::wstring_view name) noexcept;
class RuntimeOwnershipError final : public std::runtime_error {
public:
  RuntimeOwnershipError() : std::runtime_error("RUNTIME_OWNERSHIP_REFUSED") {}
};
// Holds the directory identity and exclusive marker lock. No filesystem mutation.
// Paths/ancestors come from the trusted host, never from a browser request.
class RuntimeLease final {
#ifdef _WIN32
  void *directory_ = nullptr;
  void *marker_ = nullptr;
#else
  int directory_ = -1;
  int marker_ = -1;
#endif
  void close() noexcept;

public:
  explicit RuntimeLease(const std::filesystem::path &directory);
  ~RuntimeLease();
  RuntimeLease(const RuntimeLease &) = delete;
  RuntimeLease &operator=(const RuntimeLease &) = delete;
  RuntimeLease(RuntimeLease &&) = delete;
  RuntimeLease &operator=(RuntimeLease &&) = delete;
};
} // namespace bridge::runtime
