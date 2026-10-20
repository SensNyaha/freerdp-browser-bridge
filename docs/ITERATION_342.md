# Iteration 342 — server disconnect in failed session snapshots

2026-10-20. The fake-backend manager regression now includes
`RDP_SERVER_DISCONNECT` as well as `RDP_SESSION_REPLACED`, checking that both
recognized native terminal classes reach the failed public session snapshot
with their fixed code, message and retryability. This composes existing manager
behavior; it does not claim that a remote server emitted either ERRINFO value.

The focused manager case passes **1/1** and the complete manager unit file passes
**14/14** using Node 22.22.0. Full Node 24 suite acceptance remains open as
recorded in [iteration 332](ITERATION_332.md). No native code changed, so CTest
was not applicable to this test-only slice.
