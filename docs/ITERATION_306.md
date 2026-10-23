# Iteration 306 — optional sampled Windows CPU watchdog

2026-10-19. Implements the Windows sampled CPU-policy slice of SPECIFICATION
§2.12 / TODO Stage 10, using the native counter from `059c866` and typed reader
from `df40276`. Default behavior, CMake/Release settings, dependency pins and
existing bundled artifacts remain unchanged. This block makes no RDP, remote
application or physical-device requests.

Trusted hosts may opt into `maxCpuPercent`, `cpuPollIntervalMs` and
`cpuWindowMs`. Invalid options and unsupported platforms refuse before startup.
After HELLO, an enabled worker owns one CPU query and two scalar window records;
RSS remains independently bounded. The monotonic query brackets give a
conservative elapsed span for exact BigInt comparison. Initial/short samples
do not evaluate prematurely; counter regression and invalid time/scalar data
fail explicitly. [Full contract and limitations](WORKER_CPU_POLICY.md).

Observed excess fails only the owned worker with `WORKER_CPU_LIMIT`. The native
session adapter/public fixed failure mapping preserve HTTP 503/nonretryable
semantics without exposing diagnostic data. Unavailable/deadline results use
the existing resource error. Close/failure stops both pollers, aborts pending
queries and joins their retirement with native/runtime cleanup. Late counters
are inert; uncertain query retirement remains a close failure.

## Focused verification

Windows CPU/RSS focus passes **26/26** in 11.09 seconds. Seven new portable CPU
cases cover zero/equal/over-cap windows, accumulated polls, >100% multi-thread
semantics, conservative query latency, exact large counters, clock/counter
refusals, host options and the fixed public error. The existing adapter test
also verifies preservation of the new CPU failure code.

Actual unconnected Windows C++ workers verify at least 15 joined CPU queries
alongside RSS, heartbeat and empty-runtime close. Omitted policy performs no
CPU query on either platform. Separate synthetic CPU counters exercise an
excessive window that kills the owned native worker while a sibling stays
healthy. Other synthetic probes cover unavailable/invalid/regressing counters,
one pending flight, late completion, three-second deadline and uncertain
retirement. These are native lifecycle compositions, not actual native overload
or connected RDP CPU acceptance.

Linux focus passes **18 / 8 Windows-only skips**, CTest **17/17** in 6.66 seconds
and full build/lint/format/Node **613 passed / 158 skips / 771 total / zero
failures**, Node duration 110.02 seconds. Linux validates common window/options,
explicit unsupported-policy refusal and default-off native lifecycle; it does
not query or enforce Linux CPU. Windows CTest passes **16/16** in 5.25 seconds;
the existing native builds are reused without a C++ rebuild.

Full Windows `pnpm check` passes build/lint/format and **678 passed / 90
platform/profile skips / 768 total / zero failures**, Node duration 393.55
seconds. `git diff --check` and all 35 local links in the changed contract/report
documents pass. No C++ or dependency/Release configuration is changed.

Evidence: ignored `build/iteration-306-{build,focused,windows,windows-ctest,linux}.log`,
explicit source transfer `iteration-306-transfer.cjs` and bounded no-network
container runner `iteration-306-run.py`. No previous fixture is represented as
a fresh source/dependency/Release build. Actual overload, Linux CPU, production
helper adoption, startup/Node/total-session CPU, connected policies, hard OS
retirement and sustained/platform/soak gates remain open.
