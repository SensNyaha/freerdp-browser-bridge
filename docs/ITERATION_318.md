# Iteration 318 — native RSS failure over public HTTP/WebSocket

2026-10-19. Continues TODO Stage 10 / SPECIFICATION §2.12 and §3.1 resource
failure propagation from the [native registry controls](ITERATION_317.md) to
the public server. Only integration tests and documentation change; production
code, Release settings/artifacts and dependency pins remain unchanged.

The test starts the ordinary public server on loopback with an explicit
synthetic owner, real linked worker, production native adapter and ordinary
one-byte OS RSS policy at two-second polls. The existing synthetic TLS peer
produces a pending certificate prompt. No certificate is accepted and the
peer receives zero application bytes; this is not a connected desktop test.

Actual control/media WebSockets attach with issued tokens and the allowlisted
Origin/subprotocol. The measured native RSS breach produces exactly one control
session.error with WORKER_MEMORY_LIMIT, the fixed public message and retryable
false. Both channels close with code 1000 / `session terminal`. Authenticated
GET returns HTTP 200 with the failed snapshot and exact error, Cache-Control
no-store. New token issuance returns HTTP 409 / SESSION_NOT_ATTACHABLE; a
previously issued unused token cannot upgrade and receives HTTP 401.

The native adapter's close returns, PID is absent and runtime empty. Captured
server diagnostics contain neither the fixed synthetic password nor any of
the three issued token values. This is a known-value regression control, not
a new credential-discovery/security investigation.

Focused Windows native registry/API cases pass **2/2**, retained in
`build/iteration-318-windows-focus.log`. Linux focused checking passes the
entrypoint case with one explicit linked-profile skip; foundation CTest passes
**17/17**. Full Linux `pnpm check` passes build/lint/format and Node **655 passed /
153 skips / 808 total / zero failures**, duration 137.44 s. The current Linux
foundation does not link FreeRDP, so this does not accept the public native/TLS
path there. Full Windows `pnpm check` also passes build/lint/format and Node
**754 passed / 51 skips / 805 total / zero failures**, duration 560.72 s.
Current isolated Release CTest passes **31/31** in 20.83 s. Seven protected
inputs remain byte-identical; the retained five module origins, eleven SDK
DLLs, two dependency DLLs and four codec roundtrips pass. Local documentation
links and `git diff --check` pass.
Actual connected Windows public HTTP/WS failure delivery, connected siblings,
CPU composition, hard OS/total-resource budgets, production deployment,
platform/CI and soak gates remain open.
