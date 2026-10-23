# Iteration 329 — monotonic resource-sample deadline

Requirement: the optional worker resource watchdog must reject a sample that
returns after its existing three-second query deadline, even when the Node
event loop was blocked and its timer callback could not run on time. This
iteration changes the trusted host-side RSS/CPU policy checks and adds a
bounded test fixture. It does not change the query budget, Release defaults,
native helpers, FreeRDP, dependency pins or public/wire configuration.

## Failure and correction

The new actual-worker control injects one 3.1-second `Atomics.wait` stall into
the RSS, CPU, paired Windows and shared Windows sampler paths. Before the
correction, all three separate policy checks returned with the worker still
ready, no failure and an unaborted signal after the 3,000 ms deadline had
elapsed; the timer itself could not run during the event-loop stall. The
retained failing output is `build/iteration-329-deadline-before.log`.

The policy now records an absolute `process.hrtime.bigint()` expiry when each
query begins. It checks that expiry before starting the query and again before
using the returned RSS/CPU scalar. An expired result aborts the owned sample
and fails the worker with the existing fixed `WORKER_RESOURCE_UNAVAILABLE`
code. The existing three-second timer still requests cancellation during an
ordinary event loop; no deadline was extended. For a shared Windows helper
query, both policy owners keep their separate expiry and cancellation state.

## Verification and scope

The test-only failure-before control reproduces for RSS, CPU and paired
Windows sampling. After the correction, the full resource-focused Node run
passes **25/25** on the actual Windows native worker, including those three
stall cases and one shared-query stall. Each late-result case reports a
3,105–3,114 ms injected stall, `WORKER_RESOURCE_UNAVAILABLE`, an aborted
signal and joined worker/runtime cleanup. The shared path starts one helper
query. Output is retained in `build/iteration-329-resource-focus.log` and
`build/iteration-329-shared-focus.log`.

The refreshed Windows native CTest passes **33/33** against the unchanged
native binaries (`build/iteration-329-windows-ctest.log`). Full Windows
`pnpm check` passes build, lint, format and **740/841 Node tests** (740 passed,
101 platform/profile skips, zero failures). The ordinary Node module-type
performance warnings remain unrelated and non-fatal. Absolute monotonic checks
prevent late scalar use; they do not prove that a blocked kernel operation or
its close has a hard operating-system deadline. Linux execution and a rebuilt
artifact check are not claimed. The earlier capacity-failure root cause,
connected policy faults, total-session limits and broader resource/load
acceptance remain open.

The Linux container transfer/check was not executed: automatic approval review
rejected the Docker fixture-transfer action after its usage limit was reached.
The command did not run; this is a review-service quota failure, not a finding
that the action was unsafe.

The authorized lab's TCP port 3389 answered on this retry. The existing RDP
helper could not start because the ignored `.local-tests/xrdp-lab.json` file is
absent; no credentials or alternate target were supplied. This is not RDP
activation evidence.
