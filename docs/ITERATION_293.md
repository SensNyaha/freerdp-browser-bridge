# Iteration 293 — lifecycle fixture startup abort joins native retirement

2026-10-18. Corrects a test-adapter cancellation gap found while preparing the
next Stage 10 watchdog task after `7574f63`. Traces to Stage 1 / SPECIFICATION
§3.1's bounded cleanup requirement. Production `NativeSessionWorker` already
uses the correct startup terminate/join sequence and is unchanged.

`WorkerProcess.close()` intentionally refuses the `starting` state. The test-only
adapter introduced in iteration 291 called it directly from its abort handler,
cached that rejected close promise and did not revoke native startup. Normal
capacity and post-ready exit cases passed, but they did not exercise this path.

The new deterministic test calls the adapter's start and synchronously aborts
while native filesystem preparation is pending. Before the fix, start rejects
only after the native child has nevertheless spawned: the PID assertion fails.
Independent native termination in the test's `finally` joins that intentionally
failing control, so the reproducer itself leaves no child or runtime behind.
The original failure is retained in `build/iteration-293-before.log`.

The fixture's close now sets its closing guard, calls `terminate()` if the
native state is still `starting`, then caches and joins native close. Native
startup's existing authority checks stop before spawn and finish owned cleanup.
The corrected test proves startup rejects, PID remains undefined, fixture close
fulfills and runtime is empty. Its 30-second whole-test bound remains finite.

## Verification

- Windows composed native suite **3/3**, zero failures: startup abort 0.012 s,
  40-worker capacity 7.14 s and isolated native exit/replacement 0.60 s.
- Linux composed native suite **3/3**, zero failures: startup abort 0.006 s,
  40-worker capacity 2.49 s and isolated exit/replacement 0.026 s.
- Final Windows startup-only check additionally passes **1/1** after moving
  shared path definitions before test registration. The test bodies and native
  adapter behavior are unchanged by that declaration ordering.
- Final changed-file lint/format, working and staged diff checks pass.

Evidence: `build/iteration-293-before.log`, `iteration-293-windows.log`,
`iteration-293-windows-final.log` and `iteration-293-linux.log`. The existing
restricted local Linux container/Debug worker and Windows Debug foundation
worker are reused. No RDP/DNS endpoint, physical device, external system or
new security research is involved.

The complete common suites from iteration 291 remain separately recorded as
Windows Node 633 / 90 skips, Linux 579 / 147 skips and CTest 15/15 / 16/16.
They precede these extra test cases; no complete rerun of the expanded suite
is claimed for this fixture-only correction. The changed composed native file
is checked directly on both platforms above.

No production source, Release setting, dependency pin, wire contract or
capability changes. Remaining bootstrap uncertainty, OS failures, simultaneous
parent/worker hard kill, connected resource/isolation and soak gates stay open.
