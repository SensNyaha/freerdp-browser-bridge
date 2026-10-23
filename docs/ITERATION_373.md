# Iteration 373 — authorized Debug audio preview remains waiting

2026-10-20. The user explicitly authorizes one minute-long Windows lab /
Edge Opus/200 ms preview with the corrected Debug worker and the previously
approved exact certificate fingerprint. The receipt-selected helper from
[372](ITERATION_372.md) uses `build/native-clean-PUICs8/receipt.json` and worker
SHA-256 `6613765109eedc498178827d764cd0c925456d8c9159daa4857def5e36b27ac6`.
The source is the deadline correction tested in [371](ITERATION_371.md).
No further connection is started under this one-session authorization.

The fixed 45-second tone command is dispatched through private input. Actual
command execution and source ownership are not independently read back.
H.264 renders 528 frames at 1920×1080. Audio remains enabled/waiting at revision
1 / epoch 1, awaiting its first configuration: one status record, zero decoded
packets, Worklet configurations, packets and played frames. Worklet startup
buffering silence is 3,086,464 frames; underflow, overflow, invalid-call and
reset-discard counters are zero. This is an absent-source observation, not
uninterrupted playback or an audio-fix acceptance result.

The joined native footer reports zero server/client Formats, Training, Waves,
writes, completions, cancellations and failures. Native chunks, overflow,
skipped frames, late intervals and packets are zero; revisions are 3 and
consumer resets 2. All recorded source-discontinuity causes and Node consumer
reset requests/results are zero. Without negotiated audio, these counters
cannot test deadline scheduling or be compared as an active-stream improvement
against [370](ITERATION_370.md). The negotiation/source cause remains unknown.

The helper reaches its final joined-cleanup record with `runtimeEmpty:true`.
A subsequent local check finds no worker process, no entries in the viewer
runtime and no listener on 47999. The original invocation's execution handle
is unavailable after context handoff; no shell exit code is asserted from that
handle. The retained complete numeric log is
`build/iteration-373-debug-audio-preview.log`.

The local audit still matches all 351 native source inputs, both Debug
artifacts and seven protected inputs. Original Release worker SHA-256 remains
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.
Release configuration, dependency versions, certificate policy and microphone
selection are unchanged. Documentation formatting and `git diff --check` pass;
the native/full Node checks remain the separately scoped results in [371](ITERATION_371.md).
Stage 6, actual corrected-worker playback, recording, resource, latency and
soak gates stay open.
