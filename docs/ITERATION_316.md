# Iteration 316 — connected Windows native RSS-limit breach

2026-10-19. Verifies the named connected RSS failure slice of SPECIFICATION
§2.12/§3.1 and TODO Stage 10, following the [CPU-limit control](ITERATION_315.md).
Only explicit test helpers, unit tests and documentation change. Production
resource policy, native code, Release settings/artifacts and dependency pins
remain unchanged. [Invocation and preconditions](RDP_RESOURCE_SMOKE.md).

The separate `--memory-breach` mode selects the same hash-verified isolated
Release consumer before reading ignored lab configuration. It uses a one-byte
fixture RSS cap, ordinary 100%-of-one-core CPU cap, equal five-second polls and
the existing one-second CPU minimum window. This is not a production budget.
Both failure switches together refuse before private configuration access.

The helper requires actual connected RDP, heartbeat and JPEG 1920×1080 before
any global CPU/RSS sample. It then waits at most seven seconds for the ordinary
first result. Acceptance requires exactly WORKER_MEMORY_LIMIT, failed worker,
and exactly one over-cap RSS sample that is also the first global sample and
already connected. No artificial allocation/load, remote application launch,
input, saved desktop image or server setting is used. The unchanged overall
25-second deadline and joined query/native/runtime cleanup remain mandatory.

## Actual authorized Windows RDP result

Using the approved exact session-only fingerprint, the iteration 313 Release
worker receives JPEG **1920×1080 / 47,290 encoded bytes** and heartbeat before
the first sample. The first global/connected RSS sample is **163,778,560 bytes**
and produces exactly **WORKER_MEMORY_LIMIT**. Joined close succeeds, the native
PID is absent and runtime is empty. This tests private WorkerProcess failure,
not public session/registry composition or a hard OS query stall.

Both original modes also pass on the same selected artifact after refactoring:

- Healthy: eight CPU/RSS samples, RSS peak **149,372,928 bytes**, CPU growth
  **171,875 µs**, JPEG 1920×1080 / 155,435 bytes, heartbeat and joined cleanup.
- CPU breach: first connected CPU baseline, two samples with **2,453,125 µs**
  growth, **438,651** completed valid local IPC pings (at most 16 pending),
  JPEG 1920×1080 / 47,290 bytes, exact WORKER_CPU_LIMIT and joined cleanup.

Logs are `build/iteration-316-rdp-{memory-limit,healthy-repeat,cpu-repeat}.log`.
Synthetic/metadata checks pass **10/10** on Windows, covering exclusive mode
selection, first-global/connected sample ownership, wrong failures, worker state
and scalar bounds separately from actual integration. Linux focused checks also
pass **10/10**, with native foundation CTest **17/17**. Full `pnpm check` passes
build/lint/format and Node on both platforms: Windows **751 passed / 51 skips /
802 total**, duration 511.54 s; Linux **654 passed / 151 skips / 805 total**,
duration 132.40 s. Both have zero failures. Platform/profile skips remain
explicit; common Linux checks do not establish actual Linux RDP acceptance.
Current isolated Release CTest passes **31/31** in 20.59 s. The retained
provenance control passes seven unchanged protected inputs, five actual module
origins, eleven SDK DLLs, two dependency DLLs and four codec roundtrips. Local
documentation links and `git diff --check` pass; the structured result audit
confirms three complete PID/runtime retirements and exact resource errors.

Public registry failure propagation, connected sibling isolation, complete
startup/between-sample/Node/session-total budgets, hard kernel/OS retirement,
production package adoption, other producer/server profiles, CI and soak remain
open. Audio/recording, physical devices and other RDP gates are unaffected.
