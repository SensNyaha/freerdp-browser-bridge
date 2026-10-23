# Iteration 300 — native Windows CPU counter prerequisite

2026-10-18. Continues SPECIFICATION §2.12 and TODO Stage 10 CPU/memory watchdogs
after sampled RSS acceptance. Adds a measurement primitive; CPU enforcement
remains open. Release configurations/artifacts and dependency pins are unchanged.

## Implementation

The existing private host helper accepts `--process-cpu-micros <pid>` and returns
only cumulative kernel+user microseconds plus version/error scalars. It uses
the same bounded PID grammar and limited query access as RSS. Shared RAII joins
process-handle close before either result; a failed close cannot become a
successful scalar. No process paths/timestamps, session data or credentials
enter the receipt. Existing directory/RSS receipts are preserved.

A portable constexpr converter checks unsigned addition and exact-JSON integer
bounds, then floors combined 100 ns counters to microseconds. It preserves
fractional carry between kernel and user values. New CTest coverage exercises
these boundaries independently of the OS query. [Host contract](PROCESS_CPU.md).

## Verification

The new actual-helper regression first fails against the unchanged binary
with exit 2, retained in `build/iteration-300-cpu-before.log`. After the change,
it observes a nonnegative scalar on its own Node process and an increase after
at least 30 ms of that process's CPU work, within a finite two-second bound.
Malformed/overflow PIDs are refused without output; missing process reports
zero micros and an error. No RDP/device or external system is used by this test.

Windows focused helper/RSS/core-result checks pass **10/10**. The shared handle
change preserves actual directory collision/grammar tests and cancellable RSS
queries/target heartbeat. Final MSVC C++20 Debug build uses `/W4 /WX /analyze`,
CTest passes **16/16** (5.45 seconds), and the explicit CPU target passes
**2 cases / 12 assertions**. Native clang-format and working diff checks pass.

Linux initially refuses a root-source path against the nested source-copy
CMake cache; no build occurs. `build/iteration-300-linux-source-mismatch.log`
retains that failed invocation. The corrected runner explicitly overlays the
four changed native inputs into that cache's own source copy. It reuses the
restricted UID1000/read-only/no-network fixture and prepared Catch2/tools;
Debug configure explicitly disables fetching. This is an incremental fixture,
not a new pristine checkout or Linux process CPU-query acceptance.

Corrected Linux GCC Debug CTest passes **17/17** in 6.56 seconds, including
the CPU converter's **2 cases / 12 assertions**. Full Linux `pnpm check`
passes build/lint/format and **599 passed / 148 platform/profile skips / 747
total / zero failures**, Node duration 107.59 seconds. The Windows-only CPU
query case is explicitly skipped there.

Full Windows `pnpm check` passes build/lint/format and **654 passed / 90
platform/profile skips / 744 total / zero failures**, Node duration 372.11
seconds. Final working/staged diff checks and seven local documentation links
pass. The existing bundled Release worker SHA-256 remains
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.

Evidence: `build/iteration-300-windows-native{-final,}.log`,
`iteration-300-windows-focused-{initial,final}.log`,
`iteration-300-windows.log`, `iteration-300-linux.log`,
`iteration-300-run.py`, `iteration-300-transfer.cjs` and the ignored offline
Windows wrapper `iteration-300-native-build.ps1`.

The host CPU command is additive and versioned independently of worker IPC;
HELLO/browser capabilities and public settings are unchanged. Node cancellation/
sampling ownership, Linux CPU querying, rate/budget policy and actual connected
CPU/total-session resource/OS-failure/soak acceptance remain open.
