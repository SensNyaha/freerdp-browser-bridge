# Iteration 89 — private audio reset capability and Node correlation

Date: 2026-10-11. Implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6 after
RDP-thread dispatch `d4d2e29`.

Guarded Windows HELLO/CLI/build/capability report audioReset bit 16384. Native and
Node are upgraded together; old peers decode false. The bit requires connectCore
and at least one PCM/Opus output profile. Foundation reports false. WorkerProcess
adds a nonzero-u64 expected-epoch reset schedule with local readiness/stale/busy
refusal, one existing correlated request timer and typed reply validation. A
successful schedule cannot be repeated against the same epoch while status is
still pending. No compressed packet is rewritten, no second queue is created and
public Opus startup remains gated.

Six new fake-peer cases cover both codec epochs, ordered waiting/ready/config/new
marked data, unchanged old payloads, concurrent busy, pending shutdown rejection,
typed refusals, old peers/invalid epochs, scheduled-epoch suppression and malformed /
duplicate/wrong-ID replies. Fake Opus bytes are framing fixtures, not entropy or
audible acceptance. Narrow Node **31/31**, unit codecs **12/12**, bundled CTest
**16/16** and foundation **6/6** pass. Full `pnpm check` passes **246/246** with
no skipped tests. Foundation CLI/handshake/REST comparison **1/1** and private ZIP
relocation **1/1** pass. MSVC /W4 /WX, /analyze, clang-format, strict TypeScript,
lint, format and `git diff --check` pass.

Restored actual XRDP Opus and PCM helpers pass idle waiting-source activation,
heartbeat, 1024×768 capture and terminal Close again. The new API returns local
unavailable for the waiting source; this is not native ready-source reset or
audible acceptance. Both observe zero audio packets; no remote input/sound was
generated. Reports remain ignored .local-tests artifacts.

Public compressed transport/attachment recovery, actual ready-source reset and
audible RDP, microphone, resources/platforms/LAN/A/V and soak remain open.
[Private contract](AUDIO_RESET.md#private-node-selection-iteration-89).
