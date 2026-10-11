# Server media-lease audio reset authority

Iteration 91 (2026-10-11) prepares SPECIFICATION §2.6 and MEDIA_PIPELINE §6 recovery
behind the existing SessionManager media attachment. This adds a trusted backend
method and server lease operation, not a browser control message or public Opus
selection. Current managed source remains PCM.

SessionWorker optionally exposes resetAudio(expectedEpoch). NativeSessionWorker
delegates to the capability-gated private worker, mapping unsupported capability
to MEDIA_NOT_IMPLEMENTED and other failures to safe MEDIA_FAILED. Closing returns
unavailable. Public Opus startup still fails before backend allocation.

A lease may schedule reset only as the current media attachment of a live session.
Control/stale/closed leases are refused before dispatch. Invalid nonzero-u64 epoch
is MEDIA_FAILED; missing audio/backend operation is MEDIA_NOT_IMPLEMENTED.
Disconnected/inactive source returns unavailable, a current epoch mismatch returns
stale and a second pending operation returns busy. The session stores one Symbol
reservation, no audio packet or reset-request queue. This reservation survives
detach until completion, preventing a replacement lease from starting a parallel
operation. Source status/config events remain authoritative and can reach the new
media listener while the old result is suppressed.

Lease ownership is checked again after the backend promise resolves. An old
receiver cannot obtain a result as the current owner, clear a newer reservation or
receive old subscriber callbacks. Results must be exactly scheduled/stale/
unavailable/busy. Unknown result or unsanitized backend exception fails the backend
and returns safe MEDIA_FAILED. A three-second deadline fails the backend before
releasing uncertain operation ownership; it does not leave a live worker able to
reset a replacement receiver later. Existing worker shutdown/termination bounds
apply. The timer and matching reservation clear in finally; a late backend result
cannot restore lease/session state.

Five manager fixture cases and one fake-native/private-IPC handoff cover access,
staleness, inactive state, missing support, epoch validation, one-flight capacity,
detach/replacement, typed outcomes, invalid/exception/timeout and cleanup. The
handoff uses fake PCM source data, not an actual RDPSND or audible server. Public
Opus source types/lease/socket/browser recovery remain open, alongside actual
ready-source reset/audio, microphone and resource/platform/LAN/A/V/soak gates.
