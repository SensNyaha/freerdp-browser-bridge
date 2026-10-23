# Iteration 356 — Connection Broker VM boot timeout

2026-10-20. The pinned FreeRDP `ERRINFO_CB_SESSION_ONLINE_VM_BOOT_TIMEOUT`
now maps to the existing fixed `RDP_SERVER_TIMEOUT` error. This Connection
Broker reason describes an actual timeout while starting the destination VM,
so callers get the established timeout status/message/retryability. Other
broker reasons and unknown values keep their existing classifications.

Focused native-adapter, manager and Fastify session-snapshot tests pass; the
full Node suite passes in [iteration 355](ITERATION_355.md), which established
the public timeout snapshot contract. Actual server emission and broader
Connection Broker profile acceptance remain unverified. No wire, Release or
dependency change was made.
