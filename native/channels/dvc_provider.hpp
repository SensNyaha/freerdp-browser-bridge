#pragma once
#include "addin_scope.hpp"
#include "dvc_plugin_registry.hpp"
#include <atomic>

namespace bridge::channels {
// One synchronous RDP-thread scope. Registry/context outlive provider closure
// and all host plugin termination; other addin ABIs use the previous provider.
class DvcProvider final {
public:
  explicit DvcProvider(DvcPluginRegistry &registry) noexcept : registry_(registry) {}
  ~DvcProvider();
  DvcProvider(const DvcProvider &) = delete;
  DvcProvider &operator=(const DvcProvider &) = delete;
  UINT bind(rdpContext &) noexcept;
  UINT close() noexcept;
  bool bound() const noexcept { return scope_.bound(); }

private:
  struct Entry {
    std::array<char, 128> name{};
    PDVC_PLUGIN_ENTRY delegate = nullptr;
  };
  static std::atomic<DvcProvider *> active_;
  std::array<Entry, DvcPluginRegistry::capacity> entries_{};
  DvcPluginRegistry &registry_;
  AddinScope scope_;
  rdpContext *context_ = nullptr;
  std::thread::id thread_;
  bool used_ = false, loading_ = false, entering_ = false;
  bool on_thread() const noexcept;
  static PVIRTUALCHANNELENTRY load(LPCSTR, LPCSTR, LPCSTR, DWORD) noexcept;
  static UINT VCAPITYPE entry(IDRDYNVC_ENTRY_POINTS *) noexcept;
  static UINT VCAPITYPE denied(IDRDYNVC_ENTRY_POINTS *) noexcept;
};
} // namespace bridge::channels
