# Iteration 383 — monotonic backend startup deadline

2026-10-21. Continues TODO Stage 1 / SPECIFICATION §3.1 bounded startup after
[382](ITERATION_382.md). A delayed timer callback could previously lose its
Promise race to a backend that completed or emitted `connected` after the
startup budget. Expired microtask staging could also invoke backend `start()`
before the delayed timeout callback ran.

Each starting entry now keeps one private monotonic expiry scalar. The original
budget is checked immediately before backend invocation, before accepting
worker state callbacks while startup is pending, and after startup completion.
Equality expires. Late success fails with existing `WORKER_START_TIMEOUT`,
aborts the owned startup and follows normal joined cleanup. The deadline is
deleted when startup settles; later connection progress does not inherit it.
Closing/terminal entries retain their existing outcome. Public options,
protocol/error codes, secret handling, default budgets, native source, Release
configuration/artifacts and dependency pins remain unchanged. No external
system or RDP/device/source access is used.

The first ignored control reproduces late event and completion acceptance:
one healthy control passes and two overdue cases fail. Expanded controls have
four failures / three passes: late connected state, late completion without a
state event, expired invocation staging, and exact monotonic boundary all
reproduce. Original logs remain `build/iteration-383-startup-before.log` and
`iteration-383-expanded-before.log`. Bounded 40 ms Atomics waits simulate a
blocked Node event loop without busy spinning; boundary/later-progress cases
use a test-only monotonic clock. They create no RDP connection or native child.

All seven corrected controls pass. Healthy startup, later connection progress
after the retired startup phase, and explicit close during a stalled start
retain their outcomes. No late `connected` event is published; failed cases
abort, close their fake backend and return capacity. New/existing manager and
timer-admission focus passes 26/26 in 2.51 s with strict workspace build.
Evidence: `build/iteration-383-build.log`, `iteration-383-focus.log`.

Two separate composed controls pass 2/2 in 6.05 s on the current real Windows
foundation worker. Expired staging never calls the native lifecycle adapter's
start method and creates no PID/runtime. A normal actual framed worker starts,
survives beyond its old five-second startup budget with automatic/manual
heartbeats, accepts a synthetic repeat of registry progress, and closes with
joined PID/runtime/slot cleanup. The repeat is a lifecycle-only fixture event,
not actual RDP activation. Evidence: `build/iteration-383-native-focus.log`.

Unchanged native CTest is rerun through the temporary ASCII alias and passes
17/17 in 7.92 s, no reconfiguration/rebuild; the alias retires afterwards.
Evidence: `build/iteration-383-native-ctest.log`.
The first `pnpm check` stops at lint because the new integration file has an
unused `join` import. That import is removed; runtime code/assertions are
unchanged and the original log remains `build/iteration-383-check.log`.
The corrected full Windows foundation `pnpm check` passes build/lint/format and
827 tests / 102 profile/platform skips / 929 total, zero failures, in 513.44 s
on receipt-bound `native-clean-u8LktC`. All new startup cases, actual native
lifecycle controls and existing resource/capacity/API cases pass. Log:
`build/iteration-383-check-repeat.log`. Post-run native/source/protected-input
audit, local Markdown links, report formatting and `git diff --check` pass.

This accepts only observed startup expiry, pre-invocation refusal and named
state/completion/lifecycle controls. It cannot preempt blocked JavaScript or
guarantee kernel termination. Graceful/forced-close absolute deadlines, legacy
void completion, simultaneous hard kill, actual RDP and broader OS/resource /
platform gates remain open. Release settings and dependency versions stay fixed.
