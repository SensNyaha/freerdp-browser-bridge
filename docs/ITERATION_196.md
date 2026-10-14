# Iteration 196 — prepared IPC-only Node packet primitive

2026-10-14. Continues Stage 1 / ARCHITECTURE per-session UDS integration after
native worker selection `54f3b1b`. [Private adapter contract](NODE_SEQPACKET.md).
Node 24 cannot wrap SOCK_SEQPACKET in net.Socket, so the prepared N-API module
creates the pair and performs bounded nonblocking chunk I/O. RDP remains in
the separate process. No WorkerProcess/public API primary selection is added.

The module has fixed pair capacity and one pinned encoded send per pair,
monotonic handles, header validation, RWS1 progression, scratch/pending wiping,
per-call budgets, original deadlines checked during host polling and explicit
environment cleanup. It is compiled with warnings as errors and matching public
Node24 headers, shipped privately in the Linux bundle and included in the ELF
closure scan. Node's main thread performs no blocking socket wait.

Actual Node24/kernel/linked-worker fixtures pass **7/7**: ten complete lifecycle
connections with private FD3 and owned cleanup; capacity/stale-handle protection;
malformed/replaced pending sends and wiping; thread-environment cleanup with a
pinned 8 MiB record; maximum-record delivery; original write/partial-read deadlines;
and transferred backing storage refusal. Loaded parent maps contain no FreeRDP /
WinPR libraries. These are native lifecycle and IPC tests, not connected RDP.

The stronger environment-exit test initially caught an actual N-API fatal error:
cleanup retrieved the pinned Buffer outside a handle scope. The hook now opens
and closes an explicit scope; the same unclosed pairs/pending-record fixture
passes. First failure is retained in
`build/iteration-196-addon-tests-first-failure.log`; no protection/check was disabled.

Verification:

- Full Linux Node check **460 passed / 75 skipped / zero failures**, 535 cases;
  linked Linux CTest **24/24**. Portable parser/socket sanitizer gates from 195
  remain **12/12**; that result does not include the new N-API module.
- Windows Node **528 passed / 7 Linux-addon skipped / zero failures**, 535 cases.
- ELF closure **34 files / 274 edges**, canonical relocation **1/1**; independent
  artifact-only UID1000/read-only/no-network/init/cap-drop smoke also loads the
  relocated addon and verifies one exact private packet pair, without a SDK.
  Receipt adds `ipcPairs:1` to the previous six modules/three worker replies.
- Current TGZ SHA-256
  `99e52c8dad70d4bcffc134349a09ee5dbc3561ae1746dc4ac4fcbd6a5e0923f4`,
  24,769,547 bytes, excluding Node.js.

The extra ASan/UBSan addon experiment **does not pass**: six of seven cases run,
but the first child lifecycle times out and LeakSanitizer reports allocations in
Node's OpenSSL/Contextify code. Minimal Node-only crypto and worker controls,
without the addon/bridge, also exit 1 with corresponding LeakSanitizer reports.
This establishes a runtime baseline issue; it does not establish the cause of
the child timeout or passing addon sanitizer acceptance. No leak/ASan checks are
disabled. Retained evidence: `build/iteration-196-addon-asan.log`,
`iteration-196-node-asan-control-file.log`,
`iteration-196-node-worker-asan-control.log`. A compatible sanitizer runtime and
successful complete addon run remain required. Normal Release tests all pass.

Remaining required primary activation work: OS readiness/timer/paused-read owner,
supervisor FD/stream substitution and its fake-peer/actual process failure gates,
legacy fallback and configured capacity accounting. Linux connected RDP/audio /
remote release/platform/resource/soak and actual CI remain open.
