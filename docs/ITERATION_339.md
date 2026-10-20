# Iteration 339 — session replaced by another connection

2026-10-20. Maps pinned FreeRDP 3.32.1
`ERRINFO_DISCONNECTED_BY_OTHER_CONNECTION` to fixed `RDP_SESSION_REPLACED`
instead of the generic remote disconnect. This error indicates the existing
session ended after another connection took over. Unknown codes and all
non-disconnect failure classes retain their prior mapping. The RWI1 state
record and public failure envelope structure are unchanged.

The focused classifier/adapter suite passes **3/3**, and the public status,
message and retryability check passes **1/1**. Package build, focused ESLint,
Prettier and `git diff --check` pass with the available Node 22 runtime. Actual
server emission remains unverified; the full Node 24 gate is separately open in
[iteration 332](ITERATION_332.md). No native code changed, so CTest was not
rerun.
