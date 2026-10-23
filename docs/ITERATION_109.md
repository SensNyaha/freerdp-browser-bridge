# Iteration 109 — private Node PCM microphone capability and admission

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after worker integration `17e03ca`.

Guarded Windows/AUDIN HELLO/CLI adds independent `pcmInput` bit 32768. Private
WorkerProcess selects PCM input through schema 7, validates ordered source
metadata and exposes one-flight typed sending. Old epochs are refused and samples
are not automatically retried. Public NativeSessionWorker refuses non-off input
before process startup until lease/permission/reset/browser integration exists.

Seven new Node cases cover bounded fake IPC authority/admission/failure and
actual native process strict TLS refusal/lifetime. The focused run passes
19/19 including protocol and previous raw native tests. Bundled CTest passes
17/17, foundation 6/6; MSVC /W4 /WX /analyze build checks pass.
Full bundled `pnpm check` passes **297/297**, with no skips. clang-format and
diff checks pass. The first sandboxed check stopped before tests because ESLint
could not enumerate the local test directory (EPERM); the authorized full check
ran with the normal workspace permissions and passed without changing rules.

No device capture, browser permission or negotiated remote microphone is claimed.
Reset, public control/media, resampling/Opus input, connected-worker latency,
upstream core bounds/lost transport, physical/remote/LAN/platform acceptance
remain open. [Private Node contract](MICROPHONE_NODE.md).
