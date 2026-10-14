# Iteration 181 — actual ready-source browser audio reattachment

2026-10-13. Verifies SPECIFICATION §2.6 with the accepted ADR-012 profile.
Two explicit local recovery modes select PCM/Opus output with 200 ms native
storage and no microphone. Existing idle-source inventory modes remain distinct.
The recovery modes require an active source and previously played samples before
detaching; after attachment they require fresh Worklet configuration, packets,
played frames and no invalid calls. Opus additionally requires an actual scheduled
native reset and a greater source epoch. Merely waiting or scheduling reset without
fresh receiver progress cannot pass. Observation has a 15-second recovery deadline,
one scalar snapshot and fixed counters; no audio recording or remote sound command.

Actual authorized XRDP / native worker / API / WebSocket / Edge results:

| Output | Before/after epoch | Scheduled reset after detach | Fresh receiver evidence |
| --- | --- | --- | --- |
| Opus | 122 → 131 | 1 | 12 decoded packets, Worklet 1 configuration / 3 packets / 1,920 played frames |
| PCM | 127 → 139 | 0 (not required for raw PCM attachment) | Worklet 5 configurations / 10 packets / 6,784 played frames |

Both keep 1080p H.264, separate video/audio credit, cursor replay and ordinary
session deletion. Both exit 0 with empty private runtime directories. Epochs may
also advance due to source/timeline gaps; the reset counter records the actual
private method result, not an inference from epoch difference alone.

Mode/diagnostic/soak fixtures pass 9/9 and the full combined Node check passes
520/520; relevant native verification is foundation 10/10 / bundled 22/22 in
iteration 180. This closes the named actual XRDP ready-source attachment case,
not general RDP reconnect, transport-loss/platform/failure injection, uninterrupted
audio, measured LAN latency, microphone recording or sustained/concurrent use.
The user accepts current smoother Opus/200 ms output for local development.

Implementation/evidence commit: `ac23781`.
