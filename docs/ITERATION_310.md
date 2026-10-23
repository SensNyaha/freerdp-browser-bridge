# Iteration 310 — bounded and paired host resource queries

2026-10-19. Implements the configured unconnected worker-resource slice of
SPECIFICATION §2.12 / TODO Stage 10. This extends the actual framed registry
capacity fixture with CPU/RSS policies rather than substituting synthetic
worker counters. It does not connect RDP or perform remote actions.

## Retained controls and implementation

The initial Windows fixture launches separate CPU/RSS helpers for each worker
at ordinary 1,000 ms polls. It fails during startup: 28 factories, four
WORKER_TERMINATED observations, maximum observed CPU/RSS query durations
2,823/2,765 ms. Directory bootstrap competes with repeated resource launches.
Bounded admission alone does not fix this: four/eight active permits with a
two-second admission limit retain 17/21 resource-unavailable failures. These
controls are preserved; startup and watchdog deadlines are not increased.

A new Windows private `--process-resources PID` command reads working set and
cumulative CPU with one limited process handle and closes it before its bounded
schema-1 scalar receipt. Equal-interval CPU/RSS policies now use one timer and
one in-flight shared query with at most two participant signals. Cancellation
of either owner aborts the shared helper; close joins both owners. No completed
sample is cached. CPU rate calculation uses the shared query's actual monotonic
start/completion bracket, including admission. Separate public scalar reader
signatures, distinct-interval policies and Linux proc RSS remain compatible.

All helper-based CPU/Windows RSS reads share bounded FIFO admission per Node
execution context. The final bound is 16 active / 128 waiting / three-second
admission; permits remain held until actual helper close. Overflow, expiry and
cancellation remove queued work before launch. Delayed timer delivery cannot
start expired work. Helper execution still has its two-second timeout and
worker probes retain their original three-second overall deadline, including
admission. Standalone readers can additionally await admission before execution;
these are not hard OS/kernel retirement guarantees.

The first paired eight-permit control passes but a joint-timer repeat fails
one measurement. A four-permit/three-second admission diagnostic fails with 18
resource-unavailable observations: maximum admitted task duration 782 ms but
maximum end-to-end query 3,431 ms, exposing queue throughput as a bottleneck.
The final 16-permit profile passes two independent controls:

| Windows Debug control | First | Repeat |
| --- | --- | --- |
| Native workers created / maximum simultaneously owned | 45 / 40 | 45 / 40 |
| Successful CPU projections / RSS projections | 840 / 840 | 923 / 923 |
| Actual paired helper queries | 840 | 923 |
| Worker watchdog failures | 0 | 0 |
| Maximum observed end-to-end query, ms | 2,995 | 2,935 |
| Admission expiry / active / waiting after close | 0 / 0 / 0 | 0 / 0 / 0 |
| Capacity-case duration, seconds | 56.72 | 64.24 |

Paired queries halve launches relative to separate CPU/RSS projections for
these observed samples. Maximum query latency remains close to the existing
three-second bound; these controls do not establish timing headroom or sustained
budgets. Internal task-failure diagnostics include expected cancellation during
replacement/shutdown (20/16), distinct from worker-policy failures. Query counts
cover the complete fixture lifetime, including staggered startup, not a fixed
throughput interval or an end-to-end desktop performance benchmark.

A separate measured baseline uses the exact `feda202` index/CPU/RSS sources,
transpiled with the pinned local TypeScript and only module locations rebound
to the existing workspace. Existing helper commands and the same Debug native
worker are reused. It again fails at 28 factories/four startup terminations.
Over its 28.82 s observation, parent Node CPU is 5,953,000 microseconds, sampled
parent peak RSS 66,564,096 bytes and worker peak RSS 5,677,056 bytes; summed
observed worker-counter growth is 46,875 microseconds. These are retained
incomplete-startup measurements, not a completed 40-worker performance result.
Exact input hashes and preparation code remain in
`build/iteration-310-{baseline-hashes.log,prepare-baseline.cjs}`; diagnostics
contain scalar counts only. The matching final fixture reports the same CPU/RSS
fields. The monitor retains only peak RSS scalars at 250 ms intervals.
The final measured Windows case passes in 64.57 s: 45 workers created, 940
paired queries, zero worker failures, maximum query 2,906 ms and empty admission
after close. Parent CPU is 11,875,000 microseconds over 64.57 s; sampled parent
peak RSS 84,279,296 bytes, worker peak RSS 5,689,344 bytes and summed observed
worker CPU growth 296,875 microseconds. Different completed work/durations
prevent a direct CPU/RSS efficiency comparison with the failed baseline.
These values establish neither near-zero sustained idle CPU nor total-session
resource acceptance. They supplement the observed launch-count reduction and
configured lifecycle completion. Logs are
`iteration-310-windows-{baseline-metrics,final-metrics}.log`.

