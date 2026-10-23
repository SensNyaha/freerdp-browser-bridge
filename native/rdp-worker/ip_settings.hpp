#pragma once
#include "../ipc/connection_config.hpp"
#include <freerdp/settings.h>

namespace bridge::rdp {
inline void apply_ip_settings(rdpSettings *settings, std::uint8_t mask, std::uint8_t prefer,
                              std::uint8_t force) {
  if (!settings || !bridge::ipc::valid_ip_settings(mask, prefer, force))
    throw bridge::ipc::ProtocolError();
  if ((mask & 1U) &&
      !freerdp_settings_set_bool(settings, FreeRDP_PreferIPv6OverIPv4, prefer ? TRUE : FALSE))
    throw bridge::ipc::ProtocolError();
  if ((mask & 2U) && !freerdp_settings_set_uint32(settings, FreeRDP_ForceIPvX, force))
    throw bridge::ipc::ProtocolError();
}
} // namespace bridge::rdp
