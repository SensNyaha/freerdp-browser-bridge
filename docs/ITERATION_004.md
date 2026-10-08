# Iteration 4 — real XRDP connection slice

Date: 2026-10-08. Windows x64, FreeRDP/WinPR 3.32.1.

Commits: 24b69a9 local-development exception, 65b90d2 native/IPC, b637061 native
backend/control API, 1735336 authorized lab runner.

The authorized XRDP lab reached native connected/activation state through private
IPC. Strict mode first rejected its untrusted certificate/hostname mismatch.
The user approved the measured SHA-256 fingerprint for the test; prompt accepted
that exact certificate for the session only. A subsequent AutoLogon check remained
connected after three seconds and a heartbeat, then closed cleanly.
No desktop image was inspected or browser media/input capability claimed.

Implemented: bounded settings/secret IPC, custom client context, concurrent
lifecycle IPC and RDP loop, strict certificate checks, session-only prompts,
deadlines/cancellation, fixed failure mapping, GDI dimension bounds, native
session backend and control-WebSocket certificate decisions bound to its lease.

Validation:

- Bundled pnpm check: 42/42 tests plus types/lint/format.
- Foundation: 35 tests pass, seven native-connection cases explicitly skipped.
- CTest in both profiles: six cases / 108 assertions.
- Native ZIP relocation: one test passes without dependency PATH.
- Native connection/registry/HTTP/WS slice: eight tests pass.
- Fuzz target/corpus now include settings and UTF-8 secret parsers; Clang/Linux
  compilation/execution remains unverified and is not counted as passing coverage.
- Actual XRDP: strict rejection, inspection, user-approved activation and heartbeat.

The user requested a local-development plaintext credential exception. It applies
only to ignored .local-tests files with current-user Windows ACL; the credential
file is not staged, packaged or printed.

Stage 3 remains IN PROGRESS: Windows RDP server verification, interactive auth,
persistent trust/TOFU and changed-certificate handling, reconnect and broader
settings are pending. Linux runtime/transport/sanitizers/fuzzing, production ACLs,
graphics/media/input and devices remain open. See CONNECTION_CORE.md.
