# Iteration 328 — phase-aware resource-capacity diagnostics

Requirement: TODO Stage 10 resource watchdog/abnormal cleanup evidence and the
unclassified timeout/resource spike retained in [iteration 327](ITERATION_327.md).
This changes only the test fixture/diagnostic path, not production resource
policy, helper/native code, SDK/dependencies, Release settings or query budgets.

The lifecycle-only capacity adapter now marks startup, active and retirement
ownership explicitly. The native failure observer retains separate fixed scalar
fields for these phases; beginning close cannot erase an earlier active failure.
Sampling waits fail immediately with the known native failure code rather than
waiting for sample counts that a failed worker cannot reach. Existing sample
counts, ready/heartbeat checks, 40-slot/five-replacement/PID/runtime assertions,
1,000 ms polling and every deadline are unchanged.

Diagnostics add fixed phase maps for failure categories and maximum query
duration, plus event-loop maximum/p99 delay from one finite observation owner.
No per-query history, PID/session labels, raw OS output, credentials or new
production telemetry is retained. A separate synthetic notification control on
an actual native lifecycle worker checks all three phase labels and confirms
that retirement does not overwrite the captured active category. Those injected
notifications are not real IPC failures or policy enforcement acceptance.

## Current evidence

The first Windows focus passes **2/2**, with 45 registry workers and 931 paired
queries, no failures, joined cleanup and empty admission. Event-loop max/p99 is
1,320 / 1,266 ms; maximum observed query is 3,216 ms (phase query timing was not
yet split). Original output: `build/iteration-328-capacity-focus.log`.

After adding phase query timing, the focused repeat also passes **2/2**, with
45 registry workers, 969 paired queries, five IPC_TIMEOUT events classified
entirely as **retiring**, zero startup/active failures, and joined PID/runtime/
query cleanup. Maximum query durations are startup 0 / active **3,108 ms** /
retiring **2,532 ms**; event-loop max/p99 is **1,638 / 1,289 ms**. Task/admission
snapshot after completion is active 0 / waiting 0 / expired 0. Cancellation
during close contributes to its task-failure counter. Evidence:
`build/iteration-328-capacity-phased.log`.

These observations classify this new run, not the earlier uninstrumented events
retroactively. They do not establish the original resource-unavailable spike's
root cause, a hard OS/close deadline, actual connected resource capacity or
latency/soak budgets. Active measured query duration also motivates checking
absolute result-deadline handling under event-loop delay; no such production
correction is claimed here.

The final Windows focus passes **2/2**, with 956 paired samples, no reported
failures, active maximum **3,270 ms**, retiring maximum **1,487 ms**, event-loop
max/p99 **1,703 / 1,357 ms** and empty admission after close. Monitors now begin
only after temporary runtime-root creation succeeds. Final output:
`build/iteration-328-capacity-final.log`.

Linux focus passes **2/2**: 45 registry workers, 200 CPU/200 direct RSS samples,
zero combined queries/failures, active maximum **36 ms**, event-loop max/p99
**55 / 30 ms** and joined PID/runtime/FD restoration. These foundation timings
are not comparable to Windows linked helper timings. Repository lint/format
passes on both hosts, including the final test file. Logs:
`build/iteration-328-{linux-focus,static}.log`.

Fresh CTest against unchanged binaries passes Windows **33/33** (24.91 s) and
Linux **17/17** (6.79 s); logs `build/iteration-328-{windows,linux}-ctest.log`.
Artifact/protected-input audits, local links and `git diff --check` pass. The
preceding full Node regression is the iteration-327 Windows repeat 785 / 51
skips and Linux 676 / 163 skips; it is not claimed as rerun for this test-only
diagnostic addition. Original capacity failure and broader deadline/OS/load
requirements remain open. The next step is an isolated late-result/event-loop
deadline control, before claiming a policy fix.
