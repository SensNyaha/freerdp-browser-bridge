# Iteration 63 — ordered public PCM source status codec

Date: 2026-10-10. Implements PROTOCOL §4, SPECIFICATION §2.6 and
MEDIA_PIPELINE §8 ordered discontinuity metadata, after native owner `7b921d5`.

Preparatory RWB1 AUDIO_STATE type 0x09 on stream 3 carries the exact 40-byte
versioned source state. Its 28-byte v1 header requires discontinuity, matching
worker timestamp and uint32 attachment audio sequence. Cursor type 0x05 and
existing config/PCM layouts are preserved. TypeScript and isolated browser
parsers agree on independent byte vectors, disabled/closed metadata, all state
modes, every truncation, malformed headers/descriptors, clock mismatch and limits.
The existing packet-only sender refuses this unnegotiated extension.

Two new Node cases and the audio/port regression suite pass **16/16**. The first
narrow run detected a browser parser declaration-order error; it was corrected
before the passing regression run. Bundled `pnpm check` **168/168** (no skips,
111.68 s), bundled CTest **14/14**, foundation CTest **6/6**, strict TypeScript,
ESLint, Prettier and diff checks pass. Logs: ignored `build/iteration-063-*.log`.

This block does not emit status from worker/API or activate audible playback.
Status-aware browser ownership, Node listeners/replay, negotiated selection,
worker scheduling/lifetime, actual remote audio/microphone and latency remain open.
