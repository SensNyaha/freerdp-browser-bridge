#include "rdpdr_loader.hpp"
#include "../compat/bit.hpp"
#include <array>
#include <freerdp/addin.h>
#include <freerdp/channels/channels.h>
#include <freerdp/client/cmdline.h>
#include <freerdp/settings.h>
namespace bridge::files::rdpdr {
BOOL load_managed_channels(rdpContext &context) noexcept {
  auto *s = context.settings;
  if (!s || !context.channels) return FALSE;
  // This bridge owns the complete descriptor collection. Never interpret host
  // path selectors or permit another redirection backend through this loader.
  for (const auto key : {FreeRDP_RedirectDrives, FreeRDP_RedirectHomeDrive,
                         FreeRDP_RedirectSerialPorts, FreeRDP_RedirectSmartCards,
                         FreeRDP_RedirectPrinters})
    if (freerdp_settings_get_bool(s, key)) return FALSE;
  const auto *paths = freerdp_settings_get_string(s, FreeRDP_DrivesToRedirect);
  if ((paths && *paths) || freerdp_dynamic_channel_collection_find(s, "rdpsnd")) return FALSE;
  const bool audio = freerdp_static_channel_collection_find(s, "rdpsnd") != nullptr;
  constexpr std::array<FreeRDP_Settings_Keys_Bool, 4> keys{FreeRDP_DeviceRedirection, FreeRDP_NetworkAutoDetect,
      FreeRDP_SupportHeartbeatPdu, FreeRDP_SupportMultitransport};
  std::array<BOOL, 4> values{};
  for (std::size_t i = 0; i < keys.size(); ++i) values[i] = freerdp_settings_get_bool(s, keys[i]);
  BOOL result = FALSE;
  try {
    bool prepared = true;
    for (const auto key : keys)
      if (!freerdp_settings_set_bool(s, key, FALSE)) prepared = false;
    // These flags cause cmdline.c to add rdpdr AND an unguarded sys:fake audio
    // channel. Suppress only loader side effects, then restore the negotiated
    // network features. Selected audio already supplies our guarded rdpsnd.
    if (prepared && freerdp_client_load_addins(context.channels, s)) {
      if (audio) result = TRUE; // Generic loader registered rdpdr for rdpsnd.
      else {
        const auto entry = freerdp_load_channel_addin_entry("rdpdr", nullptr, nullptr,
            FREERDP_ADDIN_CHANNEL_STATIC | FREERDP_ADDIN_CHANNEL_ENTRYEX);
        if (entry && freerdp_channels_client_load_ex(context.channels, s,
              ::bridge::compat::bit_cast<PVIRTUALCHANNELENTRYEX>(entry), nullptr) == 0) result = TRUE;
      }
    }
  } catch (...) { result = FALSE; }
  for (std::size_t i = 0; i < keys.size(); ++i)
    if (!freerdp_settings_set_bool(s, keys[i], values[i])) result = FALSE;
  if (result && !freerdp_settings_set_bool(s, FreeRDP_DeviceRedirection, TRUE)) result = FALSE;
  return result;
}
}
