# Host-side worker resident-memory sampling

`@freerdp-bridge/node` exports `workerResidentBytes(pid, workerPath, signal?)` for trusted
host diagnostics on Linux and Windows. It returns a positive safe integer byte
count. It creates no background timer, watchdog, policy enforcement, browser
endpoint or process history. It loads no FreeRDP library into Node.

The host must retain ownership of the process identity and verify its worker
is still current after awaiting the sample. A numeric PID/sample alone does
not establish liveness or protect against later PID reuse. The API measures
resident/working-set bytes, not private allocations, total session/Node memory,
codec budgets or CPU time. A sample is not a hard allocation limit.

## Platform inputs and errors

Linux reads only `/proc/<validated-pid>/status` into a fixed 16,385-byte scratch
buffer, admits at most 16,384 bytes and extracts one `VmRSS` KiB scalar. It
converts to bytes with safe-integer checks, zeroes the scratch and closes the
file handle on success/failure. PIDs are positive integers up to 0x7fffffff.
The parser retains at most two regex matches, not a match-history array.

Windows uses the existing colocated `rdp-runtime-directory.exe` private host
helper with the exact `--process-resident-bytes <pid>` command. PIDs are positive
integers up to 0xffffffff. The command contains no session configuration or
credentials. The helper queries limited process information and returns only
the existing schema-1 bytes/error receipt. The Node query has a two-second
execution timeout and 128-byte output limit; only SystemRoot/WINDIR and an empty
PATH are supplied, with a hidden window. Any stderr/failed query is unavailable.

`ProcessSampleError.code` is one of the fixed values:

| Code | Meaning |
| --- | --- |
| `PROCESS_SAMPLE_INVALID` | Invalid PID or direct receipt-parser input. |
| `PROCESS_SAMPLE_UNAVAILABLE` | Unsupported platform, unavailable proc/helper, failed read/query or unusable sample. |
| `PROCESS_SAMPLE_CANCELLED` | An optional AbortSignal cancelled the query after PID validation. Its reason is never included. |
| `PROCESS_SAMPLE_CLOSE_FAILED` | An owned proc-file close failed; retirement is uncertain. |

Errors contain no underlying process metadata, helper output or OS diagnostics.
The package also exports the platform-specific readers and scalar receipt
parsers used by existing local tooling. Their bounds apply before parsing.

## Cancellation and retirement

The Linux reader accepts `(pid, signal?)`; the Windows reader accepts
`(pid, workerPath, signal?)`. Omitting the signal preserves existing behavior.
An already aborted signal stops before acquiring a file or starting a helper.
Invalid PIDs retain `PROCESS_SAMPLE_INVALID` precedence.

Linux observes cancellation at I/O boundaries, zeroes its scratch and awaits
owned file close before publishing cancellation. Completion waits for pending
kernel I/O and close. Windows forwards the signal to the private query helper
and separately joins its `close` notification/streams even if execFile rejects
earlier. It aborts the sampling helper; the sampled native worker remains owned
by its normal supervisor. Both paths recheck cancellation after retirement.

Owned close failure is separately `PROCESS_SAMPLE_CLOSE_FAILED`. The sampler never
forwards AbortSignal.reason as a message or cause. Callers retain their normal
worker-state checks after awaiting a sample. OS/kernel-stall and complete
kernel-failure acceptance remains separate. Cancellation evidence
is recorded in [iteration 295](ITERATION_295.md).

## Existing lab tools and acceptance

`scripts/linux-process-resident.mjs` and `scripts/viewer-soak.mjs` delegate to
this shared implementation and preserve their existing `LAB_PROCESS_SAMPLE_*`
errors. Their source-tree imports require the current built Node package, so
run the ordinary Node build before using them or copying them to a prepared
lab workspace. Existing containers with older JS need their Node package `dist`
refreshed together with the updated scripts. No lab refresh is performed here.

Actual tests sample an owned unconnected native worker repeatedly, preserve
heartbeat and join its normal cleanup. Existing Linux current-process/FD and
lab scalar/budget tests remain separate controls. These checks do not accept
memory/CPU watchdog enforcement, connected RDP resource budgets or a soak.
Stage 10's complete watchdog requirement remains open. [Evidence](ITERATION_294.md).
The optional host policy now composes this sampler with owned worker failure
and joined cleanup; see [sampled RSS policy](WORKER_MEMORY_POLICY.md) and
[iteration 296](ITERATION_296.md).
