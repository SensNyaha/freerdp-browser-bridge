# Iteration 304 — typed cancellable Windows CPU queries

2026-10-18. Continues SPECIFICATION §2.12 / TODO Stage 10 CPU-watchdog
prerequisites after the native counter in `059c866`. Existing Release artifacts,
configuration and dependency pins are unchanged; no RDP/device/desktop action
occurs in this local development block.

`windowsWorkerCpuMicros` queries the colocated native CPU helper with a bounded
nonsecret PID, minimal environment and fixed time/output limits. It joins helper
close/streams before completion, including cancellation, and rechecks AbortSignal
after retirement. The sampled worker is unaffected. PID validation precedes
pre-cancel/platform/helper work; fixed ProcessSampleError values omit reason,
raw helper/OS output and causes.

`processCpuReceipt` checks a 128-byte UTF8 limit before parsing, three unique
literal keys, version/error and exact nonnegative duration. Duplicate keys,
negative zero, fractions, unsafe counters, unknown keys and invalid receipts
are refused. Zero is valid cumulative CPU time. Existing RSS code is unchanged;
the common error type is reused. [Contract](PROCESS_CPU.md).

## Focused verification

Windows CPU/resident focused checks pass **10/10**. Three new unit cases cover
receipt boundaries, invalid-PID precedence and pre-cancel privacy. Two actual
unconnected C++ worker cases perform repeated monotonic CPU queries/heartbeat
and eight cancelled query-helper requests followed by a valid new sample.
Joined normal close leaves an empty runtime. These are native lifecycle tests,
not fake RDP or actual connected CPU acceptance. The native busy-process growth
and checked conversion controls remain separately recorded in iteration 300.

Evidence is `build/iteration-304-build.log`, `iteration-304-focused.log`,
`iteration-304-windows.log`, `iteration-304-windows-ctest.log`,
`iteration-304-linux.log`, with explicit code transfer/runner
`iteration-304-transfer.cjs` and `iteration-304-run.py`. Existing local Debug
workers/fixtures are reused; no new pristine build or CPU-enabled Release
package is claimed. Older bundled helpers intentionally remain unavailable
for this new command.

Linux focused checks pass **8 / 2 Windows-only skips**, CTest **17/17** in
6.61 seconds and full `pnpm check` build/lint/format plus **605 passed / 150
platform/profile skips / 755 total / zero failures**, Node duration 110.16
seconds. These Linux cases verify the common parser/refusals and unchanged
native foundation; they do not query Linux CPU. Windows CTest controls pass
**16/16** in 5.63 seconds without a native rebuild.

Full Windows `pnpm check` passes build/lint/format and **662 passed / 90
platform/profile skips / 752 total / zero failures**, Node duration 380.74
seconds. Working/staged `git diff --check` and three local documentation links
pass. No ordinary suite is presented as a CPU-enabled Release/RDP test.

CPU utilization/rate windows, budget enforcement, Linux query implementation,
process-reuse/kernel-failure matrix and connected/total-session/soak gates remain
open. No automatic CPU timer, public policy field or history is introduced.

Final review on 2026-10-19 also rejects escaped JSON property names before
parsing, including escaped aliases of an already present key. Three retained
boundary vectors cover v/micros/error aliases. The earlier literal-key scan
alone did not establish that refusal. The corrected Windows focus again
passes 10/10; Linux full check again passes 605 / 150 skips in 126.42 seconds
and CTest 17/17 in 8.27 seconds. Windows CTest again passes 16/16 in 9.56 seconds.
The corrected full Windows check again passes 662 / 90 skips in 452.98 seconds.
Final logs use the `build/iteration-304-final-*` prefix.

The initial commit request was not executed because the automatic approval
service reported a usage limit. No alternate Git-write path was used; final
commit submission uses the ordinary approval mechanism after access resumes.
