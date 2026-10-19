# Iteration 311 — native crash with pending resource-query retirement

2026-10-19. Verifies SPECIFICATION §2.12 / §3.1 and TODO Stage 10's abnormal
worker-exit ownership slice after [paired queries](ITERATION_310.md).
Only the integration test and documentation change; production code, Release
configuration/artifacts and dependency pins are unchanged. No RDP connection
or remote application action occurs.

The test composes three actual framed C++ workers through the explicit
lifecycle-only registry adapter, with CPU/RSS policies enabled and 500 ms polls.
It first observes ordinary OS CPU/RSS queries from each child. Then it holds
one completed platform read behind an explicit synthetic promise-retirement
barrier and forcibly exits that same native PID. On Windows the barrier holds
the shared CPU/RSS query completion; on Linux it holds the separate CPU query
completion while RSS remains independently owned. The actual query helper has
already closed before this artificial barrier; no blocked OS/kernel operation
or real helper-close failure is claimed.

Required observations all pass in the focused Windows/Linux controls:

- The dead child produces the fixed registry WORKER_FAILED failure.
- Its pending query signal is aborted, but its slot and private runtime remain
  owned while query completion is held. Another create refuses before factory
  invocation, even though the native PID is already dead.
- Both siblings preserve heartbeat, readiness and advancing actual CPU/RSS
  sample counts.
- Releasing the barrier joins retirement, removes that runtime and releases
  exactly one slot. A fourth native worker replaces it, completes CPU/RSS
  samples and preserves the configured three-worker limit.
- Joined shutdown retires all four PIDs, empties runtime and leaves zero active
  or queued shared helper tasks. Late completion does not revive the dead worker.

The fixture retains only one held promise and fixed counters/PIDs for four
workers. It never sends CONFIGURE/SECRET/CONNECT or reports connected RDP.
Its 100 ms held-retirement observation stays inside the registry's existing
graceful/forced deadlines; it does not test their expiry or override them.

Windows focused checks pass **6/6** in 13.62 s, including existing startup
cancellation, 40-worker capacity, ordinary crash isolation and paired-query
close/memory-cap cases. The new case passes in 2.44 s. Linux focused checks pass
**4 / 2 Windows-only skips** in 5.05 s; its new case passes in 1.67 s.
Existing native CTest passes **16/16** Windows (6.55 s) and **17/17** Linux
(6.52 s) without a native rebuild. The first full checks stop at Prettier on
the new test before the general test phase; formatting is corrected and those
logs are retained.
The corrected Linux repeat passes its focused group again (4 / 2 skips,
4.73 s), and full `pnpm check` passes build/lint/format and **639 passed / 150
platform/profile skips / 789 total / zero failures**, Node duration 130.61 s.
The new case passes in 1.69 s inside that full run. Corrected full Windows
`pnpm check` passes build/lint/format and **694 passed / 92 platform/profile
skips / 786 total / zero failures**, Node duration 490.70 s. Its new case
passes in 2.61 s and the existing 40-worker CPU/RSS fixture also passes.
Local documentation links, final focused formatting and `git diff --check`
pass. No implementation defect is exposed by these controls.

Ignored evidence: `build/iteration-311-{windows-focused,windows-ctest,windows,windows-repeat,linux,linux-repeat}.log`
and explicit transfer/run scripts. Changed files are
`tests/integration/resource-session-crash.test.mjs`, this report, the CPU/RSS
policy references and `TODO.md`.

This accepts the named native-exit/synthetic-query-retirement composition.
Connected RDP release/resource behavior, actual OS-stalled query retirement,
forced deadline expiry, simultaneous parent/worker hard kill, startup/total
session budgets, broader platform/CI and sustained/soak gates remain open.
