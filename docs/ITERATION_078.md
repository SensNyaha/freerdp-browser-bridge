# Iteration 78 — bounded native Opus publishing ownership

Date: 2026-10-10. Implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6/8 after
browser owner `39b40b9`. The active worker/output queue still select PCM only.

`OpusPublisher` composes existing PCM capture/latest/epoch/clock/reset rules.
It translates validated status/config, checks source and zero-filled underflow
tail before encoding, and retains one fixed 1,299-byte retry record. A blocked
send retries identical encoded bytes without prediction mutation; a new captured
packet replaces the local record discontinuously. Successful consumer reset
clears stale compressed data before fresh source state can pass the barrier.

Six native cases pass **97 assertions** using actual public RDPSND sink callbacks
and the pinned private libopus. They verify stereo SDK decode, source/silence
accounting, config/status order, exact retry, ordinary continuation, latest
replacement, reset/Close barriers, blocked metadata, foreign/reentrant refusal,
invalid clocks, callback failure and epoch exhaustion. These are local source /
SDK fixtures, not an actual SVC or remote audio stream.

Bundled CTest passes **16/16**, including the new publisher suite. Foundation
CTest passes **6/6**; full `pnpm check` passes **225/225**, including the actual
pinned SDK/Edge fixture. MSVC /W4 /WX, /analyze, clang-format, strict TypeScript,
lint, format and `git diff --check` pass. Callback type-erasure construction is caught before entering
the noexcept source pump; that rejection leaves source/codec state unchanged.

The code is not linked into worker audio selection. PCM-only queue refusal,
Opus HELLO/settings, public forwarding/selection, actual audible RDP/microphone,
loss fidelity, codec internal resources, CPU/platform/latency and soak gates
remain open. [Publisher contract](AUDIO_OPUS_PUBLISHER.md).
