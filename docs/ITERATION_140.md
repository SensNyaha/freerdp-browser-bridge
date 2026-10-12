# Iteration 140 — public Opus microphone transport

Date: 2026-10-12. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after selected ownership `3f52594`. Explicit Opus input now
selects a typed backend and shared control/media-bound owner. Native adapter
requires opusInput/microphoneReset after HELLO and before private settings /
credentials/connect. Media hello/ready confirms the matching codec and bounded
record size; default PCM and independent video/output credit are preserved.

Focused portable socket/session/state checks pass **23/23**, including new
PCM-only-backend refusal and Opus-only backend/lease/reset cases. Focused
integration passes **45/45**: synthetic private IPC, actual native local TLS
and actual loopback WebSockets with fake RDP. Four new public Opus socket cases
cover exact ready profile, no automatic grant, independent video credit, fresh
discontinuity after reset, codec mismatch/malformed retirement, controller-loss
late ACK, copied encoded drain/wipe and fresh source before replacement.

Six actual native/session-manager TLS cases now cover PCM/Opus input with
output off/PCM/Opus. Strict certificate refusal publishes closed epoch 0 with
zero RDP application bytes/capture and runtime cleanup. This does not establish
ready AUDIN, device capture or remote recording. XRDP TCP was unavailable in
iteration 139; no new successful real RDP claim is made.

Initial full `pnpm check` was **454/455**: an existing raw native PCM/PCM
case exceeded its generic 3 s HELLO waiter before configure. WorkerProcess's
existing default startup contract is 10 s. The raw fixture now uses that same
bounded startup budget only for HELLO, retains 3 s command waits and the 15 s
overall case limit, and refuses parser/early-exit faults promptly. This changes
the test startup expectation, not production deadlines or antivirus policy.
Focused unchanged-native lifecycle/TLS recheck passes **12/12**. Full recheck
passes **455/455** on pinned Node 24. CTest bundled **17/17** and foundation
**6/6**, formatting and diff checks pass.

The reference viewer
still selects PCM input only; isolated browser Opus encoder composition with
permission/graph/network credit and actual recording/LAN/platform/resource /
failure injection/soak gates remain open. [Contract](MICROPHONE_OPUS_MEDIA.md).
