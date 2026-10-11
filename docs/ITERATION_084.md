# Iteration 84 — native worker Opus profile ownership

Date: 2026-10-11. Implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6 after shared
source ownership `7f00491`.

Guarded Windows workers accept raw private schema-6 Opus selection, fix the
output dispatcher before CONFIGURE_ACK and create the matching AudioSession
publisher on the RDP thread. Unsupported builds refuse audio output. Both
profiles use the same guarded static RDPSND descriptor, bounded PCM source
formats, audio-first pump and finite retirement. No upstream compressed RDPSND
format or host sound device is enabled. High-level Node/public selection and
HELLO/CLI capability remain unchanged in this block.

Two raw native IPC cases pass **2/2** on bundled Windows. One verifies exact
configuration/shutdown acknowledgements before any secret/connect command. The
other uses synthetic credentials through private IPC against the local TLS
fixture: strict rejection produces RDP_CERTIFICATE_REJECTED, one codec-1 Close
state, zero application bytes, healthy heartbeat and graceful shutdown. It
starts/retire the actual native AudioSession and guarded channel before GDI;
no sample packet or audible audio is claimed. The initial empty-password fixture
stopped at authentication before TLS; a synthetic sentinel corrected the test.
Foundation CONFIGURE refusal passes **1/1**.

Bundled CTest **16/16**, foundation **6/6** and full `pnpm check` **230/230**
pass with no skipped tests. MSVC /W4 /WX, /analyze, clang-format, strict TypeScript,
lint, format and `git diff --check` pass.
Private typed Node activation, public media negotiation, audible RDP/microphone,
loss fidelity, upstream/codec resource bounds, platform/LAN latency/A/V scheduling
and soak acceptance remain open.
[Contract](AUDIO_SESSION_CODECS.md#native-worker-profile-wiring-iteration-84).
