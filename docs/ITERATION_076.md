# Iteration 76 — Opus source state and browser record preparation

Date: 2026-10-10. Implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6/8 after
payload preparation `8c79084`; this block does not activate Opus selection.

Native and TypeScript adapt the fixed 40-byte source-status grammar with an
enabled codec-1 / stereo / raw-encoded descriptor. Disabled metadata stays shared
and all-zero. Translation preserves channel, reserved and clock fields so invalid
input cannot be normalized into valid state. The PCM-only output lane still
refuses enabled Opus state.

Preparatory RWB1 stream 3 uses 68-byte state, 48-byte config and 30..1,303-byte
encoded packet records. State/config/packet share bounded sequence and capture
time; public packet payload contains only encoded bytes. An isolated browser
parser validates framing, source semantics and the single-stereo-20-ms TOC profile
without a decoder, queue, ACK or viewer activation. Encoded views borrow input.

Six native Opus IPC cases pass **960 assertions**, including two new source-state
cases. Complete bundled IPC is **51 cases / 6,939 assertions**. Three new Node
cases cover independent byte vectors, mutual PCM refusal, reserved/scalar bounds,
every TOC byte and borrowed encoded bytes. Full `pnpm check` passes **220/220**;
bundled CTest **15/15** and foundation CTest **6/6** pass. MSVC /W4 /WX and /analyze,
clang-format, strict TypeScript, lint and format checks pass.

The active PCM/native/browser route is unchanged. Actual authorized XRDP/Edge
desktop with idle PCM was verified in iteration 75; no remote audio is generated
for this parser block. Opus decoder priming/lifetime, publisher/output ownership,
HELLO/public selection, audible RDP/microphone, resource/platform/latency and soak
acceptance remain open. [Wire contract](AUDIO_OPUS_WIRE.md).
