# Iteration 71 — reference PCM viewer and public native selection

Date: 2026-10-10. Implements SPECIFICATION §2.6, ARCHITECTURE §5/11 and
MEDIA_PIPELINE §6/8 after Worklet credit `1c8b327`.

The reference harness opts into PCM with `attach(created, {audioOutput: 'pcm'})`.
It stages the supplied attachment and displays an explicit activation button.
Click creates/resumes an exclusive 48 kHz AudioContext and installs the Worklet
before opening control/media sockets. Cancellation closes even a context awaiting
module loading; delayed preparation cannot attach after cancellation/replacement.
Fresh attach resets counters immediately, including while awaiting the gesture.

Ready is validated synchronously before stream-3 records. Audio routes directly to
the bounded PCM owner independently of pending video decoding. Only the accepted
Worklet reply sends `audio.ack`. Stop/reset clears the ring; stats replies grant no
wire credit. Detach/context loss closes owned audio and sockets. Legacy video
attachment remains available without audio activation. NativeSessionWorker now
accepts explicit PCM when the worker advertises it; legacy peers still refuse it.
Opus, microphone and explicit custom audio latency remain unsupported.

An actual Edge/reference-harness/WebSocket/Worklet fixture with synthetic backend
checks gesture before sockets, cancelled module preparation with no captures,
subsequent successful activation, source waiting/ready, config/PCM admission ACK,
two synthetic packets, Close queue clearing with video preserved, stats and detach.
Fake native-adapter fixtures verify typed IPC forwarding and legacy refusal.
Actual linked native worker/manager TLS tests verify strict certificate rejection,
registered channel retirement and runtime-directory cleanup before GDI. Narrow
native/harness cases pass **8/8**; the corrected counter-reset fixture passes
separately. Full `pnpm check` passes **210/210**. Strict TypeScript, lint, format
and `git diff --check` pass; final viewer lint/format are also checked after its
counter-reset correction. Native code/layout is unchanged from iteration 66.
Clean `31bbfd6` bundled/foundation rebuilds pass CTest **14/14** and **6/6**;
REST/CLI/HELLO probes pass **1/1** in each profile. Private ZIP relocation passes
**1/1**, including local ZLIB/FreeRDP loading without dependency PATH.

The first lab helper attempt incorrectly waited for audio before accepting the
previously authorized certificate. Correcting that order allowed XRDP activation
and 41 H.264 frames with acknowledged waiting status and zero PCM packets. It then
exposed a reattachment check using old video counters during async audio setup;
immediate counter reset fixes that race. Failed attempts are not acceptance gates.
The corrected actual XRDP/Edge `h264 --audio-test` passes with **26 frames**, real
1920×1080 pixels, cursor replay and reattachment, one authorized motion/reset,
acknowledged `waiting` source status and clean runtime cleanup. The Worklet reports
zero configurations/packets/queued frames and no invalid calls. It proves public
source observation/ownership, not negotiated remote audio or audible playback.

This block does not generate remote sound or operate remote applications. Actual
audible RDP, source negotiation/samples, microphone/Opus, audio metrics and measured
end-to-end latency/resource/transport-fault/soak/platform acceptance remain open.
