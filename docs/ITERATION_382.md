# Iteration 382 — reject overflowing host session timer budgets

2026-10-21. Implements a bounded-deadline admission detail of TODO Stage 1,
SPECIFICATION §3.1 and ARCHITECTURE §12. The three host SessionManager timer
options previously accepted any positive safe integer, even beyond Node's
maximum supported timer delay. A huge requested startup/graceful/termination
budget could therefore turn into a one-millisecond timeout.

`startupTimeoutMs`, `shutdownTimeoutMs` and `terminationTimeoutMs` now refuse
values above 2,147,483,647 through the existing fixed
`Invalid session manager options` error, before sweep-timer or worker creation.
Existing positive-safe-integer validation and default 10,000 / 2,000 / 2,000 ms
budgets remain. The exact supported maximum remains accepted. No public
session-create schema, protocol, worker/native source, Release setting,
dependency pin, external system or RDP/device/source access is changed/used.

An isolated failing-before control has three failures: each timer option
incorrectly accepts an overflowing value. The exact-maximum constructor and
an actual Node child timer control pass. That runtime control fires a delay
beyond the 31-bit maximum with `TimeoutOverflowWarning` under a finite
five-second process bound. The retained original log is
`build/iteration-382-timers-before.log` (2 passed / 3 failed / 5 total).

After correction, all five cases pass, including both maximum-plus-one and
maximum-safe-integer refusal for every field. Tests join manager shutdown even
if an assertion fails; they create no session/backend or native worker.
Combined new/manager focus passes 19/19 in 1.72 s, including existing forced
completion, reject/hang and capacity-ownership cases. Strict workspace build
passes. Evidence: `build/iteration-382-build.log`, `iteration-382-focus.log`.

Unchanged current foundation native CTest is also rerun through the project's
temporary ASCII alias: 17/17 pass in 6.71 s, no reconfiguration or rebuild.
The alias is removed afterwards. This checks existing native bytes; it is not
new native implementation evidence. Log: `build/iteration-382-native-ctest.log`.
Full Windows foundation `pnpm check` passes build/lint/format and 818 tests /
102 platform/profile skips / 920 total, zero failures, in 498.40 s. This includes
the new timer controls and existing native/resource/API/fake-backend lifecycle
checks on the unchanged receipt-bound worker/helper. Log:
`build/iteration-382-check.log`. Post-run native/source/protected-input audit,
local Markdown links, report formatting and `git diff --check` pass.

This closes only timer-range admission. Delayed event-loop callbacks, actual
forced-termination deadline expiry, legacy void backends, uncertain OS/kernel
retirement, simultaneous hard kill, connected resources and broader Stage 1/10
acceptance remain open. No hard OS-close guarantee follows from this validation.
