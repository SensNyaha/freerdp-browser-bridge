#include "audin_plugin.hpp"
#include <bit>
#include <cstring>
#include <exception>
#include <freerdp/client/channels.h>
#include <freerdp/freerdp.h>
#include <type_traits>
#include <winpr/error.h>

namespace bridge::audio {
namespace {
template <class Call> UINT checked(Call call) noexcept {
  try {
    return call();
  } catch (...) {
    return ERROR_INTERNAL_ERROR;
  }
}
bool named(const char *name, const char *expected) noexcept {
  return name && std::strcmp(name, expected) == 0;
}
} // namespace
template <class Api> AudinRegistration &AudinRegistration::get(Api *api) noexcept {
  static_assert(std::is_standard_layout_v<Box<Api>>);
  return *reinterpret_cast<Box<Api> *>(api)->owner;
}
bool AudinRegistration::on_thread() const noexcept { return thread_ == std::this_thread::get_id(); }
AudinRegistration::AudinRegistration(rdpContext &context, AudinSource &source,
                                     AudinCaptureProfile profile) noexcept
    : source_(source), gate_(source, profile), context_(&context),
      thread_(std::this_thread::get_id()) {
  entries_.api.RegisterPlugin = [](IDRDYNVC_ENTRY_POINTS *api, const char *name,
                                   IWTSPlugin *plugin) -> UINT {
    auto &s = get(api);
    if (!s.on_thread() || !s.busy_ || !s.host_ || s.retired() || s.ended_)
      return ERROR_INVALID_STATE;
    if (!named(name, AUDIN_CHANNEL_NAME) || !plugin || !plugin->Initialize || !plugin->Terminated)
      return ERROR_INVALID_PARAMETER;
    if (s.delegate_)
      return CHANNEL_RC_ALREADY_INITIALIZED;
    s.delegate_ = plugin; // Pinned entry owns cleanup until its successful return.
    return CHANNEL_RC_OK;
  };
  entries_.api.GetPlugin = [](IDRDYNVC_ENTRY_POINTS *api, const char *name) -> IWTSPlugin * {
    auto &s = get(api);
    if (!s.on_thread() || !s.host_ || s.retired() || s.ended_)
      return nullptr;
    if (named(name, AUDIN_CHANNEL_NAME) && s.delegate_)
      return s.delegate_;
    IWTSPlugin *result = nullptr;
    try {
      result = s.host_->GetPlugin(s.host_, name);
    } catch (...) {
    }
    return result;
  };
  entries_.api.GetPluginData = [](IDRDYNVC_ENTRY_POINTS *api) -> const ADDIN_ARGV * {
    auto &s = get(api);
    return s.on_thread() && s.host_ && !s.retired() && !s.ended_ ? &s.args_ : nullptr;
  };
  entries_.api.GetRdpContext = [](IDRDYNVC_ENTRY_POINTS *api) -> rdpContext * {
    auto &s = get(api);
    return s.on_thread() && s.host_ && !s.retired() && !s.ended_ ? s.context_ : nullptr;
  };
  entries_.api.GetRdpSettings = [](IDRDYNVC_ENTRY_POINTS *api) -> rdpSettings * {
    auto &s = get(api);
    return s.on_thread() && s.host_ && s.context_ && !s.retired() && !s.ended_
               ? s.context_->settings
               : nullptr;
  };
  plugin_.api.Initialize = [](IWTSPlugin *api, IWTSVirtualChannelManager *manager) {
    return get(api).initialize(manager);
  };
  plugin_.api.Connected = [](IWTSPlugin *api) -> UINT {
    auto &s = get(api);
    if (!s.on_thread() || s.retired())
      return ERROR_INVALID_STATE;
    return s.notify(s.delegate_ ? s.delegate_->Connected : nullptr);
  };
  plugin_.api.Attached = [](IWTSPlugin *api) -> UINT {
    auto &s = get(api);
    if (!s.on_thread() || s.retired())
      return ERROR_INVALID_STATE;
    return s.notify(s.delegate_ ? s.delegate_->Attached : nullptr);
  };
  plugin_.api.Detached = [](IWTSPlugin *api) -> UINT {
    auto &s = get(api);
    if (!s.on_thread() || s.retired())
      return ERROR_INVALID_STATE;
    return s.notify(s.delegate_ ? s.delegate_->Detached : nullptr, true);
  };
  plugin_.api.Disconnected = [](IWTSPlugin *api, DWORD code) { return get(api).disconnect(code); };
  plugin_.api.Terminated = [](IWTSPlugin *api) { return get(api).retire(); };
  manager_.api.CreateListener = [](IWTSVirtualChannelManager *api, const char *name, ULONG flags,
                                   IWTSListenerCallback *callback, IWTSListener **listener) {
    return get(api).create_listener(name, flags, callback, listener);
  };
  manager_.api.DestroyListener = [](IWTSVirtualChannelManager *api, IWTSListener *listener) {
    return get(api).destroy_listener(listener);
  };
  manager_.api.FindChannelById = [](IWTSVirtualChannelManager *api,
                                    UINT32 id) -> IWTSVirtualChannel * {
    auto &s = get(api);
    if (!s.on_thread() || !s.host_manager_ || s.retired() || s.ended_)
      return nullptr;
    IWTSVirtualChannel *result = nullptr;
    try {
      result = s.host_manager_->FindChannelById
                   ? s.host_manager_->FindChannelById(s.host_manager_, id)
                   : nullptr;
    } catch (...) {
    }
    return result;
  };
  listener_.api.OnNewChannelConnection = [](IWTSListenerCallback *api, IWTSVirtualChannel *channel,
                                            BYTE *data, BOOL *accepted,
                                            IWTSVirtualChannelCallback **callback) {
    return get(api).new_channel(channel, data, accepted, callback);
  };
}
AudinRegistration::~AudinRegistration() {
  (void)retire();
  if (!retired())
    std::terminate();
}
bool AudinRegistration::ready_for(rdpContext &context, AudinSource &source) const noexcept {
  const auto stats = source.stats();
  return on_thread() && context_ == &context && &source_ == &source && !attempted_ && !busy_ &&
         !retired() && !source.retired() && stats && !stats->opened;
}
UINT AudinRegistration::install(IDRDYNVC_ENTRY_POINTS *host, PDVC_PLUGIN_ENTRY entry) noexcept {
  if (!on_thread() || retired() || attempted_ || busy_ || source_.retired())
    return ERROR_INVALID_STATE;
  if (!host || !host->GetRdpContext || !host->GetRdpSettings || !host->RegisterPlugin ||
      !host->GetPlugin || !context_ || !context_->settings || !source_.stats() ||
      !freerdp_settings_get_bool(context_->settings, FreeRDP_SynchronousDynamicChannels) ||
      freerdp_settings_get_bool(context_->settings, FreeRDP_AsyncChannels) ||
      freerdp_settings_get_bool(context_->settings, FreeRDP_AsyncUpdate))
    return ERROR_INVALID_PARAMETER;
  busy_ = true;
  const auto validation = checked([&]() -> UINT {
    if (host->GetRdpContext(host) != context_ || host->GetRdpSettings(host) != context_->settings)
      return ERROR_INVALID_PARAMETER;
    if (host->GetPlugin(host, AUDIN_CHANNEL_NAME))
      return CHANNEL_RC_ALREADY_INITIALIZED;
    return CHANNEL_RC_OK;
  });
  busy_ = false;
  if (validation != CHANNEL_RC_OK)
    return validation;
  if (!entry) {
    const auto linked = freerdp_channels_load_static_addin_entry(
        AUDIN_CHANNEL_NAME, nullptr, nullptr, FREERDP_ADDIN_CHANNEL_DYNAMIC);
    if (!linked)
      return ERROR_NOT_SUPPORTED;
    entry = std::bit_cast<PDVC_PLUGIN_ENTRY>(linked);
  }
  attempted_ = busy_ = true;
  host_ = host;
  auto result = checked([&] { return entry(&entries_.api); });
  host_ = nullptr; // Host entry points are borrowed for this entry call only.
  busy_ = false;
  if (result != CHANNEL_RC_OK) {
    delegate_ = nullptr; // Pinned entry terminates its own failed construction.
    return result;
  }
  if (!delegate_)
    return ERROR_INVALID_DATA;
  plugin_.api.pInterface = delegate_->pInterface;
  busy_ = true;
  result = checked([&] { return host->RegisterPlugin(host, AUDIN_CHANNEL_NAME, &plugin_.api); });
  busy_ = false;
  if (result != CHANNEL_RC_OK) {
    (void)retire(); // An uncertain host may still hold the wrapper, never retry.
    return result;
  }
  registered_ = true;
  return CHANNEL_RC_OK;
}
UINT AudinRegistration::initialize(IWTSVirtualChannelManager *manager) noexcept {
  if (!on_thread() || retired() || ended_ || busy_ || !registered_ || !delegate_ || initialized_)
    return ERROR_INVALID_STATE;
  if (!manager || !manager->CreateListener || !manager->DestroyListener)
    return ERROR_INVALID_PARAMETER;
  initialized_ = true;
  host_manager_ = manager;
  manager_.api.GetChannelId = manager->GetChannelId;
  manager_.api.GetChannelName = manager->GetChannelName;
  busy_ = true;
  const auto result = checked([&] { return delegate_->Initialize(delegate_, &manager_.api); });
  busy_ = false;
  listener_ready_ = result == CHANNEL_RC_OK && host_listener_ && delegate_listener_;
  return result ? result : listener_ready_ ? CHANNEL_RC_OK : ERROR_INVALID_DATA;
}
UINT AudinRegistration::create_listener(const char *name, ULONG flags,
                                        IWTSListenerCallback *callback,
                                        IWTSListener **out) noexcept {
  if (!out)
    return ERROR_INVALID_PARAMETER;
  *out = &fallback_;
  if (!on_thread() || !busy_ || !host_manager_ || retired() || ended_ ||
      !named(name, AUDIN_DVC_CHANNEL_NAME) || flags || !callback ||
      !callback->OnNewChannelConnection || delegate_listener_)
    return ERROR_INVALID_PARAMETER;
  delegate_listener_ = callback;
  listener_.api.pInterface = callback->pInterface;
  const auto result = checked([&] {
    return host_manager_->CreateListener(host_manager_, name, flags, &listener_.api,
                                         &host_listener_);
  });
  if (result != CHANNEL_RC_OK || !host_listener_)
    return result ? result : ERROR_INVALID_DATA;
  *out = host_listener_;
  return CHANNEL_RC_OK;
}
UINT AudinRegistration::destroy_listener(IWTSListener *listener) noexcept {
  if (!on_thread() || destroying_ || (listener != host_listener_ && listener != &fallback_))
    return ERROR_INVALID_STATE;
  listener_ready_ = false;
  delegate_listener_ = nullptr;
  listener_.api.pInterface = nullptr;
  if (!host_listener_)
    return CHANNEL_RC_OK;
  destroying_ = true;
  const auto result =
      checked([&] { return host_manager_->DestroyListener(host_manager_, host_listener_); });
  destroying_ = false;
  cleanup_ = result;
  if (result == CHANNEL_RC_OK)
    host_listener_ = nullptr;
  return result; // Failed host handle stays owned for one retry per later owner call.
}
UINT AudinRegistration::new_channel(IWTSVirtualChannel *channel, BYTE *data, BOOL *accepted,
                                    IWTSVirtualChannelCallback **callback) noexcept {
  if (!accepted || !callback)
    return ERROR_INVALID_PARAMETER;
  *accepted = FALSE;
  *callback = nullptr;
  if (!on_thread() || retired() || ended_ || busy_ || !registered_ || !listener_ready_ ||
      !delegate_listener_ || channel_used_)
    return ERROR_INVALID_STATE;
  channel_used_ = busy_ = true;
  const auto result = gate_.open(*context_, delegate_listener_, channel, data, accepted, callback);
  busy_ = false;
  return result;
}
UINT AudinRegistration::notify(UINT (*call)(IWTSPlugin *), bool stop) noexcept {
  if (!on_thread() || retired() || ended_ || busy_ || !registered_ || !delegate_ ||
      !gate_.quiescent())
    return ERROR_INVALID_STATE;
  if (stop) {
    const auto closed = gate_.close();
    if (closed != CHANNEL_RC_OK)
      return closed;
  }
  busy_ = true;
  const auto result = call ? checked([&] { return call(delegate_); }) : CHANNEL_RC_OK;
  busy_ = false;
  return result;
}
UINT AudinRegistration::disconnect(DWORD code) noexcept {
  if (!on_thread() || retired() || ended_ || busy_ || !registered_ || !delegate_ ||
      !gate_.quiescent())
    return ERROR_INVALID_STATE;
  const auto closed = gate_.close();
  busy_ = true;
  const auto result = delegate_->Disconnected
                          ? checked([&] { return delegate_->Disconnected(delegate_, code); })
                          : CHANNEL_RC_OK;
  busy_ = false;
  return closed ? closed : result;
}
UINT AudinRegistration::retire() noexcept {
  if (retired())
    return cleanup_;
  if (!on_thread() || busy_ || !gate_.quiescent())
    return ERROR_INVALID_STATE;
  if (!ended_) {
    const auto closed = gate_.retire();
    auto *owned = delegate_;
    delegate_ = nullptr;
    registered_ = listener_ready_ = false;
    plugin_.api.pInterface = nullptr;
    busy_ = true;
    const auto terminated =
        owned ? checked([&] { return owned->Terminated(owned); }) : CHANNEL_RC_OK;
    busy_ = false;
    ended_ = true;
    if (closed != CHANNEL_RC_OK)
      cleanup_ = closed;
    else if (terminated != CHANNEL_RC_OK)
      cleanup_ = terminated;
    // Native termination normally calls DestroyListener once. Do not retry a
    // failed host close again in this same owner call.
    if (host_listener_)
      return cleanup_ == CHANNEL_RC_OK ? ERROR_INVALID_STATE : cleanup_;
  } else if (host_listener_) {
    const auto destroyed = destroy_listener(host_listener_);
    if (destroyed != CHANNEL_RC_OK)
      return destroyed;
  }
  if (!source_.retire())
    return ERROR_INVALID_STATE;
  delegate_listener_ = nullptr;
  host_manager_ = nullptr;
  context_ = nullptr;
  retired_.store(true, std::memory_order_release);
  return cleanup_;
}
} // namespace bridge::audio
