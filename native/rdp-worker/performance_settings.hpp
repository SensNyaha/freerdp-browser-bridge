#pragma once
#include "../ipc/protocol.hpp"
#include <freerdp/settings.h>

namespace bridge::rdp {
// User-facing booleans use positive semantics; FreeRDP's Disable* keys are inverted.
inline void apply_performance_settings(rdpSettings *settings, std::uint8_t mask,
                                       std::uint8_t values) {
  if (!settings || mask > 63U || (values & ~mask) != 0)
    throw bridge::ipc::ProtocolError();
  const auto boolean = [&](auto key, BOOL value) {
    if (!freerdp_settings_set_bool(settings, key, value))
      throw bridge::ipc::ProtocolError();
  };
  if (mask & 1U)
    boolean(FreeRDP_DisableWallpaper, (values & 1U) ? FALSE : TRUE);
  if (mask & 2U)
    boolean(FreeRDP_AllowFontSmoothing, (values & 2U) ? TRUE : FALSE);
  if (mask & 4U)
    boolean(FreeRDP_AllowDesktopComposition, (values & 4U) ? TRUE : FALSE);
  if (mask & 8U)
    boolean(FreeRDP_DisableFullWindowDrag, (values & 8U) ? FALSE : TRUE);
  if (mask & 16U)
    boolean(FreeRDP_DisableMenuAnims, (values & 16U) ? FALSE : TRUE);
  if (mask & 32U)
    boolean(FreeRDP_DisableThemes, (values & 32U) ? FALSE : TRUE);
}
} // namespace bridge::rdp
