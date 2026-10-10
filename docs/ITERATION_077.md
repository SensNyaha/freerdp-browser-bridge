# Iteration 77 — bounded isolated Opus browser decode and Worklet admission

Date: 2026-10-10. Implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6/8 after
wire preparation `e8461aa`. Public/native Opus selection remains inactive.

`OpusPlayback` validates source/epoch/clock/sequence before decode, owns one
decode/admission credit, converts exactly one 960-frame stereo AudioData into
bounded S16LE and closes AudioData before forwarding. The existing PCM Worklet
owner grants wire ACK only after admission. Status/gaps retire prediction;
generation guards close late output, and stalls/errors retire decoder and sink.
Raw decoder setup performs no pre-skip or PTS rewrite.

Four ownership cases cover deferred credit, stereo conversion, ordinary/gap
progress, stale generation, status reset, invalid shape/timing/nonfinite/copy
output, duplicates, concurrency, unsafe Number clocks, decoder errors, admission
loss and deadline cleanup. Actual Edge uses **20 packets** from a test-only
executable linked to the pinned private libopus. All decode to 960 stereo frames,
both tone correlations exceed **0.9** after queried lookahead, and the real
Worklet accepts **20 packets** with **23 ordered ACKs** including status/config/
Close. Close leaves zero queued frames, no invalid Worklet calls and a closed
AudioContext. No remote RDP sound or input is generated.

The first real decode test found Edge output timestamp **259,999** for input
**260,000 µs**. A strict identity check rejected this valid rounded callback.
Output validation now allows a safe-integer difference of at most **1 µs** while
forwarding the original wire PTS; a 2-µs mismatch still fails. This is recorded
in the browser contract and covered by a unit callback plus actual Edge.

Bundled CTest **15/15**, foundation **6/6** and the narrow Node/Edge set **5/5**
pass. Full `pnpm check` passes **225/225**, including actual Edge; private native
ZIP relocation passes **1/1**. MSVC /W4 /WX, /analyze and clang-format pass for the
fixed synthetic fixture, which is not installed. Strict TypeScript, lint, format
and `git diff --check` pass.

This is isolated SDK/browser acceptance: the reference viewer does not import
the owner. Publisher/output-lane selection, HELLO and public negotiation,
audible RDP/microphone, decoder internal resources, loss fidelity, A/V scheduling,
LAN latency, platforms and soak remain open. [Contract](AUDIO_OPUS_BROWSER.md).
