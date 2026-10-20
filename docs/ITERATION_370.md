# Iteration 370 — Windows audio repeat isolates native publication skips

2026-10-20. The user explicitly approves one more minute-long Opus/200 ms
fixed-tone preview with the same exact certificate fingerprint. The command,
worker, source recipe and media settings match [367](ITERATION_367.md); only
numeric diagnostic collection was added. The user reports much better sound
with a few small interruptions and considers it an excellent result. This is
their listening assessment, not evidence of a production correction or a
waiver of the remaining uninterrupted-output gate.

The run exits 0 and reports:

- 171 H.264 frames at 1920×1080; ready Opus revision 565 / epoch 563.
- 3,562 audio records, 2,434 decoded/Worklet packets, 2,059,840 played frames.
  Worklet configurations 563, buffering-silence frames 1,005,568,
  underflow frames 8,128 / underflows 95, reset-discarded frames 275,904;
  high-water 2,944 frames, overflow skips/invalid calls 0/0.
- RDPSND formats 1/1, Training 2, Wave 158, writes/completions 322/322,
  cancellations/failures 0/0.
- Native summary: chunks 158, ordinary overflow resets 0, skipped PCM frames
  262,961, skipped publication intervals (`late`) 581, source revisions 8,
  publisher consumer resets 572, published packets 2,451.
- Native clock/format causes: first 1, profile 0, block 1, arrival-backward 0,
  arrival-gap 1, timestamp-backward 0, timestamp-gap 1, formats 2, Close 0.
  Node consumer recovery requests and every result/failure counter are **0**.

This distinguishes the two reset owners in this run: the browser-consumer did
not call native reset. Publication skips and the native publisher's reset
path are observed directly. A skip can cover several intervals, so 581 is not
a count of distinct late calls; neither is every native reset one consumer API
request. The current packetizer marks skipped 20 ms intervals discontinuous,
and the publisher starts a new epoch at a discontinuity. Worklet configuration
then starts buffering again. These code paths explain why publication timing
is the next investigation target; the counters do not yet identify every
stall's scheduling, graphics, callback or OS cause. Source chunk discard and
the rare clock discontinuities remain separate observations.

Browser/server/native cleanup joins, runtime is empty and port 47999 is no
longer listening. The bundled Release worker hash remains
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.
The ignored log is `build/iteration-370-windows-audio-cause-preview.log`.
The helper does not independently verify remote source process exit.
There is no microphone, recovery/reattachment, measured LAN latency,
total-resource or soak acceptance. No code/configuration changes occur in
this evidence-only block. The immediately preceding full Node 762 / 101 skips,
ESLint/build/format and focused checks are recorded in
[369](ITERATION_369.md); documentation formatting and `git diff --check` pass.
