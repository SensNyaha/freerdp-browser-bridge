# Iteration 320 — connected Windows CPU failure over public HTTP/WebSocket

2026-10-19. Continues TODO Stage 10 / SPECIFICATION §2.12/§3.1 from the
[connected public RSS control](ITERATION_319.md). Only the explicit helper,
profile selection unit tests and documentation change. Production resource
policy, API/WS/native code, Release profiles/artifacts and dependency pins remain
unchanged.

The public helper retains its original one-byte RSS default. The new explicit
`--cpu-breach` mode selects a 1%-of-one-core fixture CPU cap, 256 MiB sampled RSS,
equal five-second polls and the same one-second minimum CPU window. Unknown/
mixed switches or invalid native selection refuse before private configuration
or listener acquisition. These caps are test conditions, not desktop budget
recommendations.

An actual public JPEG must precede all CPU/RSS samples. The first global CPU
counter must then be the first connected counter with the owned worker still
ready. The existing bounded driver issues valid private native IPC heartbeat
batches, at most 16 pending; each batch joins before another and the load stops
at failure/eight seconds, under the unchanged 25-second overall helper deadline.
The driver observes the fixed native failure synchronously; public WS error
delivery is checked independently after channel closure, avoiding a transport-
notification timing dependency. No remote application/input, fake resource
counter, artificial clock or server setting is used in actual integration.

## Actual authorized Windows result

The same verified isolated Release worker/helper, authorized target and exact
approved session-only fingerprint pass **7 public JPEG frames**, 1920×1080,
first **33,267 encoded bytes**, before the terminal failure. Two connected CPU
samples show **3,343,750 µs** growth; **361,696** valid pings complete. Sampled
RSS peak is **162,697,216 bytes**, below the separate 256 MiB cap.

The native driver observes WORKER_CPU_LIMIT and the public control channel
receives exactly one WORKER_CPU_LIMIT / fixed CPU message / retryable false.
Both channels close 1000 / `session terminal`. GET preserves HTTP 200 failed
snapshot with the same error and no-store; new tokens refuse 409, an unused
old token upgrade refuses 401, and concurrent overflow refuses before a second
factory. Adapter close, query owners, PID and runtime retire completely.

The unchanged default RSS mode also passes an actual repeat: **8 JPEG frames**,
first 1920×1080 / 33,267 bytes, first connected RSS **159,858,688 bytes**, exact
WORKER_MEMORY_LIMIT, both terminal channels, expected HTTP/token statuses and
joined cleanup. Logs: `build/iteration-320-rdp-api-{cpu,memory-repeat}.log`.

Windows focused profile/CLI/driver cases pass **11/11**, plus changed-file ESLint
and Prettier. Linux focused cases also pass **11/11**, foundation CTest **17/17**.
Full Linux `pnpm check` passes build/lint/format and Node **657 passed / 153 skips /
810 total / zero failures**, duration 151.80 s. Full Windows `pnpm check` passes
build/lint/format and Node **756 passed / 51 skips / 807 total / zero failures**,
duration 665.97 s. Current isolated Release CTest passes **31/31** in 30.08 s.
Seven protected inputs remain byte-identical; the retained module/DLL/codec
provenance control, structured actual-result audit, local documentation links
and `git diff --check` pass. This is a Windows producer and Node transport/ACK receiver, not
browser decode/render or another platform's actual RDP acceptance.

Connected sibling isolation, browser terminal display/physical release, full
startup/between-sample/Node/session-total/CPU budgets, hard OS retirement,
production package adoption, platform/CI and sustained/concurrent soak remain
open. No performance/quality/latency conclusion is inferred from cumulative
counters or this deliberate fixture load.
