# Iteration 360 — Connection Broker cancellation

2026-10-20. The pinned FreeRDP `ERRINFO_CB_CONNECTION_CANCELLED` now maps to
the existing fixed `RDP_CONNECT_CANCELLED` error. Its broker description says
processing of the connection was cancelled. This preserves the public status
and retryability without exposing a numeric native code. Other broker
processing errors remain generic until individually classified.

The native adapter, fixed failure contract and HTTP snapshot paths pass their
focused regression tests. The prior public snapshot coverage is in
[iteration 357](ITERATION_357.md). Actual Connection Broker reason emission
remains unverified; no wire, Release or dependency change was made.
