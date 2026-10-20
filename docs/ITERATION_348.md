# Iteration 348 — NLA-required failure reaches the public session snapshot

2026-10-20. The recognized `RDP_SECURITY_MODE_REQUIRED` error survives the
fake worker lifecycle, manager state, and public HTTP `GET /v1/sessions/:id`
with its fixed message and `retryable: false`. The same HTTP regression keeps
the existing retryable `RDP_SERVER_DISCONNECT` case, so retryability remains
distinct across these remote terminal failures.

Focused Node 24.21.0 checks pass: session manager **14/14**, session API
integration **10/10**, ESLint, Prettier check, and `git diff --check`. The first
HTTP-test attempt timed out because its new worker index was captured after the
session-creation request could already create the worker. Capturing the index
before the request fixed the test; the production API/manager code was unchanged.

This uses the explicit fake backend and makes no RDP connection. It verifies
public error propagation, not that a server emits an NLA-required failure; that
real-server behavior remains unverified. Native CTest was not rerun because this
iteration changes only Node tests and documentation; the full workspace/native
regression is recorded in [iteration 347](ITERATION_347.md).
