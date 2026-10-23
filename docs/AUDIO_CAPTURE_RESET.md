# AUDIN capture reset ownership

Iteration 102 implements the native reset foundation for SPECIFICATION §2.6 /
ARCHITECTURE §5 / MEDIA_PIPELINE §7. It adds no public/private wire command,
browser permission flow or worker microphone capability.

AudinSource.reset_capture requires an open source on its RDP owner, no active
callback and the exact current nonzero input epoch. Invalid/stale/inactive/busy
requests change neither samples, receiver, epoch nor deadlines and return no
replacement epoch. Successful reset wipes queued/scratch PCM, clears accepted
capture timestamp history, restores prebuffering and advances the input epoch.
The configured format and existing AudinReceive callback remain owned/open:
scheduled callbacks provide silence until sufficient fresh input arrives.

Input packets from the old epoch are stale. The first packet in the replacement
epoch must mark discontinuity; ordinary input retains exact 20 ms timestamp
progression. Native reset does not send Open or FormatChange replies, close the
transport or restart the plugin. A later server format change advances the same
epoch authority normally. Reset count saturates and contains no payload/identity.

AudinDvcGate.reset_capture requires quiescent readiness and delegates to the
source. Success removes the previous cadence deadline; next tick binds the
replacement epoch. Deadline snapshots also reject a cadence whose epoch differs
from the current source, including native format changes/direct source resets.
Foreign calls are inactive and reentrant callbacks are busy before mutation.
At u64 epoch exhaustion the source stops rather than wrapping; an unexpected
failed source restart also stops capture. The exhaustion branch is implemented,
but reaching u64 device opens/resets was not exercised in linked fixtures.

This primitive is intended for future control-lease/permission/capture-clock
changes. It does not establish those authorities: production must validate the
current owner before requesting reset and restrict fresh packet admission. It
must also deliver replacement metadata before accepting new browser input.
Repeated successful resets are not a public API or a retry policy. Node/worker
correlation, rate/deadline limits and browser permission revocation remain open.

Public device and actual linked AUDIN/fake-DVC fixtures use synthetic PCM. They
verify old queue removal, silence with the same callback, stale packet/request
refusal, new input, changed mono format, deadline invalidation and foreign /
reentrant ownership. No microphone was captured or sent to a remote application.
Actual permission/detach/reset/remote microphone/LAN acceptance remains pending.
