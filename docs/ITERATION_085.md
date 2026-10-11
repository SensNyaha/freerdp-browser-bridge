# Iteration 85 — capability-gated private Node Opus selection

Date: 2026-10-11. Implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6 after native
profile wiring `4dab984`.

Experimental HELLO bit 8192 exposes the guarded Windows private Opus profile.
CLI/handshake/build/capability REST share the same report; foundation reports
false. WorkerProcess validates settings/capability before CONFIGURE/SECRET,
selects schema 6 and the typed Opus source before CONNECT, and rejects mixed
PCM/Opus records. Source ownership stays scalar-only. Default/off audio, PCM,
unsupported microphone/latency, private secrets and close behavior remain.

Public NativeSessionWorker refuses Opus before private startup; SessionManager
refuses it before backend allocation. Public WebSocket/viewer routing remains
PCM-only until compressed credit/discontinuity and attachment recovery are ready.
The authorized lab helper accepts optional pcm/opus without remote input or
sound-generation commands and separates metadata report filenames.

Unit protocol/manager checks pass **18/18**. Private source/worker checks pass
**14/14**, including five new cases: fake typed Opus/Close, eight malformed/order /
mixed-profile scenarios, old peer and unsupported-setting refusal, public adapter
startup refusal, and actual native Node Opus strict TLS/codec-1 Close/heartbeat
retirement. The fake Opus packet only exercises framing/TOC, not entropy decoding.
Foundation build/CLI/REST probe **1/1** and private ZIP relocation **1/1** pass.
Bundled CTest **16/16**, foundation **6/6** and full `pnpm check` **236/236**
pass with no skipped tests. MSVC /W4 /WX, /analyze, clang-format, strict TypeScript,
lint, format and `git diff --check` pass.

Actual XRDP Opus observation could not complete: TCP connectivity to authorized
192.168.21.149:3389 returned **False**. This is an unavailable lab acceptance gate,
not a passing RDP/audio result. Prior accepted XRDP/PCM/video evidence remains
historical. No remote input or sound was generated. MSVC analysis initially
detected a constant-false conjunction in the test fixture; an explicit constexpr
branch corrected it without weakening warnings.

Public negotiation/recovery, audible RDP/microphone, loss fidelity, upstream/SDK
resource limits, platforms, measured LAN latency/A/V scheduling and soak remain
open. [Private activation contract](IPC_FOUNDATION.md#private-typed-opus-activation-iteration-85).
