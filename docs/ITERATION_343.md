# Iteration 343 — server disconnect in public HTTP snapshots

2026-10-20. A Fastify integration regression creates a session with the explicit
fake backend, reports `RDP_SERVER_DISCONNECT`, and reads the failed session over
the public GET route. The response retains the exact stable error code, fixed
message and retryability. This covers API serialization and manager cleanup;
the fake worker does not claim actual FreeRDP or remote-server emission.

The API workspace dependency chain builds successfully and the complete
`session-api.test.mjs` file passes **10/10** under Node 22.22.0. Full Node 24
suite acceptance remains open as recorded in [iteration 332](ITERATION_332.md).
No native code changed, so CTest was not applicable.
