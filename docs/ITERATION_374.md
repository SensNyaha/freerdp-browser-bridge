# Iteration 374 — bounded native pipeline evidence for audio previews

2026-10-20. Stage 6 still requires measured scheduling/CPU behavior, and
`PERFORMANCE.md` requires instrumentation before optimization. The waiting
source in [373](ITERATION_373.md) cannot evaluate the deadline correction.
The listening preview now collects one already-supported native pipeline
snapshot after its fresh Worklet observation and before joined cleanup.
This local block opens no RDP session, starts no remote source and changes no
audio/video policy, native code, public protocol, Release output or dependency pin.

The schema-1 `lab.browser.native-pipeline` record projects exactly eight
nonnegative safe-integer fields: RDP checks, changed paints, encoded frames,
encode mean/p95/max microseconds and read-batch count/time maxima. Invalid
scalar/relationship values and unavailable/unsupported/closed queries produce
`stats:null`, distinct from a valid all-zero reading. Additional object fields
and error text are not retained. There is one awaited call, no retry, polling,
detached timeout, additional queue or new request deadline; the existing native
request owner handles capability admission and timeout/retirement.

Native encode p95 uses the existing fixed latest-128-frame window; mean/max
and other counters/maxima cover the worker lifetime. The record excludes
audio codec work, event waiting, IPC/Node/browser time and end-to-end latency.
It does not provide per-pause correlation or establish a root cause merely
because a maximum is large. No active-source, quality or performance pass is
claimed by this instrumentation-only block.

Four new unit cases cover exact projection/snapshot ownership, absent versus
zero evidence, synchronous/asynchronous private-error suppression, missing /
unsafe / inconsistent values and one-call joined promise settlement. The
focused collector/protocol/audio-diagnostic/receipt set passes 16/16.
The existing actual-worker diagnostic lifecycle test also exercises this
collector against the linked Debug worker (empty counters) and the foundation
worker (unsupported/null); both focused runs pass and preserve heartbeat and
joined empty-runtime cleanup. They make no RDP connection.

The unchanged linked Debug artifacts additionally pass native CTest 33/33
in 29.71 s. Its original temporary build alias is removed in `finally`.
Ignored logs: `build/iteration-374-focused.log`,
`iteration-374-native-query.log`, `iteration-374-foundation-query.log` and
`iteration-374-ctest.log`.

The first full Windows `pnpm check` passes build/lint/format, then records
818 passed / 51 skips / one failure / 870 total in 531.86 s. The unchanged
40-worker resource-policy capacity case expects global overflow refusal but
admits a replacement because four active workers have already failed with
`WORKER_RESOURCE_UNAVAILABLE`. Its diagnostics report active query maximum
3,267 ms, maximum task 2,351 ms and event-loop delay maximum 1,494 ms. The
three-second query bound remains enforced; freed capacity is not evidence of
a global-limit bypass. The collector tests pass. This repeats a retained
resource/load limitation documented in [327](ITERATION_327.md), rather than
accepting the whole resource matrix. No resource deadline, policy, assertion
or polling interval is relaxed. The original log is
`%TEMP%/freerdp-bridge-iteration374-debug-check.log`.

An unchanged focused capacity repeat also fails at that overflow assertion:
one case passes and one fails. Six active workers report resource-unavailable,
maximum query duration is 3,285 ms, event-loop delay maximum 1,516 ms and
maximum admitted task duration 2,491 ms. Its original diagnostics are retained
in `build/iteration-374-capacity-control.log`. Neither a passing full suite
nor a correction of that existing load limitation is claimed. Repeated blind
full runs are not substituted for investigation. The capacity test and resource
implementation remain unchanged in this collector block.

The final native/source/protected-artifact audit still passes 351 source
inputs, two Debug artifacts and seven protected files. Helper syntax,
documentation formatting, 554 local Markdown links and `git diff --check`
pass. Original Release artifacts and dependency pins remain unchanged.
