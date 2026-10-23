# Iteration 209 — Linux virtual microphone worker activation

2026-10-15. Implements SPECIFICATION 2.6 / MEDIA_PIPELINE 7 for guarded Linux
amd64 builds with the pinned public AUDIN ABI. Connection accepts the existing
schema-7 PCM/schema-8 Opus input settings; matching HELLO/CLI pcmInput,
microphoneReset and opusInput flags enable the existing typed Node/public
selection. Foundation/missing-channel/other-platform refusal is retained.

The implementation reuses the tested public virtual source/provider, one fixed
20 ms handoff, source-ready/epoch checks, RDP-thread cadence/reset and reverse
finite retirement. No host sound server/device, new parser/queue, arbitrary
addin arguments or browser permission is introduced. Input/output codec choices
remain independent. Browser capture still requires explicit gesture/permission
and an admitted ready source; a capability flag is implementation inventory.

Twelve new actual Linux process cases exercise primary SOCK_SEQPACKET and
explicit framed pipes, PCM/Opus input and off/PCM/Opus output. They compare CLI
and HELLO, observe exactly one closed epoch-0 input status before terminal
certificate rejection, refuse samples/reset without source authority, preserve
heartbeat and join shutdown with an empty runtime. TLS fixtures receive no RDP
application bytes. Existing raw-native and public session tests now use actual
capability inventory rather than a Windows-only skip, covering schema/profile
refusal and provider lifetime on Linux as well. Samples are synthetic only.

Focused microphone tests pass 46/46. Linux linked CTest passes 24/24 and Windows
linked CTest 23/23, including actual linked AUDIN with simulated DVC transport.
Full `pnpm check` passes Windows 545/46 platform skips and Linux 537/54,
591 cases each, zero failures. Windows foundation CTest passes 11/11; relocated
Linux native bundle passes 1/1 without dependency PATH. Current ELF closure
is 34 files /274 dependency edges. Logs: `build/iteration-209-*`.

Actual lab follow-up cannot establish remote activation: 192.168.21.149:3389
is currently unreachable from the host, and Linux reports RDP_CONNECT_TIMEOUT.
Its selected input closes at epoch 0 and runtime cleanup completes. This is
an environment failure, not negotiated AUDIN evidence.

No ready remote AUDIN, physical microphone, recording, connected capture latency,
transport-loss/device failure, broader distro or sustained resource acceptance
is claimed. Historical Windows-only statements remain evidence of earlier blocks.
