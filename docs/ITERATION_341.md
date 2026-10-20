# Iteration 341 — server-initiated RDP disconnect classification

2026-10-20. The Node adapter now recognizes the pinned FreeRDP 3.32.1
`ERRINFO_RPC_INITIATED_DISCONNECT` and
`ERRINFO_RPC_INITIATED_DISCONNECT_BY_USER` terminal values and publishes the
fixed `RDP_SERVER_DISCONNECT` error. Logoff and replacement remain separate
classes; unknown values and non-disconnect native errors keep their prior
behavior. No native wire record or dependency setting changed.

The focused native-session classification/adapter suite passes **3/3** and the
public `SessionError` contract passes **1/1**. The Node package build, focused
ESLint, Prettier and `git diff --check` pass using available Node 22.22.0; the
project requires Node 24, so full-suite Node 24 acceptance remains open as
recorded in [iteration 332](ITERATION_332.md). Actual Windows server emission
of these specific ERRINFO values is not claimed.
