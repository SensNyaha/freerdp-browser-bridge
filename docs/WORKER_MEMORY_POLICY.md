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

The separate opt-in [CPU policy](WORKER_CPU_POLICY.md) can run alongside
RSS sampling. It has its own bounded query/window and does not turn RSS into
total-session memory or continuous CPU accounting.
Windows policies with equal polling intervals share one in-flight combined
helper query and one polling timer. Either policy's cancellation aborts that
shared query; close joins both owners. Different intervals retain separate
logical queries. Capability-gated new Windows workers may also share physical
helper launches across workers, with individual cancellation and joined
retirement as specified by the [batch owner](PROCESS_RESOURCE_BATCH.md).
Shared helper admission and the unchanged overall query deadline are
documented in the [CPU policy](WORKER_CPU_POLICY.md). The named unconnected
40-worker fixture is recorded in [iteration 310](history/iterations/301-350.md#iteration-310).

Actual unconnected workers verify the one-byte breach and healthy 1 GiB cap
on Windows/Linux. Synthetic probes separately test faults, deadlines and
retirement. [Verification and exact scope](history/iterations/251-300.md#iteration-296).

The opt-in `test-xrdp-lab.mjs memory` helper additionally observes actual RSS
through the same policy on a connected Windows 1080p lab worker, with heartbeat,
JPEG capture and empty-runtime close. It retains only count/peak scalars, no
sample history. [Short connected smoke](history/iterations/251-300.md#iteration-298) is separate from
cap-breach fault injection, Linux connected acceptance or total-session/soak budgets.

The [resource-policy crash control](history/iterations/301-350.md#iteration-311) composes actual native
exit with one synthetic query-retirement barrier. Registry slots/runtime remain
owned until completion, while siblings continue CPU/RSS sampling and heartbeat.
It adds unconnected lifecycle evidence; actual OS-stalled retirement and
connected resource faults remain open.

The newer [paired CPU/RSS Windows RDP smoke](history/iterations/301-350.md#iteration-314) additionally
uses explicit source-receipt-selected Release and matched Debug workers with
the unchanged 256 MiB sampled RSS policy. Eight connected samples per resource,
1080p JPEG, heartbeat and joined PID/runtime retirement pass. Reported peaks
exclude between-sample/Node/session-total acceptance and are not cap-breach or
sustained-resource evidence. [Test contract](RDP_RESOURCE_SMOKE.md).

The [explicit connected RSS-limit control](history/iterations/301-350.md#iteration-316) additionally
requires actual connection, heartbeat and 1080p JPEG before any sample. The first
ordinary connected RSS sample exceeds a one-byte fixture cap and produces exact
WORKER_MEMORY_LIMIT, followed by joined PID/runtime retirement. No memory load
or remote application action is used. Public registry/sibling isolation,
production budgets, hard OS failures and sustained acceptance remain open.

The [public connected Windows control](history/iterations/301-350.md#iteration-319) also composes the
ordinary API, real control/media sockets, 1080p JPEG and one first connected
RSS breach. The fixed error, both channel closes, failed snapshot, token
revocation and joined retirement pass. Its one-byte fixture cap establishes
failure behavior, not the normal 256 MiB total-session budget or continuous
memory accounting. Browser terminal display, connected siblings, OS failures
and soak remain separate requirements.
