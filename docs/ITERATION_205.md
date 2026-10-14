# Iteration 205 — Linux guarded PCM/Opus output activation

2026-10-14. Implements SPECIFICATION 2.6 / MEDIA_PIPELINE 6 on `9c5a9f9` by
selecting the existing bounded RDPSND virtual sink and PCM/Opus publisher on
Linux amd64. The Linux priority writer now supplies nonblocking send/discard
callbacks and immutable output codec selection. CLI/HELLO report matching
experimental pcmOutput/opusOutput/audioReset/audioBuffer200; the unchanged
versioned extension advertises only the output bit on Linux. AUDIN/input/reset
remain false on Linux. No host audio server/device is used, and usable rdp stays
false. No new wire kind, arbitrary argv, dependency or certificate policy.

Eight actual Linux native/TLS cases cover primary/fallback × PCM/Opus × 120/200
ms. Exact strict certificate rejection, selected source Close, no post-TLS
application bytes, reset unavailable, heartbeat and empty-runtime joined cleanup
pass. Together with existing audio adapter/private/fake-peer cases, focused Node
checks pass 22/22. Pinned linked RDPSND data fixtures remain simulated SVC, not
actual remote sound. A first new assertion incorrectly expected codec in the
shared scalar audioState; it was corrected to the actual contract. A historical
test still assumed Windows-only selection; it now uses the actual HELLO feature.
Both failed logs are retained.

Final full bundled check: Windows 544 passed / 33 platform skips, Linux 507
passed / 70 platform skips, 577 cases and zero failures. CTest: Linux linked
24/24, Windows linked 23/23 and foundation 11/11. ELF closure 34 files /274
edges, installed relocation 1/1 and independent UID1000/read-only/no-network /
cap-drop artifact smoke pass, including verified worker/addon pairing. Current
Linux native TGZ is 24,780,155 bytes excluding Node, SHA-256
`8e8b4841c2ada16758643886af6541fe8d21115911dc9ef95a5f705efe36a586`.

Real XRDP PCM/Opus idle checks activate, publish waiting source, capture 1080p,
keep heartbeat and close. After the user starts audio, Linux receives Formats
but still reports zero samples; one Opus attempt reports RDP_PROTOCOL_ERROR.
The Windows control on the same lab receives 201 Opus packets and schedules
ready-source reset followed by fresh config/data. This narrows investigation
toward Linux/transport/negotiation behavior, without establishing a root cause.
Linux actual ready-source and browser/audible acceptance do not pass yet.
Further negotiation diagnostics and comparison are the next block.

The lab helper can consume one bounded 8 KiB private stdin object and omit report
files in this mode. Its Windows lab-file behavior remains available. The host
wrapper reads only authorized ignored files, wipes mutable transport bytes,
bounds stdout and forwards no raw stderr. No credentials reach argv/env,
containers, images or committed output; native credentials still use private IPC.
Logs: `build/iteration-205-*`. Immutable JS copies retain the recorded limitation.
