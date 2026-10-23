# Preparatory exclusive microphone ownership

Current update — iteration 139: an explicit immutable Opus backend selects
the same one-grant retirement barrier with a compressed ingress. PCM/default
behavior and deadlines remain. Delegated submit is read only after grant and
packet reservations, so reentrant host callbacks cannot acquire another owner.
Node drain precedes native reset; scheduled alone cannot transfer authority.
Newer waiting epoch proves retirement but not sample readiness. Typed/reset /
publication/deadline faults request termination once and keep grants closed.
Public Opus session/WS/browser activation remains disabled; actual AUDIN/device
acceptance is not implied by these portable/private synthetic checks.

Iteration 114 composes the [one-flight ingress](MICROPHONE_INGRESS.md) with the
[private owner reset](MICROPHONE_RESET.md) for SPECIFICATION §2.6 /
MEDIA_PIPELINE §7. No public socket, permission prompt or device capture is enabled.

`MicrophoneOwnership` permits one ingress grant. Its caller supplies a fixed
authorization predicate for that grant. Release revokes synchronously, reserves
one retirement operation before external callbacks, and prevents replacement
until the old Node operation has drained and native authority proves old samples
were cleared. Repeated release joins the same promise; release of an old ingress
cannot revoke its replacement. Close permanently prevents acquisition.

An owner that never attempted native submission needs no reset. Otherwise the
barrier examines the last attempted input epoch. A newer valid source epoch
already proves old-source retirement. For the current ready epoch it subscribes
before issuing one reset, validates its typed result and waits for newer source
metadata. A scheduled reply alone is insufficient. A fresh waiting epoch proves
cleanup but does not grant sample readiness; ingress still requires ready status.
Publication may precede the correlated reset reply. No reset/sample retry occurs.

One overall 3 s deadline covers drain, reset and publication (configurable
20..5,000 ms for hosts/tests). Invalid source progress, unavailable/busy/stale
without newer authority, unknown result, backend exception, missing publication
or expiration fails ownership permanently and requests host termination once.
The listener and timer are retired. A late drained operation cannot initiate a
reset after expiration, and late replies cannot revive a failed owner.

The termination callback initiates host-owned process retirement. Its exception
or unresolved promise does not reopen grants or extend this barrier. This class
does not prove that an external host has completed killing/reaping a worker.
A still-borrowed PCM slot is retained until its operation settles, then wiped;
timeout never wipes memory beneath the backend. The public host must connect
termination to existing process cleanup and session capacity ownership.

Seven portable cases exercise exclusivity, duplicate/stale ownership, drain/reset
ordering, source event races, typed faults, malformed/regressed metadata, disposal
faults, hanging operations and late completion. The separate synthetic IPC process
case uses private Node reset and source publication before transfer. These are
explicit fixtures, not remote/physical microphone acceptance. Public session and
control/media lease integration, permission/capture/resampling/Opus input and
real remote/physical/LAN/platform/upstream limits remain open.
