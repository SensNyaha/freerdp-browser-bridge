# Iteration 334 — selected server ERRINFO refusals

2026-10-20. Extends the selected remote-reason mapping using the pinned
FreeRDP 3.32.1 public `freerdp/error.h` names. `ERRINFO_SERVER_DENIED_CONNECTION`
and `ERRINFO_SERVER_INSUFFICIENT_PRIVILEGES` become the fixed
`RDP_SERVER_REJECTED` failure. `ERRINFO_SERVER_FRESH_CREDENTIALS_REQUIRED`
becomes the existing `RDP_AUTHENTICATION_FAILED`. Existing timeout/logoff
reasons remain distinct; unknown codes and non-disconnect errors retain their
prior classification. Native IPC layout and diagnostic contents are unchanged.

The focused classifier suite passes **2/2**, including the three new server
reason controls, ordinary/unknown disconnects, KDC/TLS connection controls and a
non-disconnect protocol control. The node package TypeScript build, focused
ESLint, Prettier and `git diff --check` pass with the available Node 22 runtime.
The full repository suite was not repeated because its Node 24 admission tests
already fail in this environment; see [iteration 332](ITERATION_332.md). No
native code changed, so CTest was not rerun. Actual remote server rejection
integration remains open.
