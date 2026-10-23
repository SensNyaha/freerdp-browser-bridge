# Iteration 338 — selected server operational ERRINFO mapping

2026-10-20. Extends the pinned FreeRDP 3.32.1 remote disconnect map for
server out-of-memory, driver-stack readiness/failure, DWM, Winlogon and CSRSS
failure reasons. This explicit whitelist emits fixed `RDP_SERVER_FAILURE`
status and message; timeout, logoff, server denial and credential reasons retain
their existing distinct codes. Unknown numeric values remain generic and the
private RWI1 layout is unchanged. The codes identify a selected set of server
operational reasons, not exhaustive RDP error coverage or confirmed Windows
Server SKU behavior.

The native-state classifier and adapter composition suite passes **3/3**;
the public `SessionError` status/retryability case passes **1/1**. Node package
TypeScript build, focused ESLint, Prettier and `git diff --check` pass on the
available Node 22.22.0. Full Node 24 acceptance remains open as recorded in
[iteration 332](ITERATION_332.md). No native code changed, so CTest was not
rerun. Actual server emission of each mapped reason remains unverified.
