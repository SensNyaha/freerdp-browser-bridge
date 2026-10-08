# Iteration 001 — verified native lifecycle foundation

Date: 2026-10-08. Platform tested: Windows x64. Scope: initial implementation requested by the
user; complete Stage 0/1 acceptance is still pending the dependencies/platform gates below.

## Implemented

- pnpm workspace with strict TypeScript, project references, locked dependencies, ESLint,
  Prettier, CMake/Ninja, C++20, MSVC warnings as errors and /analyze.
- Exactly one standalone native lifecycle worker per WorkerProcess. Versioned bounded RWI1
  IPC, negotiation, request correlation, heartbeat/watchdog, graceful shutdown and kill deadline.
- Private per-worker runtime directory and cleanup; Windows hidden independent process to
  permit EOF cleanup after parent death; Linux PDEATHSIG source path prepared.
- Initial logical TypeBox configuration contract, privilege denials and recursive redaction.
- Reusable @freerdp-bridge/node library and actual worker-backed Fastify build/capability API.
- Exact FreeRDP 3.32.1 source commit verified; headless required-channel build profile prepared.
- Native malformed-packet tests, Node parser fragmentation/golden tests and real process tests.

Primary files: packages/protocol/src/index.ts, native/ipc/*, native/rdp-worker/main.cpp,
packages/config/src/index.ts, packages/node-bridge/src/index.ts, apps/bridge-api/src/*,
CMakeLists.txt, CMakePresets.json, pnpm-lock.yaml, .github/workflows/ci.yml, AGENTS.md.
Examples and reproducible commands are in examples/lifecycle.mjs and docs/DEVELOPMENT.md.
Original blueprint files were retained; only TODO.md is updated for implementation state.

## Verification

| Check | Result |
|---|---|
| Strict TypeScript, ESLint, Prettier (`pnpm check`) | PASS |
| Node unit + native-process/fake-worker integration | PASS: 16 tests, none skipped |
| Native Catch2/CTest | PASS: 4 cases, 43 assertions |
| MSVC C++20 /W4 /WX /analyze | PASS for bridge-owned code |
| clang-format dry run with warnings as errors | PASS |
| 100 sequential real workers | PASS: HELLO, heartbeat, close, no PID/runtime-directory leaks |
| Worker crash with another worker alive + replacement | PASS |
| Parent death and EOF runtime cleanup | PASS on Windows |
| Timeout, overload, wrong response, unresponsive heartbeat | PASS using explicitly fake native fixtures |
| Malformed/truncated native IPC, fixed diagnostics | PASS |
| Worker CLI versus HELLO_ACK versus /v1/build | PASS |
| FreeRDP 3.32.1 immutable source commit | Verified `bf217a504e54cc719880c228e82353382cd7d4fa` |
| Linux/ASan/UBSan/libFuzzer execution | NOT RUN; CI definitions prepared |
| Actual FreeRDP connection, Windows RDP/XRDP/device integration | NOT RUN / NOT IMPLEMENTED |

The native fixtures used for deadlines deliberately do not connect to RDP. Their passing tests
prove supervisor behavior only. The 100-worker test uses the actual C++ lifecycle executable.

## Problems resolved

- Node 22 on the host: SHA-256 verified portable Node 24.21.0 installed only under .tools.
- Node npm certificate-chain failure: Windows system CA store used with TLS verification kept on.
- Startup timeout shared with heartbeat: separate negotiation deadline introduced; overload
  tests still exercise short ordinary-request timeouts.
- Windows parent-job hard teardown prevented worker directory cleanup: independent hidden
  worker process now remains supervised through retained pipes and cleans up on EOF.
- Parser ASCII magic accepted high-bit variants: changed to exact byte comparison with a regression test.
- Windows executable lock during concurrent link/test: native build and tests are executed
  sequentially. Final build/CTest succeeded.

## Open gates and next work

Pinned FreeRDP configure currently fails on missing ZLIB_LIBRARY/ZLIB_INCLUDE_DIR. No remaining
dependency is assumed present. The current executable reports freeRdpVersion=null and RDP=false;
targetFreeRdpVersion is 3.32.1. The required channel build profile is not a supported-feature claim.

Next: finish Stage 0 dependency build, feature inventory and packaged runtime; implement/verify
Linux SOCK_SEQPACKET and run sanitizer/fuzz jobs to finish Stage 1. Then complete Stage 2 session
REST/auth/WS/token/limits/metrics using explicit fake-worker tests before Stage 3 real RDP connect.
Windows explicit runtime ACLs and simultaneous parent+worker hard-kill stale-directory recovery
remain recorded tasks. Actual RDP integration needs Windows NLA and XRDP test endpoints.

## Commits

- `0e220b0` — initial workspace/development rules and FreeRDP source pin.
- `3065f2d` — original documentation preserved.
- `9517003` — locked toolchain, CMake and CI.
- `1672590` — binary IPC, native lifecycle and parser tests.
- `3610524` — configuration contract and redaction.
- `316cdc0` — supervisor, build API, example and integration tests.

Resolve any reference locally with `git show <commit>`. No remote repository was configured
or published by this iteration.
