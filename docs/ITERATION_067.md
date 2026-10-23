# Iteration 67 — typed PCM backend and media lease ownership

Date: 2026-10-10. Implements SPECIFICATION §2.6/3.1, ARCHITECTURE §5/11 and
MEDIA_PIPELINE §6/8 after private PCM worker `bc47341`.

The manager validates selected backend source/config/sample events with the same
scalar owner as private IPC. Metadata is copied; no PCM packet is retained by the
manager. One current media subscriber receives future events. Control/stale leases
are refused, detach and cleanup retire ownership immediately, and stale unsubscribe
cannot affect replacement. Consumer exceptions retire only that subscription with
an observable failed-lease flag. No exception escapes into native IPC parsing.

NativeSessionWorker exposes the typed listener but continues refusing public PCM
creation until media negotiation/forwarding is complete. No public wire selector,
audio WS route, Worklet activation, audio metrics or audible acceptance is added.

Eight new fake-backend cases verify 100 discarded pre-attachment packets with
metadata-only replay, copied producer/consumer metadata, single-subscriber/control
checks, detach/replacement, reentrant replacement during a failing old callback,
stop without samples, terminal cleanup, malformed source order/format/sample sizes,
opt-in/connecting checks and missing backend support before startup.
Narrow manager/source tests pass **10/10**, full `pnpm check` **190/190**,
including actual native lifecycle/TLS and real Edge synthetic Worklet fixtures.
Strict TypeScript, lint, format and `git diff --check` pass. These eight new cases
are fake backend SDK fixtures; native code/wire layout is unchanged from the
iteration 66 CTest **14/14** bundled and **6/6** foundation evidence.

Public latest-state transport, initial attachment discontinuity, browser gesture
activation, actual audible RDP, microphone/Opus and resource/latency/soak/platform
acceptance remain open. [Contract](SESSION_API.md#typed-pcm-backendmedia-lease-preparation).
