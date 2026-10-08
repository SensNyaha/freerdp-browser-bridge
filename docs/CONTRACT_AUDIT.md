# Contract audit — 2026-10-08

Read all 27 supplied Markdown documents (26 manifest entries plus PACKAGE_MANIFEST.md) before implementation. Original source documents are
retained; new implementation details live in this directory.

The supplied material consistently requires one headless C++ process per RDP session, typed
Node orchestration, private bounded binary IPC, strict certificate validation, native media
encoding and separate cursor transport. Secrets must be delivered over private IPC, never
argv/env/plaintext files. Stages 0–10 define v1 acceptance; interfaces alone are not evidence.

Gaps resolved compatibly for the initial lifecycle slice:

- RWI1 byte order, lifecycle kind IDs, payloads and bounds: docs/IPC_FOUNDATION.md.
- Reusable Node library is added as packages/node-bridge alongside the documented layout.
- Worker readiness is separate from RDP `connected`; foundation reports lifecycle=true, rdp=false.
- `/v1/build` reports linked FreeRDP version as null when absent and target version separately.

The user explicitly requires Windows x64 in addition to Linux x64. SPECIFICATION.md calls Linux
the primary deployment and permits Windows ports; this is compatible, with Windows treated
as a required target. Windows framed-stream fallback is already allowed by STACK.md. The
primary Linux SOCK_SEQPACKET requirement is retained as unfinished, not silently replaced.

No product requirement or accepted ADR has been relaxed. Unverified libraries/channels,
Linux transport, full session REST/WS, RDP/server/device tests and production packaging remain
open in TODO.md.
