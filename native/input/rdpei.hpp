#pragma once
#include "touch.hpp"
#include <freerdp/client/rdpei.h>

namespace bridge::touch {
// Calls only the pinned public API, on the synchronous RDP thread. This is not a
// readiness test: channel open/GetVersion/API success cannot establish SC_READY.
// A future negotiated channel owner must gate dispatch, suspension and lifetime.
bool send_rdpei(RdpeiClientContext *context, const Event &event) noexcept;
struct Submission {
  UINT status;
  INT32 contact_id;
  bool accepted() const noexcept { return status == 0 && contact_id >= 0 && contact_id < 64; }
};
Submission submit_rdpei(RdpeiClientContext *context, const Event &event) noexcept;
} // namespace bridge::touch
