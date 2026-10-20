# Iteration 362 — renewed Windows browser audio observation

2026-10-20. The user authorized one output-only Windows RDP audio smoke.
The existing Edge helper ran H.264 with Opus/200 ms and recovery checks using
the exact session-only certificate fingerprint. It connected and rendered
11 frames / 933,559 encoded bytes at 1920×1080, including five H.264 keyframes.

The source stayed enabled but `waiting` at revision/epoch 1 with configuration
still awaited. Browser/Worklet configuration, packet, decoded and played-frame
counts were all zero; buffering silence reached 744,576 frames. Video and
decoder queues were zero in the retained sample. The recovery precondition
failed before detachment, so no audio replay or audible acceptance is claimed.
The helper reported the general `reattach` phase and exited 1; that phase label
does not establish that reattachment itself failed. A prepared active source
must be verified before interpreting this as a transport or quality defect.

Joined cleanup left `.runtime/viewer-lab` empty and port 47999 without a
listener. The bundled worker SHA-256 remains
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.
The ignored result is `build/iteration-362-windows-audio-opus.log`.
No source application was launched by the agent. Release configuration and
dependency pins are unchanged. Earlier active-source results in
[iteration 307](ITERATION_307.md) retain their historical scope; current
active-source playback/recovery, audible quality, recording and latency remain
open.
