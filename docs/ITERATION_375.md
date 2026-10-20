# Iteration 375 — separate host query admission and synchronous invocation

2026-10-20. Continues TODO Stage 10 resource/load work and the instrumentation
requirement in `PERFORMANCE.md`. The repeated capacity failures in
[374](ITERATION_374.md) combine queue delay, helper launch and asynchronous
completion in existing task/query maxima. The internal query-owner snapshot
now adds `maxAdmissionMs` and `maxInvokeMs` to the existing `maxTaskMs`.
Only two lifetime scalar maxima are retained, with upward millisecond rounding.
No PID, task/result/error object, arguments, raw output or sample history is
retained. Public protocols, policy intervals/deadlines, concurrency/queue caps,
native/Release outputs and dependency pins are unchanged. No RDP is contacted.

Admission covers entry through acquire settlement, including refused/cancelled
admission and continuation delay. Invocation measures the synchronous task call
until promise return or synchronous exception, including helper launch/setup.
The full task timer still awaits completion and the readers' joined helper
close. Pending completion cannot masquerade as a completed task; task results,
failure identity, cancellation and permit retirement retain existing behavior.
Independent maxima cannot be added/subtracted into one query's timeline or
identify an OS/driver cause.

Three added regression cases fail against the preceding built module, then
all ten gate cases pass after the TypeScript build. They verify separated
invocation/pending/queued phases, expired admission without invocation,
synchronous failure timing, private-data absence and result/error identity.
The former four-/sixteen-way bounds, overflow, cancellation and absolute
expired-waiter controls also pass. Logs:
`build/iteration-375-gate-before.log`, `iteration-375-build.log` and
`iteration-375-gate-after.log`.

The same actual native capacity fixture, with unchanged assertions and timing,
then passes 2/2 cases in 69.19 s. It starts 45 workers with maximum 40 owned,
samples CPU/RSS 969 times each through 969 combined queries, replaces five
owners and joins empty PID/runtime/query cleanup. Maximum admission is
1,625 ms, invocation 107 ms, complete task 2,226 ms, active query 2,897 ms
and event-loop delay 1,549 ms. Admission expiry is zero. Three `IPC_TIMEOUT`
events are classified as retirement; there are no recorded active/startup
failures in this run. Eighteen task failures include normal retirement
cancellation. Original evidence: `build/iteration-375-capacity-profile.log`.
This passing control does not erase the preceding failures, establish a
performance correction or accept retirement/connected/OS/resource/soak gates.

A separate child-free Node control schedules an immediate observer before a
sixteen-task burst. All sixteen task invocations occur before that observer;
active/waiting ownership returns to zero after completion. This confirms
microtask-cohort invocation in the current gate without changing scheduling.
It neither measures OS launch cost nor proves the cause of a particular
deadline failure. Source and result are retained as
`build/iteration-375-launch-turn-control.mjs` / `.log`. Combined with the
measured synchronous prefix, it motivates a separately tested scheduling
comparison before any launch-policy correction.

The focused real-reader/cancellation/absolute-deadline and portable gate /
parser selection passes 29/29. Native CTest passes 33/33 in 43.07 s on the
unchanged linked Debug artifacts, with the original build alias removed in
`finally`. Logs: `build/iteration-375-resource-focus.log` and
`iteration-375-ctest.log`.

Full Windows `pnpm check` passes build/lint/format and ends with 821 passed /
51 skips / one failure / 873 total in 661.39 s. The unchanged capacity test
again loses active owners before its global-limit assertion: twelve
`WORKER_RESOURCE_UNAVAILABLE` events, maximum active query 3,401 ms,
admission/continuation 1,466 ms, invocation 149 ms, complete task 2,518 ms and
event-loop delay 1,535 ms. All other tests, including the new timing cases,
pass. The earlier passing focused control does not establish load stability.
The full retained log is `%TEMP%/freerdp-bridge-iteration375-debug-check.log`.
No repeated unchanged full run is used to claim a correction. A separately
tested launch-scheduling comparison is the next step; the present change
collects evidence only. Resource/load and retirement acceptance remain open.

Post-run audit still matches 351 native source inputs, two Debug artifacts
and seven protected inputs; no worker/query-helper process remains and the
temporary build alias is absent. `git diff --check` passes. The repository's
ordinary Prettier configuration excludes Markdown, so those ordinary commands
do not validate the reports' formatting. An explicit empty ignore file now
selects the Markdown parser (`ignored:false`) and checks reports 373, 374 and
375 successfully. Earlier formatting invocations must be read with that
exclusion in mind; the explicit current check supplies the report evidence.