The registry has global limit 40/per-principal 20. Overflow refuses before the
factory; five workers retire and are replaced; both automatic and explicit
heartbeats continue. Every target PID must retire and runtime must be empty.
Linux additionally checks parent FD count returns to its warmed baseline.
The test-only lifecycle adapter factory seam preserves its ordinary behavior
and never sends CONFIGURE/SECRET/CONNECT or reports connected RDP.

## Verification

The final focused Windows group passes **12/12**: the repeated capacity case,
bounded admission/overflow/queued cancellation/absolute expiry, strict paired
receipt grammar, pre-acquisition refusal, actual memory-cap breach and synthetic
shared-query cancellation/late-result disposal on an actual worker. The latter
proves one flight remains owned until explicit retirement and cannot apply a
late excessive value after close. Actual CPU breach with RSS enabled also
passes using ordinary counters under the existing bounded heartbeat driver.
New native Windows Debug helper compilation and CTest pass **16/16** (6.17 s).

Full Windows `pnpm check` passes build/lint/format and **693 passed / 92
platform/profile skips / 785 total / zero failures**, Node duration 472.47 s.
Its additional capacity control passes in 55.87 s with 883 paired queries,
no worker failures, maximum query 2,882 ms and empty admission after close.
The ordinary three-case native registry fixture also passes, including startup
cancellation, 40-slot admission and crash isolation after factory extraction.
Full Linux `pnpm check` also passes build/lint/format and **638 passed / 150
platform/profile skips / 788 total / zero failures**, Node duration 133.49 s.
The final instrumented capacity test additionally passes standalone on Windows;
its diagnostic-only additions pass focused ESLint/Prettier. Local document links,
native clang-format and `git diff --check` pass. Final full logs are
`build/iteration-310-{windows,linux}.log`.

Linux GCC 13 Debug focused checks pass **24 / 2 Windows-only skips**, including
the ordinary three-case native registry fixture. Capacity passes in 6.35 s:
45 workers, 200 CPU/200 direct proc RSS queries, zero policy failures, maximum
query 27 ms and empty admission/runtime with FD count restored. Parent CPU is
1,111,872 microseconds, sampled parent peak RSS 59,707,392 bytes and worker peak
RSS 3,670,016 bytes. Observed worker counter growth is zero at this short idle
interval and kernel tick granularity; it does not prove zero CPU consumption.
Existing native CTest passes **17/17**. These Linux values are not comparable
to Windows timings or a connected performance gate.

Release configuration, existing bundled worker/helper artifacts and dependency
versions remain unchanged. Bundled worker SHA-256:
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.
Only the Debug Windows helper is rebuilt to expose the additive command.
Old Release helpers continue to refuse enabled unsupported policies as
unavailable. No RDP/media wire or public session-create field is changed.

Ignored logs: `build/iteration-310-windows-{control,diagnostic,after,eight,combined,joint,bounded-combined,sixteen,sixteen-repeat}.log`,
`iteration-310-linux-before.log`, `iteration-310-combined-focused.log`,
`iteration-310-windows-native.log`, and explicit transfer/run scripts. Failed
controls remain evidence and are not overwritten with passing results.

Connected RDP resource-policy concurrency/faults, production helper adoption,
primary-carrier capacities beyond 32, total-session/startup CPU/memory, broader
platform/CI and sustained/soak performance gates remain open.

Changed files: Windows `native/runtime/private_directory_main.cpp`;
`packages/node-bridge/src/{index,process-cpu,process-resident,process-query-gate,process-resources}.ts`;
`tests/fixtures/native-lifecycle-worker.mjs`;
`tests/integration/{cpu-watchdog,process-resources,resource-session-capacity}.test.mjs`;
`tests/unit/{process-query-gate,process-resources}.test.mjs`;
`docs/{PROCESS_CPU,PROCESS_RESIDENT,WORKER_CPU_POLICY,WORKER_MEMORY_POLICY,ITERATION_310}.md`
and `TODO.md`.
