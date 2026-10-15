# Iteration 234 — exclusive clipboard control ownership

2026-10-15. Implements the session/controller ownership portion of SPECIFICATION
§2.7 using native revoke from `4f85919`.
[Current contract](CLIPBOARD_SESSION.md).

The manager now binds clipboard to one exact control attachment. Explicit
text-only policy and complete backend source/read/write/revoke hooks are required;
off/omitted selection stays independent. Source and lease are rechecked before
dispatch and after completion. One grant has one flight and no content queue.
Stop, detach or subscriber loss revokes authority immediately; replacement waits
for drain and, after any attempted local write, one accepted native revoke with
matching no-offer state. A nonrenewing 15-second retirement ceiling fails unsafe
ownership permanently and asks the host to terminate once. Read-only use performs
no remote mutation. Late, stale and malformed accepted buffers are wiped.

Eight pure ownership and seven fake-backend manager cases cover direction/size,
copied metadata, one flight, late read/write, subscriber loss, old leases, source /
generation/revision faults, revoke refusal, timeout and hanging termination.
An actual Node child/private-IPC synthetic peer verifies manager→typed native
command composition, write drain, exact revoke reply, heartbeat, replacement,
read ownership and empty-runtime cleanup. It is not an RDP server or OS clipboard.

A regression exposes why scalar metadata cannot copy arbitrary backend fields:
the first Windows full run with the new canary test fails (610 passed / 49 skips /
one failure, 660 cases). Source projection now copies only named scalar fields;
the current focused suites pass 16/16 on Windows and Linux. The earlier focused
fixture also omitted its required client rate-key and correctly received
AUTH_REQUIRED; that fixture is corrected without changing authentication.

Full bundled Linux final `pnpm check` passes 606 with 54 platform skips / 660 cases.
Full bundled Windows final check passes 611 with 49 platform skips / 660 cases.
Native CTest baseline passes Windows 29/29 and Linux 30/30. No native parser or
channel owner changes here; sanitizer/fuzzer evidence remains scoped to Iteration
233. Logs: `build/iteration-234-*`.

Native adapter forwarding hooks are prepared, but non-off clipboard still
refuses before spawning until public framing/browser activation is implemented.
No larger control WebSocket payload, public clipboard command, secret persistence
or remote clipboard read is introduced. The one actual XRDP mutation approval
was consumed in Iteration 232 and is not reused. Actual transfer/revoke, browser
permission/gesture, upstream memory/CPU and managed-drive acceptance remain open;
Stage 7 remains IN PROGRESS.
