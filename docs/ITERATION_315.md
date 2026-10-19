# Iteration 315 — connected Windows native CPU-limit breach

2026-10-19. Verifies the positive CPU-limit failure slice of SPECIFICATION
§2.12/§3.1 and TODO Stage 10, after the [healthy connected controls](ITERATION_314.md).
Only explicit local helper/driver, unit tests and documentation change. Runtime
policy/native code, Release compiler settings/artifacts and dependency pins are
unchanged. [Invocation and exact preconditions](RDP_RESOURCE_SMOKE.md).

The new `--cpu-breach` mode selects the same verified source-consumer receipt
and worker/helper hashes before lab credential access. It fixes CPU at 1%, RSS
at 256 MiB, equal polls at 5,000 ms and minimum CPU window at 1,000 ms. This
fixture cap is not a production recommendation. The helper requires actual
connected 1080p JPEG and heartbeat before the first CPU sample, then verifies
that the first observed global counter belongs to the connected state. No
synthetic counter/clock is substituted in the actual run.

The load consists only of valid private IPC heartbeat batches to the owned
native worker. Each has at most 16 pending requests, below the existing request/
control bounds, and joins before replacement. It stops at failure or eight
seconds, with the existing 25-second total helper bound. No remote application
launch/input, physical capture, saved desktop image, server setting or network
fault injection is used. Only exact WORKER_CPU_LIMIT plus increasing real
counter and joined PID/runtime retirement can pass.

## Actual authorized Windows RDP result

The same isolated Release worker/helper from iteration 313 connects using the
previously approved exact session-only fingerprint. JPEG 1920×1080 / 155,435
encoded bytes and heartbeat pass before CPU baseline. Two actual connected CPU
samples observe **2,281,250 µs** growth; **359,824** valid heartbeat requests
complete before the precise **WORKER_CPU_LIMIT** failure. No more than 16 are
pending at once. Joined close passes, the native PID is gone and runtime is empty.
Parent Node continues to emit the fixed result and cleanup scalars; this is not
a public session-registry/server isolation acceptance.

The ordinary healthy mode then passes again with the same selected artifact:
eight CPU/RSS samples, 100%-of-one-core cap, RSS peak **156,299,264 bytes**, CPU
growth **578,125 µs**, JPEG 1920×1080 / 714,244 bytes, heartbeat and joined
PID/runtime cleanup. No CPU utilization/latency or sustained budget is inferred
from these short cumulative-counter observations.

Windows focused checks pass **8/8**. Synthetic cases separately verify the
16-flight bound and joined batches, refusal of noninitial/nonconnected baseline,
wrong failure/non-growing counter and finite deadline before another batch.
Explicit mode selection preserves the original healthy options. Exact logs are
`build/iteration-315-{windows-unit,rdp-cpu-limit,rdp-healthy-repeat}.log`.

Full Linux `pnpm check` passes build/lint/format and **652 passed / 151
platform/profile skips / 803 total / zero failures**, Node duration 134.47 s.
The focused synthetic/metadata group passes **8/8** and existing native
foundation CTest passes **17/17**. Full Windows `pnpm check` passes build/lint/
format and **749 passed / 51 platform/profile skips / 800 total / zero failures**,
Node duration 552.86 s. Current isolated Release native CTest passes **31/31**
in 18.73 s. Seven protected inputs remain byte-identical; five actual module
origins, eleven SDK DLLs, two private dependency DLLs and four codec roundtrips
pass the retained provenance control. Local documentation links and
`git diff --check` pass. The actual scope is one Windows
Release producer/RDP lab connection; Linux/common synthetic checks do not
establish another producer/server profile. Connected RSS breach, public registry
composition, simultaneous connected siblings, hard OS retirement, complete
CPU/session-memory budgets, production package adoption, platform/CI and soak
gates remain open.
