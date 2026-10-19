# Native Windows process CPU query prerequisite

The private colocated `rdp-runtime-directory.exe` helper additionally accepts
exactly `--process-cpu-micros <pid>`. The PID is a positive decimal DWORD with
at most ten characters. Invalid grammar exits 2 with empty output, before
opening a process. The command carries only a nonsecret PID, no session data.

The helper opens `PROCESS_QUERY_LIMITED_INFORMATION`, calls the public Windows
`GetProcessTimes` API and closes the owned handle through RAII before reporting.
Failed open/query/close reports exit 1 with micros zero and a numeric OS error.
Success exits 0 and prints only this schema-1 scalar receipt:

```json
{ "v": 1, "micros": 12345, "error": 0 }
```

Output is below 128 bytes, without process paths, creation/exit timestamps,
credentials, logs or query history. Output/flush failure exits 3. The existing
directory and resident-memory command/receipt formats are unchanged.

The counter is cumulative kernel plus user CPU time, in microseconds. Zero is
valid. The helper combines 100 ns counters before flooring to microseconds;
integer-addition overflow or values above JavaScript's exact integer maximum
are refused as arithmetic overflow. Portable constexpr tests check zero,
fractional carry, high-word values, the exact scalar ceiling and overflow.

The native command is a Windows query primitive. It adds no timer,
percentage/rate calculation, CPU watchdog or browser-facing capability.
The trusted caller must own and revalidate process identity across samples;
a PID alone cannot protect against reuse. Linux CPU queries and actual connected
CPU/resource acceptance remain open. Existing RSS policy measures a different resource.
[Implementation and evidence](ITERATION_300.md).

## Typed Node reader

`@freerdp-bridge/node` additionally exports
`windowsWorkerCpuMicros(pid, workerPath, signal?)` and `processCpuReceipt(text)`.
The first returns a nonnegative safe integer cumulative duration. The second
admits at most 128 UTF8 bytes, exactly one literal v/micros/error field each,
schema 1, zero error and a nonnegative exact micros scalar. Duplicate fields,
negative zero, extra keys or invalid receipts fail with fixed
`ProcessSampleError('PROCESS_SAMPLE_INVALID')`.

PID validation precedes cancellation/platform/helper work. PIDs are positive
uint32 values. An already aborted signal stops before starting a helper and
reports `PROCESS_SAMPLE_CANCELLED`; its reason/cause is never forwarded.
Other platforms and missing/old/failed helpers report `PROCESS_SAMPLE_UNAVAILABLE`.
The query uses only the colocated helper, PID argv, a hidden window, two-second
execution timeout, 128-byte output limit, SystemRoot/WINDIR and an empty PATH.
Raw helper/OS output is never included in the public error.

Cancellation/timeout retires the query helper, not the sampled native worker.
The promise joins the helper's close/streams even if execFile rejects earlier,
then checks cancellation again before publishing a scalar. The caller still
owns identity and post-query state checks. No CPU poller/history, utilization
budget, background enforcement or public config is added.

This requires the native CPU command from iteration 300. Existing bundled
Release artifacts have not been rebuilt to add it; their older helper reports
unavailable. Actual reader tests use the current MSVC Debug foundation helper.
[Node verification and scoped limits](ITERATION_304.md).
