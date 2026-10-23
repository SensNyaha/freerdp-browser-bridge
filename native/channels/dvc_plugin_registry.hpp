#pragma once
#include "dvc_listener_manager.hpp"
#include "dvc_plugin_proxy.hpp"

namespace bridge::channels {
struct DvcPluginRegistryStats {
  std::size_t retained_plugins = 0;
  bool closed = false, busy = false, failed = false, host_unpublished = false;
};
// One serialized pinned host, one shared manager. Entry borrows expire when
// install returns; plugin/name/proxy storage lasts through final host teardown.
class DvcPluginRegistry final {
public:
  static constexpr std::size_t capacity = 32;
  DvcPluginRegistry(DvcChannelRegistry &, DvcCompletionHook::Clock, void *clock_context = nullptr,
                    std::size_t slots = capacity);
  ~DvcPluginRegistry();
  DvcPluginRegistry(const DvcPluginRegistry &) = delete;
  DvcPluginRegistry &operator=(const DvcPluginRegistry &) = delete;
  UINT install(IDRDYNVC_ENTRY_POINTS &, PDVC_PLUGIN_ENTRY) noexcept;
  void close() noexcept;
  UINT retire() noexcept;
  UINT host_unpublished() noexcept;
  DvcPluginRegistryStats stats() const noexcept;

private:
  struct Box {
    IDRDYNVC_ENTRY_POINTS api{};
    DvcPluginRegistry *owner;
  } box_;
  struct Entry {
    std::array<char, 128> name{};
    IWTSPlugin *original = nullptr;
    std::unique_ptr<DvcPluginProxy> proxy;
  };
  DvcChannelRegistry &channels_;
  const DvcCompletionHook::Clock clock_;
  void *const clock_context_;
  const std::size_t slots_;
  std::array<Entry, capacity> entries_{};
  std::unique_ptr<DvcListenerManager> manager_;
  IWTSVirtualChannelManager *native_manager_ = nullptr;
  IDRDYNVC_ENTRY_POINTS *host_ = nullptr;
  Entry *capture_ = nullptr;
  bool closed_ = false, busy_ = false, resolving_ = false, failed_ = false, unpublished_ = false;
  static DvcPluginRegistry &owner(IDRDYNVC_ENTRY_POINTS *) noexcept;
  static UINT register_plugin(IDRDYNVC_ENTRY_POINTS *, const char *, IWTSPlugin *) noexcept;
  static IWTSPlugin *get_plugin(IDRDYNVC_ENTRY_POINTS *, const char *) noexcept;
  static const ADDIN_ARGV *get_data(IDRDYNVC_ENTRY_POINTS *) noexcept;
  static rdpSettings *get_settings(IDRDYNVC_ENTRY_POINTS *) noexcept;
  static rdpContext *get_context(IDRDYNVC_ENTRY_POINTS *) noexcept;
  static IWTSVirtualChannelManager *resolve(void *, IWTSVirtualChannelManager &);
};
} // namespace bridge::channels
