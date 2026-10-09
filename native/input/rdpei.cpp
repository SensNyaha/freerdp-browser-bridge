#include "rdpei.hpp"
#include <winpr/error.h>
#include <winpr/wtsapi.h>

namespace bridge::touch {
Submission submit_rdpei(RdpeiClientContext *context, const Event &event) noexcept {
  if (!valid(event) || !context || !context->handle || !context->TouchRawEvent)
    return {ERROR_INVALID_PARAMETER, -1};
  UINT32 flags = 0;
  switch (event.action) {
  case Action::begin:
    flags = RDPINPUT_CONTACT_FLAG_DOWN | RDPINPUT_CONTACT_FLAG_INRANGE |
            RDPINPUT_CONTACT_FLAG_INCONTACT;
    break;
  case Action::update:
    flags = RDPINPUT_CONTACT_FLAG_UPDATE | RDPINPUT_CONTACT_FLAG_INRANGE |
            RDPINPUT_CONTACT_FLAG_INCONTACT;
    break;
  case Action::end:
    flags = RDPINPUT_CONTACT_FLAG_UP;
    break;
  case Action::cancel:
    flags = RDPINPUT_CONTACT_FLAG_UP | RDPINPUT_CONTACT_FLAG_CANCELED;
    break;
  }
  INT32 contact_id = -1;
  UINT result = ERROR_INTERNAL_ERROR;
  try {
    result =
        context->TouchRawEvent(context, static_cast<INT32>(event.id), static_cast<INT32>(event.x),
                               static_cast<INT32>(event.y), &contact_id, flags, 0);
  } catch (...) {
    result = ERROR_INTERNAL_ERROR;
  }
  // Pinned rdpei_touch_process can return OK with -1 when no contact slot exists.
  return {result, contact_id};
}
bool send_rdpei(RdpeiClientContext *context, const Event &event) noexcept {
  return submit_rdpei(context, event).accepted();
}
} // namespace bridge::touch
