# Iteration 379 — actual query-child fault and cancellation controls

2026-10-21. Continues TODO Stage 10 shared-child lifetime/fault checks from
[378](ITERATION_378.md). Adds integration tests only; production Node/native
code, capability/wire layout, bounds, Release artifacts and dependency pins
are unchanged. No RDP connection, device or host source is used. This is
controlled process-fault testing, not a new security investigation.

Tests copy the existing native `fixture-worker-1.exe` into a fresh ignored
build directory under the helper's filename. It blocks waiting for IPC input
on the inherited pipe, simulating a hung helper rather than a Windows query
API failure. The ordinary owner uses real `execFile`, minimal environment,
shared admission, child handles, execution timeout and joined close. Synthetic
executor-only tests from 378 remain separate. Pending work is aborted and
joined in `finally` before private fixture-directory removal.

Two members dispatch to one hanging child. Cancelling one keeps both permits
held and publishes neither result. A request using the unchanged real helper
at another path succeeds while that group is pending. The original two-second
timeout then returns fixed `PROCESS_SAMPLE_CANCELLED` for the cancelled member
and `PROCESS_SAMPLE_UNAVAILABLE` for its sibling. All owners retire.

Four fresh hanging groups cancel both dispatched members. All eight receive
fixed cancellation errors and join their actual child/streams. Each subsequent
group reuses clean admission; a healthy real-helper sample succeeds afterwards.
Maximum observed cancellation-to-joined-completion is three milliseconds in
the repeated focus. Each must finish below 1,500 ms, distinguishing cancellation
from waiting for the 2,000 ms execution timeout. This finite fixture criterion
does not add a production deadline or claim a hard kernel close bound.

A missing executable control fails two shared members with fixed unavailable
errors while another real-helper path succeeds. Errors expose only the fixed
code/message, without raw filesystem/native/cancellation reasons or causes.
Every case ends with zero collecting/running groups, logical items and
active/waiting query permits. No PID/path/output history is retained.

Initial focus passes 3/3 in 3.19 s. After adding assertion-failure cleanup and
the cancellation-versus-timeout criterion, focus passes 3/3 in 3.04 s: partial
cancel/shared timeout 2.20 s; four all-cancel groups plus fresh query 0.49 s;
missing executable/independent healthy query 0.17 s. Evidence:
`build/iteration-379-fault.log`, `iteration-379-fault-repeat.log`.

The unchanged source-only Debug output remains
`build/native-clean-4ZhORq/receipt.json`. Fixture executable SHA-256 is
`7eaf660277cc95e23479983f4d1611ea621085df5a6798ea75c07cda2ebad108`.
Source/artifact audit matches all 353 native inputs, both worker/helper
artifacts and seven protected files. CTest 34/34 from 378 remains evidence
for these unchanged bytes; no native rebuild is needed for test-only additions.
Full Windows `pnpm check` passes build/lint/format and 857 tests / 51 skips /
908 total, zero failures, in 543.72 s on that same Debug output. The new
fault controls pass in the full run too; maximum cancellation completion is
four milliseconds. The original forty-worker capacity case again has zero
worker failures, zero admission expiries and joined empty owners, with maximum
active query 491 ms. Log: `build/iteration-379-check.log`. Post-run native/source /
protected-input audit and `git diff --check` pass; report/contract Markdown
formatting and local links are checked separately.

This accepts the named controlled timeout, shared cancellation and missing
executable slice. Malformed receipts retain synthetic/codec coverage. Actual
OS API/handle failures, hostile/malformed helper processes, connected resource
limits, prolonged load and production Release adoption remain open. Stage 10
stays in progress; no new capability is advertised.
