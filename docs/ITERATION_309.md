# Iteration 309 — actual native CPU-limit enforcement under heartbeat load

2026-10-19. Verifies the unconnected native overload slice of SPECIFICATION
§2.12 / TODO Stage 10 after the Windows/Linux query/policy implementation.
The ordinary C++ lifecycle worker receives valid heartbeat requests with an
explicit 1% host CPU cap, 100 ms query polling and a 1,000 ms minimum window.
No RDP connection, fake protocol peer, injected CPU counter or remote action
is used. Production code, Release artifacts/settings and dependency pins do
not change in this test block.

The test observes values returned by the default platform query; it does not
replace them. A valid baseline is awaited before loading. Each batch has at
most 16 pending pings and joins before the next batch, below the existing
32-request/64-control-record bounds. Load stops on failure or an eight-second
observation deadline. All issued requests, query retirement and native close
are joined. A separate ordinary sibling worker must continue heartbeat.

| Standalone observed control | Windows MSVC Debug | Linux GCC 13 Debug |
| --- | --- | --- |
| Completed CPU samples | 7 | 12 |
| Actual cumulative counter growth, microseconds | 796,875 | 550,000 |
| Completed heartbeat requests | 40,560 | 56,848 |
| Failure | WORKER_CPU_LIMIT | WORKER_CPU_LIMIT |
| Target PID retired / runtime empty | pass / pass | pass / pass |
| Sibling heartbeat preserved | pass | pass |

Both standalone controls pass, Windows in 1.90 seconds and Linux in 1.24
seconds. Counts include their own observed intervals; they are not a throughput,
production CPU-budget or comparative benchmark. Windows also has an earlier
passing control before scalar diagnostics were added. The 1% fixture cap is
chosen to observe enforcement, not recommended as a desktop production policy.

Combined CPU focus passes **17/17** on each platform, Windows in 13.65 seconds
and Linux in 9.54 seconds. Existing native CTest passes **16/16** Windows in
7.25 seconds and **17/17** Linux in 6.50 seconds without a C++ rebuild.
Full Linux `pnpm check` passes build/lint/format and **627 passed / 148
platform/profile skips / 775 total / zero failures**, Node duration 121.56
seconds. Full Windows `pnpm check` also passes build/lint/format and **680
passed / 92 platform/profile skips / 772 total / zero failures**, Node duration
419.22 seconds. Local documentation links and `git diff --check` pass.

Ignored evidence: `build/iteration-309-windows-control.log`,
`iteration-309-windows-control-final.log`, `iteration-309-linux-control.log`,
`iteration-309-{windows-focused,windows-ctest,windows,linux}.log` and the explicit
transfer/control/full-run scripts. No source is copied into a broader platform
or sanitizer matrix implicitly. Prior synthetic counter/fault/lifetime tests
remain distinct and continue to run.

This accepts the named actual heartbeat-load breach and sibling/cleanup case.
Connected RDP/application/media overload, configured concurrency with resource
policies, startup/Node/total-session CPU, production helper adoption, hard OS
retirement, broader platform/CI and sustained/soak budgets remain open.
