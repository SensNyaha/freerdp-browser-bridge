# Optional host worker RSS policy

Trusted hosts may set `WorkerOptions.maxResidentBytes` to a positive safe integer
on Linux or Windows. Omission disables sampling entirely. The optional
`residentPollIntervalMs` requires that cap and admits integers 100..60,000 ms,
default 1,000 ms. Invalid options fail before startup; unsupported platforms
reject an enabled policy with `RESOURCE_WATCHDOG_UNSUPPORTED`.

Sampling starts after native HELLO readiness and covers that owned child,
including its later RDP connection. It does not run during native startup.
Each timer tick starts at most one query; ticks during a pending query are
discarded. A result is actionable only while the same child remains ready.
The shared [resident sampler](PROCESS_RESIDENT.md) uses a fixed-size proc read
or the colocated Windows query helper, without session configuration or secrets.

A positive byte count greater than the cap fails the worker with
`WORKER_MEMORY_LIMIT`. An invalid/unavailable result or a three-second query
deadline fails it with `WORKER_RESOURCE_UNAVAILABLE`. Existing supervisor
failure kills the native child and rejects pending operations. The native
session adapter preserves only these two known resource failures; session
errors use fixed public messages, HTTP 503 and retryable false/true respectively.
No public create field, browser policy control or wire layout is added.

Failure/close stops new polling and aborts a pending query. Cleanup joins its
retirement before publishing successful close. Late results cannot fail a
closing worker or start another query. Uncertain query retirement is retained
as `WORKER_RESOURCE_CLOSE_FAILED`; native process/runtime retirement still runs.
Unknown sampler exceptions are conservatively treated as uncertain retirement.

This is periodic RSS/working-set enforcement, not an allocation ceiling.
Between-sample peaks, startup memory, private allocations, Node/session-total
memory and CPU remain outside this policy. A blocked kernel operation still
has to retire; the deadline triggers worker failure but does not prove a
hard bound on OS I/O/close. Full OS-failure, connected resource and soak gates
remain open. Hosts choose budgets; existing Release defaults are unchanged.

Actual unconnected workers verify the one-byte breach and healthy 1 GiB cap
on Windows/Linux. Synthetic probes separately test faults, deadlines and
retirement. [Verification and exact scope](ITERATION_296.md).
