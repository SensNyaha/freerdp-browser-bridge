# Iteration 179 — opt-in native 200 ms output compatibility

2026-10-13. Implements explicit [ADR-012](adr/ADR-012-audio-compatibility-buffer.md),
SPECIFICATION §2.6 and the versioned bounded configuration contract.

Public `media.audioOutputBufferMs: 120 | 200` selects an immutable native profile
for PCM/Opus. Default remains 120. A fixed 9600-frame compatibility ring retains
the observed 186 ms XRDP callback; active capacity governs wrap/full/discard and
reset wipes the fixed maximum backing storage. Browser Worklet and microphone
queues, 100 ms normalizer spans, 20 ms packets and transport credit do not change.

Private settings schema 9 adds bit 6 (64) only with one output codec. HELLO
schema-1 suffix adds `audioBuffer200` bit 2 (4) with output dependency; absent
capability refuses selection before configure/secret. CLI and REST expose it on
guarded Windows RDPSND only. Old strict decoders may reject the new suffix bit;
the private Node/native pair upgrades together. No production credential, raw
audio persistence, arbitrary FreeRDP argv or certificate-policy change is added.

Exhaustive native flags/truncation, independent Node golden vectors, old-peer
refusal, exact profile values, 200 ms ring wrap/reset and a complete 8192-frame
44.1 kHz callback pass. Pure Node checks: 20/20. Combined legacy/native/100-worker
checks: 26/26. Foundation CTest 10/10 and bundled CTest 22/22 pass.

Actual authorized XRDP PCM and Opus select 200, receive real packets, schedule
one ready reset, observe fresh config/data, capture 1080p and close normally.
PCM reports 261 packets / 4944 skipped source frames; Opus 360 / 5904. Prior
120 ms observations reported tens of thousands skipped frames. These short live
observations are not controlled latency/throughput benchmarks.

Actual Edge/API/WebSocket Opus admits 700 records, decodes 638 packets and the
Worklet reports 582656 played frames, nine underflows and no invalid calls or
queue overflow. Desktop/cursor replay and reattachment pass. Source gaps, late
packet intervals and reset discards remain. Manual quality confirmation, measured
total latency/resources, microphone, platforms and sustained/soak gates stay open.
The user explicitly permits the 200 ms native compatibility capacity; standard
<150 ms LAN acceptance is still required for the ordinary profile.

Full combined `pnpm check` passes 518/518. Native assertions/fixture evidence do
not substitute for the retained audible quality, latency/platform and soak gates.

Relocation passes 1/1 with the installed private runtime. A bounded minute-long
visible Opus/200 ms preview closes gracefully with an empty runtime directory;
the preview option's focused tests pass 4/4. The user reports smoother sound,
with remaining interruptions, and accepts it for local development. Their slow
tunnel explanation remains a hypothesis. This scoped acceptance does not claim
uninterrupted playback or measured total latency.
