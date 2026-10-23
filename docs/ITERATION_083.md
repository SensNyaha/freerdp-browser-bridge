# Iteration 83 — shared typed audio source owner

Date: 2026-10-11. Implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6/8 after
private schema preparation `408271f`.

The existing PCM source's scalar state/config/epoch/capture-clock ownership is
extracted into an internal generic owner. PCM preserves its API and behavior;
isolated Opus supplies codec-specific parsers and validators through a frozen
profile. State/config snapshots copy metadata and packet bytes borrow input only
for immediate dispatch. No packet history, synthesized PCM, queue or decoder
is introduced. Private/public selection is not activated.

Narrow source/delivery tests pass **12/12**, including three new Opus cases.
They cover readiness/config barriers, first discontinuity, independent status /
capture clocks, atomic malformed TOC refusal, mixed PCM/Opus wire and typed
packet refusal, Close without samples, fresh epoch/clock recovery and copied
metadata/borrowed encoded bytes. The two existing PCM source and seven delivery
cases pass unchanged. These are protocol/ownership fixtures, not entropy decode
or remote audio tests. Full `pnpm check` passes **229/229** with no skipped
tests, including private PCM IPC, public socket/lease and actual Edge Worklet
regressions. Strict TypeScript, lint, format and `git diff --check` pass.

Native code is unchanged; latest bundled/foundation CTest evidence remains
Iteration 82. Worker/Node activation, public negotiation, audible RDP/microphone,
loss fidelity, upstream/codec resource bounds, platform, LAN latency, A/V
scheduling and soak remain open. [Contract](AUDIO_SOURCE_OWNERS.md).
