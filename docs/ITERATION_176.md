# Iteration 176 — preserve PCM stream across identical reannouncement

2026-10-13. Implements SPECIFICATION §2.6 and PERFORMANCE.md's requirement to
instrument before optimization. Built on audio ingress correction `2394443`.

Fixed native lifetime counters separate first/reset observations, profile/block
changes, source/arrival backward clocks and gaps, admitted Formats and Close.
Reasons can overlap; they are not a unique total of reset calls. Invalid input
preserves baseline/counters and explicit reset preserves lifetime accounting.
Copied owner snapshots and one fixed numeric retirement line add no public wire
field, growing history or raw sample/format/peer data.

A ten-second actual XRDP probe showed 19 Formats records, no Close, no profile
or block change and only one arrival gap. The bridge was resetting its queue and
clock for every identical table. It now preserves PCM, phase, clock and stream
revision for an identical selected table/version, while still forwarding the
pinned negotiation reply. Changed selected descriptors/version remain refused.
Portable cause-counter tests and actual linked RDPSND/fake-SVC tests verify
retained old samples, fresh next samples and unchanged revision/first-packet count.

After this correction an actual Opus probe delivered 361 packets versus 138 in
the preceding observation. This is a comparison of short live lab observations,
not a controlled throughput benchmark. Source stayed ready after the one explicit
reset; 18 identical Formats no longer caused waiting. Source gaps and large-burst
loss remain: 53,377 skipped PCM frames, 11 late intervals and 27 configurations.

Browser evidence now requests fresh Worklet statistics after 15-second warmup;
the old startup snapshot was stale. Actual Edge/API/WebSocket/Opus decoded 592
packets and the Worklet reported 527,872 played frames, 13 underflows and 39,488
frames discarded by resets, with no invalid calls or queue overflow. Playback
silence/prebuffer and reset losses remain quality gaps, not an accepted smooth
audio or LAN latency result. No physical microphone is requested.

Foundation CTest 10/10 and bundled CTest 22/22 pass with MSVC analysis and
warnings-as-errors. Full Node validation passed 513/514; one fake touch fixture
failed before worker startup with RUNTIME_DIRECTORY_UNCERTAIN at the fixed
five-second helper deadline. Earlier varying process-start failures remain documented in
iteration 175, with focused reruns passing, and are not hidden by longer test
deadlines or protocol-expectation changes. Current queue remains fixed at 120 ms.
