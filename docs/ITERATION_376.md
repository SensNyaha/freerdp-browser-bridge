# Iteration 376 — yield between bounded query-helper invocations

2026-10-20. Implements a measured scheduling correction for TODO Stage 10
resource/load work after [375](ITERATION_375.md). The preceding full control
reports twelve active resource-deadline failures, 149 ms synchronous task
invocation, 2,518 ms admitted-task maximum and 1,535 ms event-loop delay.
The separate child-free control shows all sixteen invocations precede the
first immediate observer. This identifies a reproducible cohort-scheduling
problem, without establishing every OS/helper delay's cause.

Permit owners now sequence only synchronous invocation across immediate
turns. An owner releases the invocation chain when its task returns a promise
or throws, while keeping its ordinary admission permit through awaited helper
close. Sixteen tasks can still be incomplete concurrently. At most sixteen
owners can await the chain under the unchanged shared 16/128 caps; it retains
no completed task/result history. There is no extra process, sample cache,
recurring idle timer or changed polling interval. An absolute admission check
immediately before invocation includes staging, preventing expired/cancelled
owners from launching; cancellation, failure and success all release the chain.
The existing two-second helper and three-second policy bounds are unchanged.
Public errors/protocols, native/Release outputs and dependency pins are unchanged.
No RDP or device is contacted.

Two new controls fail against the previous built module: the sixteen launches
all precede their observers, and an already-admitted late invocation still
starts. Cancellation/following-work control passes. After the correction,
observer counts are exactly 0..15 before the corresponding launches; mocked
monotonic time proves expired staging never invokes a task, and a held-task
barrier proves sixteen incomplete tasks remain concurrent. A first combined
run catches five existing fixture assumptions that a single microtask means
the task has started; failed fixtures also produce late asynchronous errors.
Those fixtures now await an explicit task-start handshake, preserving their
assertions, caps and deadlines. The complete gate/turn set passes 14/14.
Logs: `build/iteration-376-turn-before.log`, `iteration-376-build.log`,
`iteration-376-turn-after-first.log` and `iteration-376-turn-after.log`.

The same actual Windows Debug capacity fixture passes both cases in 32.17 s:
45 workers / maximum 40, five replacements, 313 paired CPU/RSS queries,
no reported startup/active/retirement failures and joined empty PID/runtime /
query ownership. Maxima: invocation 100 ms, admission/staging 2,661 ms,
complete task 623 ms, active query 2,949 ms and event-loop delay 356 ms.
Admission expiry is zero; four task failures include retirement cancellation.
Log: `build/iteration-376-capacity-profile.log`. These runs stop after their
sample-count assertions, so different query totals/durations cannot establish
a throughput ratio. The remaining 51 ms margin does not accept robust load
headroom or erase the retained earlier failures.

The focused real-reader/cancellation/absolute-deadline and gate/parser checks
also pass 33/33 in 23.46 s (`build/iteration-376-resource-focus.log`). Actual
Linux/connected resource behavior, total budgets, hard OS failures and sustained
capacity/retirement acceptance remain open.

The unchanged linked Debug native executables additionally pass CTest 33/33
in 42.12 s (`build/iteration-376-ctest.log`). The temporary original build
alias is removed in `finally`; no new native compilation or Release rebuild
is performed for this Node scheduling correction.

The complete Windows `pnpm check` passes build/lint/format and 825 tests,
with 51 profile/platform skips and one failure / 877 total in 626.10 s.
The unchanged capacity case now fills all forty slots and passes overflow
refusal, but fails while waiting for resource samples before replacement.
Two active owners report `WORKER_RESOURCE_UNAVAILABLE`; the snapshot records
3,057 ms query maximum, 2,679 ms admission/staging, 101 ms invocation,
626 ms complete task and 372 ms event-loop delay. Query expiry is still
enforced. Reducing the invocation cohort does not establish enough query
throughput/headroom for this case. The native/helper launch volume needs
further work; no passing full suite or complete capacity fix is claimed.
Original evidence: `%TEMP%/freerdp-bridge-iteration376-debug-check.log`.
The prior passing control remains scoped evidence, not a replacement for this
failed full run. No deadline, cap or capacity assertion is relaxed.

Post-run audit matches all 351 native source inputs, both Debug artifacts and
seven protected files. No worker/query-helper process remains and the build
alias is absent. Explicit Markdown formatting and `git diff --check` pass.
The original Release worker remains
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`;
Release configuration and dependency versions are unchanged.
