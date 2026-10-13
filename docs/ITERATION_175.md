# Iteration 175 — actual XRDP audio ingress compatibility

2026-10-13. Implements SPECIFICATION §2.6 and ARCHITECTURE §6/11/12 against
the pinned public FreeRDP 3.32.1 channel. The user confirmed mstsc playback and
left audio running in the authorized lab. Historical waiting-only reports remain
preserved; this block supplies actual source data evidence.

Three bridge refusals prevented active playback:

- Training incorrectly required exactly four body bytes. The lab sends an opaque
  padded body; complete framing and the 64 KiB cap remain enforced.
- A second identical selected PCM table was treated as unsupported renegotiation.
  A fixed candidate now admits only identical descriptor order/count/version,
  resets stale samples and forwards negotiation. Changed tables remain refused.
- A valid 8,192-frame stereo 44.1 kHz callback exceeded the 100 ms conversion
  profile. Whole records stay bounded; fixed spans reuse the normalizer and the
  120 ms ring retains only the newest samples, counting discontinuous discard.

Native tests include fragmented padded Training and exact linked confirmation,
identical repeats before/after Open, changed table refusal, large callback tail
identity, rational 44.1 kHz conversion, maximum 64 KiB mono8 input and clock
continuity. These use portable code or actual linked RDPSND with fake SVC;
they are separate from the real lab results below. The padded fuzz seed is
prepared; local sanitizer/fuzzer execution is still unavailable.

Actual private PCM observed two configs and 14 packets; Opus observed 17 configs
and 133 packets. Both kept heartbeat, captured 1920×1080 and closed normally.
Actual Edge/API/WebSocket PCM admitted 323 records; Opus admitted 325 and decoded
217 packets into the Worklet path. Both rendered the desktop and replayed cursor
after reattachment. Audio permission is gesture gated; no microphone is requested.

An additional private ready-source probe requested exactly one reset in each
codec. Both returned scheduled and then published fresh config and packets with
a larger epoch, kept heartbeat/desktop capture and closed normally. PCM delivered
85 packets with nonzero sample bytes; Opus delivered 127. This accepts private
ready-source reset on this lab, not public attachment recovery, reconnect or
audible no-stale-sample acceptance.

These counts prove transport/decoder admission, not audible or uninterrupted
playback. Source epoch changes are frequent. The real 186 ms burst exceeds the
120 ms handoff and causes sample discard; CPU, queue latency, broader source recovery,
perceptual quality, microphone, Windows-server, Linux and soak gates stay open.
Final Worklet counters may belong to a reset empty queue and must not be read as
lifetime played-frame totals. The user heard the actual Opus manual viewer but
reported interruptions. Audibility is observed on this lab; quality acceptance
fails and the Stage 6 gate remains open.

Only fixed code-owned numeric fault diagnostics are exposed by the lab helper;
raw upstream logs remain disabled. Credentials stay in ignored local lab files
and enter the worker through private IPC. There is no certificate-policy change,
new public wire kind or newly advertised audio capability.

One fixed retirement summary reports existing chunk/overflow/skipped-frame,
late-packetizer, source-revision and publisher counters. The lab helper recognizes
only that bounded numeric grammar; missing/fragmented diagnostics are not invented
as zero. No sample or format blob, account, peer or arbitrary log is persisted.

A ten-second actual Opus probe counted 15 large callbacks, zero ordinary packet
overflows, 48,300 skipped old PCM frames, three late packetizer intervals, 35
source revisions and 39 consumer resets. This narrows the problem: substantial
source loss exists before browser transport. It does not identify every revision's
cause or prove a browser decoder defect. Additional clock/Close/table counters
are the next diagnostic step; enlarging queues would require explicit latency
measurement against the retained target.

Validation: foundation CTest 10/10, bundled CTest 22/22 and relocation 1/1 pass
with MSVC warnings-as-errors/analysis and clang-format. Ready-source reset
results are recorded above; no unfinished acceptance is claimed.

The first full Node run passed 512/514: one helper startup became uncertain and
one Edge launch timed out. Both focused reruns pass 2/2 without changing deadlines
or expectations. The quiet rerun also encountered two other native bootstrap
timeouts. There is no all-514-pass claim; process-start reliability remains open
and will be investigated separately instead of weakening protocol expectations.
