# Optional Windows host worker CPU policy

Trusted Windows hosts may set `WorkerOptions.maxCpuPercent` to an integer
1..65,535. A value of 100 means one logical CPU; concurrent native threads
can exceed 100. It is not normalized by the machine's core count. Omission
disables CPU queries completely. `cpuPollIntervalMs` accepts integers
100..60,000 ms, default 1,000; `cpuWindowMs` accepts 1,000..60,000 ms, default
1,000. Both require the limit. Invalid options fail before startup. Other
platforms reject an enabled policy with `RESOURCE_WATCHDOG_UNSUPPORTED`.

This uses the colocated [Windows CPU helper/typed reader](PROCESS_CPU.md).
Current verified use is the MSVC Debug foundation; existing bundled Release
helpers lack the new CPU command and are unchanged. Enabling this policy with
an older/missing helper fails as unavailable rather than silently disabling
enforcement. Linux process CPU queries remain unimplemented.

Sampling begins after HELLO readiness. One query may be pending per worker;
timer ticks during that query are discarded. The result belongs to the same
ready child object, not an arbitrary supplied PID. The first valid cumulative
counter establishes a baseline; it does not charge startup or the initial
unsampled interval. CPU and RSS policies have separate one-flight query owners
and may be enabled together.

Each query is bracketed by `process.hrtime.bigint()` before invocation and after
joined helper retirement. A rate window requires at least `cpuWindowMs`
between the baseline query's completion and the next query's start. Short polls
retain the baseline; they neither reset nor prematurely evaluate the window.
Any counter regression, malformed scalar, overlapping/backward clock bracket
or unavailable query fails with `WORKER_RESOURCE_UNAVAILABLE`.

For enforcement the elapsed denominator spans baseline start through current
completion, including both query brackets. This conservatively handles unknown
read instants: helper latency cannot inflate the observed rate. Integer BigInt
comparison uses `deltaMicros * 100000 > maxCpuPercent * elapsedNs`; equality
is permitted. A completed window replaces its baseline with the current sample.
Storage is fixed to baseline/previous scalar samples; no history queue is added.
Counters are integer microseconds, with the native counter's measurement
granularity; this is sampled enforcement, not exact continuous CPU accounting.

An observed excessive window fails the owned worker with `WORKER_CPU_LIMIT`.
The existing supervisor kills it and rejects pending operations. The native
session adapter preserves this fixed code; the existing public failure envelope
uses HTTP 503, message `Session worker CPU policy exceeded`, retryable false.
No public session-create field or native/media wire layout changes. Resource
measurement failure remains 503/retryable true with the existing fixed message.

Failure/close stops polling, discards the window and aborts the pending CPU
query. Its retirement is joined alongside RSS/native/runtime cleanup. A late
counter cannot fail or revive a closing worker. A three-second query deadline
fails the worker and requests cancellation; unknown query failures or explicit
`PROCESS_SAMPLE_CLOSE_FAILED` retain `WORKER_RESOURCE_CLOSE_FAILED` even after
native/runtime cleanup. The underlying OS operation must still retire; this
does not establish a hard kernel/OS close deadline.

Portable exact-boundary/clock/latency tests cover the rate calculation and
option refusals. Actual unconnected Windows C++ workers verify healthy CPU/RSS
queries and heartbeat. Synthetic counters separately verify cap breach,
sibling survival, counter/query faults, deadline and late/uncertain retirement.
These synthetic breaches do not establish actual overload behavior or connected
RDP CPU budgets. Linux CPU, real overload, startup/Node/total-session CPU,
connected policies, production helper packaging and sustained/platform/soak
acceptance remain open. [Verification](ITERATION_306.md).
