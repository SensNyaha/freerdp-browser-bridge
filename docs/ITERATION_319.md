# Iteration 319 — connected Windows RSS failure over public HTTP/WebSocket

2026-10-19. Extends the [local TLS/native public control](ITERATION_318.md) to
the authorized connected Windows lab, tracing TODO Stage 10 / SPECIFICATION
§2.12/§3.1. Only explicit lab helper, unit checks and documentation change.
Production resource policy, API/WS/native code, Release profiles/artifacts and
dependency pins remain unchanged.

The new explicit helper selects an isolated Windows source-consumer receipt
and verifies worker/helper SHA-256 values before reading ignored lab credentials
or opening a listener. Only the authorized target and previously approved exact
session-only fingerprint are used. The public server listens on loopback with
an in-memory random host credential and exact Origin/subprotocol. RDP credentials
enter the ordinary POST/manager/private native IPC path; raw server diagnostics
are discarded. Tokens/credentials never enter argv, environment or output.

The one-byte RSS fixture cap, 100%-of-one-core CPU cap, equal five-second polls
and one-second CPU minimum window use the ordinary paired query policy. This
fixture cap is not a production budget. The 25-second overall test deadline
terminates the owned worker/sockets and joins server cleanup on failure.

Control WebSocket handles the exact certificate prompt/decision. Media WebSocket
selects JPEG; each bounded RWB1 config/frame is checked for stream/version,
length, dimensions and JPEG markers, acknowledged and wiped without retaining
images. The first frame must precede any successful RSS sample. This is a Node
transport/credit receiver, not a browser decoder, rendered picture or human
quality measurement. No remote application launch, input or server setting is used.

## Actual authorized Windows result

The isolated iteration 313 Release worker/helper passes **7 actual public JPEG
frames**, 1920×1080, first frame **33,267 encoded bytes**. The first connected/
global RSS sample is **162,975,744 bytes**, producing exactly one control
WORKER_MEMORY_LIMIT with the fixed public message and retryable false.

Both control/media channels close with code 1000 / `session terminal`. GET
returns HTTP 200 / failed / exact resource error and Cache-Control no-store;
new token issuance returns 409 / SESSION_NOT_ATTACHABLE; a previously issued
unused token cannot upgrade (401). A simultaneous second POST refuses with
429 / SESSION_LIMIT before another worker factory call. Native adapter close
returns, query active/waiting owners are zero, native PID is absent and runtime
empty after joined server shutdown.

Exact scalar evidence is `build/iteration-319-rdp-api-memory.log`, exit zero.
Windows focused profile/CLI checks pass **6/6**, including refusal before private
configuration/listener acquisition. Linux focused checks also pass **6/6** and
foundation CTest passes **17/17**. Full Linux `pnpm check` passes build/lint/format
and Node **656 passed / 153 skips / 809 total / zero failures**, duration 134.89 s.
Full Windows `pnpm check` also passes build/lint/format and Node **755 passed /
51 skips / 806 total / zero failures**, duration 547.99 s. Current isolated
Release native CTest passes **31/31** in 24.51 s. Seven protected inputs remain
byte-identical; the retained module/DLL/codec provenance control, structured
actual-result audit, local documentation links and `git diff --check` pass.
The actual helper explicitly supports a
Windows producer only; Linux common checks cannot accept another producer.

Connected CPU failure through the public API, sibling/session isolation, hard
kernel/OS retirement, startup/between-sample/Node/session-total budgets, browser
terminal display/physical input release, full platform/CI/deployment and soak
remain open. Audio/recording and device acceptance are unaffected.
