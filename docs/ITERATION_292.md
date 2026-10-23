# Iteration 292 — native registry worker-exit isolation and replacement

2026-10-18. Continues Stage 1 / SPECIFICATION §3.1's native-crash survival and
structured failure requirements after `fa55758`. The new case composes the
actual C++ process supervisor with registry failure/cleanup/capacity handling.
It changes no production source, Release configuration, dependency or protocol.

The unchanged lifecycle-only adapter from iteration 291 is extracted into a
shared test fixture. It still sends only HELLO/heartbeat/shutdown and exposes
no RDP-connected state. A new case configures three active sessions / two per
principal and proves the full pool refuses another factory allocation.

All three native workers become ready and have distinct positive PIDs. The
test sends SIGKILL only to its first owned worker. Its registry entry becomes
`failed` with stable `WORKER_FAILED`; the active count falls to two only after
cleanup, the killed PID is gone and only two runtime directories remain. The
two sibling sessions retain their connecting lifecycle states and answer pings.
A replacement restores three active workers, and another heartbeat round passes.
Final joined close leaves zero active entries, live recorded PIDs or runtime
directories. Failure cleanup inspects every joined close result.

The case has a 45-second whole-test deadline and 15-second readiness/retirement
wait bounds. It owns at most three simultaneous workers / four total. It
contacts no RDP/DNS endpoint, physical device or external service. The forced
exit is a controlled process-failure fixture, not a new security investigation.

## Verification

- Windows focused file passes **2/2**, including the existing 40-worker case
  (8.20 seconds) and the new native exit/replacement (0.61 seconds). After adding
  explicit PID identity assertions, the final new case passes **1/1** in 0.50
  seconds. The first case and shared adapter are unchanged by those assertions.
- Linux final focused file passes **2/2**, zero failures: 40-worker capacity
  2.55 seconds and worker-exit isolation 0.04 seconds. The container keeps its
  existing network-none/non-root/read-only restrictions and GCC 13 Debug worker.
- Final changed-file ESLint, Prettier and `git diff --check` pass; staged diff
  checks also pass. The extracted adapter preserves its original implementation.

Common full controls completed immediately before this test-only block in
iteration 291 are Windows `pnpm check` **633 / 90 skips**, Linux **579 / 147
skips**, Windows CTest **15/15** and Linux **16/16**, all without failures.
Those totals precede this additional test and are not claimed as a full rerun
of the expanded suite. The changed composed native file is checked directly
on both platforms above. No new C++/TypeScript/production helper changes justify
another complete build/regression cycle for this fixture-only follow-up.

Evidence: `build/iteration-292-windows.log`,
`iteration-292-windows-final.log`, `iteration-292-linux.log` and runner
`iteration-292-transfer.cjs`. Existing Debug binaries are reused; this is not a
new native source build or clean root checkout.

This accepts the named unconnected framed/native registry exit case. The
production RDP backend's connected resource release, primary IPC capacity,
simultaneous parent/worker hard kill, forced-termination deadline expiry,
broader platform/isolation and resource/soak gates remain open. No Stage 1 or
Stage 10 gate is marked complete.
