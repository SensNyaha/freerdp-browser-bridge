# Bounded Opus socket recovery owner

Iteration 93 (2026-10-11) prepares SPECIFICATION §2.6 / MEDIA_PIPELINE §6 with
installOpusMedia. Public negotiation/startup remains gated. PCM retains its
existing sender policy; both routes share finite socket admission, ACK, subscription
and storage-accounting lifecycle code, with explicit snapshot/event codec checks.

The Opus sender owns at most one copied 2..1,275-byte packet and one transmitted
record credit. Ready-source attachment and skipped prediction request a native
expected-epoch reset through the current media lease. There is one pending promise,
no request queue. Deferred dispatch checks route/source authority again; closing
before dispatch cancels it. Scheduled completion is recorded once for that epoch
and cannot invent configuration, samples or fresh source state. Refusals retry at
most every 100 ms within the sender's absolute two-second recovery deadline.
Reset exceptions or unknown results safely retire the media route.

The native new-epoch source/configuration and marked packet are authoritative.
Old transmitted credit remains owned by its exact ACK through recovery. Pending
encoded samples are discarded rather than relabeled as independent. Source waiting
at a fresh epoch completes recovery and may remain idle indefinitely; the bridge
does not generate audio to establish remote acceptance. Node never rewrites packet
bytes or capture timestamps.

Seven new socket-owner cases cover active-source attachment, prediction overflow,
retained ACK, bounded retries/deadline, one unresolved operation, deferred cancel,
fault/late-completion suppression, wrong profile/duplicate ACK, idle fresh epoch
and balanced retirement. They use EventEmitter sockets and synthetic TOC bytes,
not real WebSocket, entropy decode or audible XRDP. Public managed Opus/socket
negotiation and harness activation are next; actual ready-source reset/audio,
microphone and platform/resource/LAN/A/V/soak acceptance remain open.
