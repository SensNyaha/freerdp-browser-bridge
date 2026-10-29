#pragma once
#include <freerdp/freerdp.h>
namespace bridge::files::rdpdr {
// Load the selected managed channel without the generic loader's implicit
// host-drive or fake-audio additions. Network settings are preserved.
BOOL load_managed_channels(rdpContext &) noexcept;
}
