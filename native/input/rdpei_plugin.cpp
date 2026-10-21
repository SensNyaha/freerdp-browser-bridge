#include "../compat/bit.hpp"
#include "rdpei_plugin.hpp"
#include <cstring>
#include <freerdp/channels/channels.h>
#include <freerdp/client/channels.h>
#include <type_traits>
#include <winpr/error.h>

namespace bridge::touch {
namespace {
bool named(const char *name) noexcept {
  return name && std::strcmp(name, RDPEI_DVC_CHANNEL_NAME) == 0;
}
template <class Call> UINT checked(Call call) noexcept {
  try {
    return call();
  } catch (...) {
    return ERROR_INTERNAL_ERROR;
  }
}
} // namespace
template <class Api> PluginRegistration &PluginRegistration::get(Api *api) noexcept {
  static_assert(std::is_standard_layout_v<Box<Api>>);
  return *reinterpret_cast<Box<Api> *>(api)->owner;
}
bool PluginRegistration::on_thread() const noexcept {
  return thread_ == std::thread::id{} || thread_ == std::this_thread::get_id();
}
PluginRegistration::PluginRegistration() noexcept {
  entries_.api.RegisterPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *name,
                                   IWTSPlugin *plugin) -> UINT {
    auto &s = get(p);
    if (!s.on_thread() || !s.host_ || !s.busy_ || s.retired())
      return ERROR_INVALID_STATE;
    if (!named(name) || !plugin || !plugin->Initialize || !plugin->Terminated ||
        !plugin->pInterface)
      return ERROR_INVALID_PARAMETER;
    if (s.delegate_)
      return CHANNEL_RC_ALREADY_INITIALIZED;
    s.delegate_ = plugin; // Entry owns failure cleanup until it returns success.
    return CHANNEL_RC_OK;
  };
  entries_.api.GetPlugin = [](IDRDYNVC_ENTRY_POINTS *p, const char *name) -> IWTSPlugin * {
    auto &s = get(p);
    if (!s.on_thread() || !s.host_)
      return nullptr;
    if (named(name) && s.delegate_)
      return s.delegate_;
    try {
      return s.host_->GetPlugin(s.host_, name);
    } catch (...) {
      return nullptr;
    }
  };
  entries_.api.GetPluginData = [](IDRDYNVC_ENTRY_POINTS *p) -> const ADDIN_ARGV * {
    auto &s = get(p);
    if (!s.on_thread() || !s.host_)
      return nullptr;
    try {
      return s.host_->GetPluginData ? s.host_->GetPluginData(s.host_) : nullptr;
    } catch (...) {
      return nullptr;
    }
  };
  entries_.api.GetRdpContext = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpContext * {
    auto &s = get(p);
    return s.on_thread() && s.host_ ? s.context_ : nullptr;
  };
  entries_.api.GetRdpSettings = [](IDRDYNVC_ENTRY_POINTS *p) -> rdpSettings * {
    auto &s = get(p);
    return s.on_thread() && s.host_ && s.context_ ? s.context_->settings : nullptr;
  };
  plugin_.api.Initialize = [](IWTSPlugin *p, IWTSVirtualChannelManager *m) -> UINT {
    return get(p).initialize(m);
  };
  plugin_.api.Connected = [](IWTSPlugin *p) -> UINT {
    auto &s = get(p);
    return s.notify(s.delegate_ ? s.delegate_->Connected : nullptr);
  };
  plugin_.api.Attached = [](IWTSPlugin *p) -> UINT {
    auto &s = get(p);
    return s.notify(s.delegate_ ? s.delegate_->Attached : nullptr);
  };
  plugin_.api.Detached = [](IWTSPlugin *p) -> UINT {
    auto &s = get(p);
    return s.notify(s.delegate_ ? s.delegate_->Detached : nullptr);
  };
  plugin_.api.Disconnected = [](IWTSPlugin *p, DWORD code) -> UINT {
    return get(p).disconnect(code);
  };
  plugin_.api.Terminated = [](IWTSPlugin *p) -> UINT { return get(p).terminate(); };
  manager_.api.CreateListener = [](IWTSVirtualChannelManager *m, const char *name, ULONG flags,
                                   IWTSListenerCallback *cb, IWTSListener **out) -> UINT {
    return get(m).create_listener(name, flags, cb, out);
  };
  manager_.api.DestroyListener = [](IWTSVirtualChannelManager *m, IWTSListener *listener) -> UINT {
    return get(m).destroy_listener(listener);
  };
  manager_.api.FindChannelById = [](IWTSVirtualChannelManager *m,
                                    UINT32 id) -> IWTSVirtualChannel * {
    auto &s = get(m);
    try {
      return s.host_manager_->FindChannelById
                 ? s.host_manager_->FindChannelById(s.host_manager_, id)
                 : nullptr;
    } catch (...) {
      return nullptr;
    }
  };
  listener_callback_.api.OnNewChannelConnection = [](IWTSListenerCallback *l, IWTSVirtualChannel *c,
                                                     BYTE *data, BOOL *accept,
                                                     IWTSVirtualChannelCallback **out) -> UINT {
    return get(l).new_channel(c, data, accept, out);
  };
}
PluginRegistration::~PluginRegistration() { (void)terminate(); }
UINT PluginRegistration::install(IDRDYNVC_ENTRY_POINTS *host, PDVC_PLUGIN_ENTRY entry) noexcept {
  if (retired() || !on_thread() || attempted_ || busy_)
    return ERROR_INVALID_STATE;
  if (!host || !host->RegisterPlugin || !host->GetPlugin || !host->GetRdpContext ||
      !host->GetRdpSettings)
    return ERROR_INVALID_PARAMETER;
  rdpContext *base = nullptr;
  try {
    base = host->GetRdpContext(host);
    if (!base || !base->settings || base->settings != host->GetRdpSettings(host) ||
        !freerdp_settings_get_bool(base->settings, FreeRDP_SynchronousDynamicChannels) ||
        freerdp_settings_get_bool(base->settings, FreeRDP_AsyncChannels) ||
        freerdp_settings_get_bool(base->settings, FreeRDP_AsyncUpdate))
      return ERROR_INVALID_PARAMETER;
    if (host->GetPlugin(host, RDPEI_DVC_CHANNEL_NAME))
      return CHANNEL_RC_ALREADY_INITIALIZED;
  } catch (...) {
    return ERROR_INTERNAL_ERROR;
  }
  if (!entry) {
    const auto linked = freerdp_channels_load_static_addin_entry(
        RDPEI_CHANNEL_NAME, nullptr, nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC);
    if (!linked)
      return ERROR_NOT_SUPPORTED;
    entry = ::bridge::compat::bit_cast<PDVC_PLUGIN_ENTRY>(linked);
  }
  thread_ = std::this_thread::get_id();
  attempted_ = true;
  host_ = host;
  context_ = base;
  busy_ = true;
  auto result = checked([&] { return entry(&entries_.api); });
  busy_ = false;
  host_ = nullptr; // Host entry points are stack-borrowed for the entry call only.
  if (result != CHANNEL_RC_OK) {
    delegate_ = nullptr; // The pinned entry cleans its own failure path.
    return result;
  }
  if (!delegate_)
    return ERROR_INVALID_DATA;
  // The bridge owns touch only. Do not negotiate upstream's default multi-pen
  // injection before a bounded pen owner and public/browser dispatch exist.
  static_cast<RdpeiClientContext *>(delegate_->pInterface)->clientFeaturesMask &=
      ~static_cast<UINT32>(CS_READY_FLAGS_ENABLE_MULTIPEN_INJECTION);
  plugin_.api.pInterface = delegate_->pInterface;
  busy_ = true;
  result =
      checked([&] { return host->RegisterPlugin(host, RDPEI_DVC_CHANNEL_NAME, &plugin_.api); });
  busy_ = false;
  if (result != CHANNEL_RC_OK) {
    (void)terminate();
    return result;
  }
  registered_ = true;
  return CHANNEL_RC_OK;
}
UINT PluginRegistration::initialize(IWTSVirtualChannelManager *manager) noexcept {
  if (!on_thread() || busy_ || !registered_ || !delegate_ || initialized_)
    return ERROR_INVALID_STATE;
  if (!manager || !manager->CreateListener || !manager->DestroyListener)
    return ERROR_INVALID_PARAMETER;
  initialized_ = true; // Even a failed attempt cannot be repeated on the same addin.
  host_manager_ = manager;
  manager_.api.GetChannelId = manager->GetChannelId;
  manager_.api.GetChannelName = manager->GetChannelName;
  busy_ = true;
  const auto result = checked([&] { return delegate_->Initialize(delegate_, &manager_.api); });
  busy_ = false;
  listener_ready_ = result == CHANNEL_RC_OK && host_listener_ && delegate_listener_;
  return result == CHANNEL_RC_OK && !listener_ready_ ? ERROR_INVALID_DATA : result;
}
UINT PluginRegistration::create_listener(const char *name, ULONG flags, IWTSListenerCallback *cb,
                                         IWTSListener **out) noexcept {
  if (!out)
    return ERROR_INVALID_PARAMETER;
  // Pinned generic Initialize dereferences the returned listener even on error.
  // Keep that dereference local and valid; never hand a failed host pointer upstream.
  *out = &fallback_;
  if (!named(name) || flags || !cb || !cb->OnNewChannelConnection || delegate_listener_)
    return ERROR_INVALID_PARAMETER;
  delegate_listener_ = cb;
  listener_callback_.api.pInterface = cb->pInterface;
  const auto result = checked([&] {
    return host_manager_->CreateListener(host_manager_, name, flags, &listener_callback_.api,
                                         &host_listener_);
  });
  if (result != CHANNEL_RC_OK || !host_listener_)
    return result ? result : ERROR_INVALID_DATA;
  *out = host_listener_;
  return CHANNEL_RC_OK;
}
UINT PluginRegistration::destroy_listener(IWTSListener *listener) noexcept {
  if (listener != host_listener_ && listener != &fallback_)
    return ERROR_INVALID_PARAMETER;
  auto *owned = host_listener_;
  host_listener_ = nullptr;
  delegate_listener_ = nullptr;
  listener_ready_ = false;
  if (!owned)
    return CHANNEL_RC_OK;
  listener_cleanup_ = checked([&] { return host_manager_->DestroyListener(host_manager_, owned); });
  return listener_cleanup_;
}
UINT PluginRegistration::new_channel(IWTSVirtualChannel *channel, BYTE *data, BOOL *accept,
                                     IWTSVirtualChannelCallback **out) noexcept {
  if (!accept || !out)
    return ERROR_INVALID_PARAMETER;
  *accept = FALSE;
  *out = nullptr;
  if (!on_thread() || busy_ || !registered_ || !listener_ready_ || !delegate_listener_ ||
      !host_listener_ || channel_used_)
    return ERROR_INVALID_STATE;
  channel_used_ = true; // No stale callback can target a later channel generation.
  busy_ = true;
  const auto result = gate_.open(*context_, delegate_listener_, channel, data, accept, out);
  busy_ = false;
  return result;
}
UINT PluginRegistration::notify(UINT (*call)(IWTSPlugin *)) noexcept {
  if (!on_thread() || busy_ || !registered_ || !delegate_)
    return ERROR_INVALID_STATE;
  busy_ = true;
  const auto result = call ? checked([&] { return call(delegate_); }) : CHANNEL_RC_OK;
  busy_ = false;
  return result;
}
UINT PluginRegistration::disconnect(DWORD code) noexcept {
  if (!on_thread() || busy_ || !registered_ || !delegate_ || !gate_.quiescent())
    return ERROR_INVALID_STATE;
  const auto closed = gate_.close();
  busy_ = true;
  const auto result = delegate_->Disconnected
                          ? checked([&] { return delegate_->Disconnected(delegate_, code); })
                          : CHANNEL_RC_OK;
  busy_ = false;
  return closed ? closed : result;
}
UINT PluginRegistration::terminate() noexcept {
  if (retired())
    return retirement_result_; // No delegate/gate access on the context-free thread.
  if (!on_thread() || busy_ || !gate_.quiescent())
    return ERROR_INVALID_STATE;
  const auto closed = gate_.close();
  auto *owned = delegate_;
  delegate_ = nullptr;
  registered_ = false;
  plugin_.api.pInterface = nullptr;
  busy_ = true;
  const auto result = owned ? checked([&] { return owned->Terminated(owned); }) : CHANNEL_RC_OK;
  // An injected/public addin may not destroy a partial host listener itself.
  const auto destroyed = host_listener_ ? destroy_listener(host_listener_) : CHANNEL_RC_OK;
  delegate_listener_ = nullptr;
  host_manager_ = nullptr;
  busy_ = false;
  return closed ? closed : result ? result : destroyed ? destroyed : listener_cleanup_;
}
UINT PluginRegistration::retire() noexcept {
  if (retired())
    return retirement_result_;
  if (!on_thread() || busy_ || !gate_.quiescent())
    return ERROR_INVALID_STATE;
  retirement_result_ = terminate();
  context_ = nullptr;
  retired_.store(true, std::memory_order_release);
  return retirement_result_;
}
RdpeiClientContext *PluginRegistration::client() const noexcept {
  return on_thread() && registered_ && delegate_
             ? static_cast<RdpeiClientContext *>(delegate_->pInterface)
             : nullptr;
}
} // namespace bridge::touch
