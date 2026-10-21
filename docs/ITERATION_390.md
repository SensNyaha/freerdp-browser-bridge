# Iteration 390 — separate source preparation from audio observation

2026-10-21. Addresses the P0 MVP test gap in [387](ITERATION_387.md): its
five-minute manual window spent most time preparing a source and observed only
23.52 seconds of rendered audio. The user's positive listening assessment is
preserved; it is not relabelled as a full three-minute observation.

The explicit manual-source mode now waits at most five minutes for the existing
browser `decoded` counter to become positive, then observes for 180 seconds.
A single scalar log event records the observed first decoded packet and budget.
It adds no new media telemetry/owner/protocol. Missing source fails this named
scenario through existing cleanup. Connect, record, credit and worker deadlines
are unchanged; ordinary one-minute listening and fixed 45-second modes retain
their previous behavior. The source command remains a local draft until the
user separately sends, pastes and executes it.

The user's console-paste confusion also exposes a reference UI explanation gap.
The successful-offer status and inline help now explicitly tell the user to
focus the remote application and use its Paste command. Offer ACK still means
clipboard ownership, not automatic keystrokes or application consumption.
No automatic paste or OS clipboard access is added, and the old success-message
prefix remains compatible with the existing lab probe.

Source/options focus passes 10/10; three actual-WS/fake-RDP Edge direction /
retirement cases, actual browser permission refusal and synthetic Worklet stats
collection pass 5/5 in 23.23 s. Evidence: `build/iteration-390-focus.log`,
`build/iteration-390-browser-focus.log`. Full linked Windows `pnpm check` passes
build/lint/format and 890 / 51 skips / 941 total, zero failures, in 546.88 s
(`build/iteration-390-linked-check.log`). The user separately authorized one
real three-minute repeat with the same exact certificate fingerprint and manual
source preparation. That session starts after the full regression; these
fixtures do not accept its sound.

The authorized headed Edge / Windows RDP repeat exits 0. No heavy regression
runs concurrently. The user manually sends, pastes and starts the fixed source;
the first decoded packet starts the 180,000 ms observation. The user reports
"ровный нормальный звук". This accepts the named three-minute listening slice,
separately from the automated report's `audibleAcceptance:false`.

Evidence: `build/iteration-390-manual-audio.log`:

- H.264 1920×1080: 59 frames; Opus ready, final revision 42 / epoch 40;
- 9,020 audio records, 8,938 decoded/Worklet packets, 40 configurations;
- 8,575,232 played frames: **178.65 seconds of rendered samples**;
- Worklet underflow frames/events 1,024/12, buffering-silence frames 1,458,176,
  overflow-skipped frames 0, reset-discarded frames 3,840, invalid calls 0,
  high-water 2,944 and queued frames 1,408. Cumulative buffering silence also
  includes preparation; it is not a measured active-stream outage duration;
- server/client Formats 1/1, Training 1, Waves 964, writes/completions
  1,931/1,931, cancellations/failures 0/0;
- native chunks 964, overflow resets 0, skipped PCM frames 104,804,
  late publication intervals 64, revisions 7, lifetime consumer resets 44,
  packets 8,961. First/formats causes 1/1; other source causes and Node recovery
  requests are zero. The 40 configurations are observed discontinuities,
  despite the positive listening assessment; reset-free continuity is not claimed;
- joined runtime cleanup passes. Post-run inventory finds zero worker processes
  and zero entries in the owned runtime.

The remaining publication stalls need a focused scheduling investigation using
the existing counters. No PCM/120 ms, latency, recovery, microphone or wider
platform acceptance follows from this single Opus/200 ms slice.

No native/Release/dependency or public wire change occurs. Linked CTest 34/34
and base Linux CTest 18/18 / full Node 766 / 178 skips remain their scoped
[387](ITERATION_387.md) and [389](ITERATION_389.md) evidence; the latter's source
snapshot predates these helper/text-only changes. Broader input, Linux linked /
XRDP and combined clipboard/audio acceptance remain in [MVP acceptance](MVP_ACCEPTANCE.md).
Final source/artifact audit matches all 353 native inputs, both linked Debug
outputs and seven protected files. `git diff --check` passes.
