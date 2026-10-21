# Bounded host process CPU queries

## Native Windows command

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
a PID alone cannot protect against reuse. Actual connected CPU/resource acceptance
remains open. Existing RSS policy measures a different resource.
[Implementation and evidence](ITERATION_300.md).

## Native Linux command

Linux builds additionally install `rdp-process-query` beside `rdp-worker`.
It accepts only `--process-cpu-micros <pid>` with a positive decimal PID at
most 2,147,483,647. Invalid grammar exits 2 with empty output before file access.
It uses the same schema-1 micros/error receipt and exit 1/3 error/output rules
as Windows. No arbitrary path, RDP argument or session data is accepted.

The helper opens `/proc/<pid>/stat` read-only with close-on-exec, owns an
8,193-byte stack buffer, refuses more than 8,192 bytes and permits at most
32 read attempts including EINTR. RAII closes the descriptor before the receipt;
Linux close is not retried after an uncertain EINTR. Read/parser/close errors
return zero micros and a numeric error, without paths, comm or raw OS text.

The allocation-free bounded parser checks the requested PID and extracts fields
14/15, user/kernel CPU ticks, past the parenthesized comm. Spaces, right
parentheses and newlines in comm do not shift the field positions. Invalid,
negative, overflowing or missing required counter tokens refuse. This extracts
required fields from the kernel record; it is not a validator of every later
stat field. Whitespace is a delimiter, so an omitted token followed by extra
numeric tokens cannot be recognized as an empty positional placeholder.

The actual clock frequency comes from `sysconf(_SC_CLK_TCK)`; 100 Hz is not
assumed. Checked integer conversion combines user/kernel ticks before flooring
to microseconds, preserves fractional carry and refuses uint64 sum or exact
JSON integer overflow. Child-process utime/stime fields are not included.
[Build, actual query and scoped acceptance](ITERATION_308.md).

## Typed Node reader

`@freerdp-bridge/node` additionally exports
`windowsWorkerCpuMicros(pid, workerPath, signal?)`, matching
`linuxWorkerCpuMicros`, platform dispatcher `workerCpuMicros` and
`processCpuReceipt(text)`. Queries return a nonnegative safe integer cumulative
duration. The receipt parser
admits at most 128 UTF8 bytes, exactly one literal v/micros/error field each,
schema 1, zero error and a nonnegative exact micros scalar. Duplicate fields,
negative zero, extra keys or invalid receipts fail with fixed
`ProcessSampleError('PROCESS_SAMPLE_INVALID')`.

PID validation precedes cancellation/platform/helper work. PIDs are positive
uint32 values on Windows and int31 values on Linux. An already aborted signal
stops before starting a helper and
reports `PROCESS_SAMPLE_CANCELLED`; its reason/cause is never forwarded.
Other platforms and missing/old/failed helpers report `PROCESS_SAMPLE_UNAVAILABLE`.
The query uses only the colocated helper, PID argv, a hidden window, two-second
execution timeout and 128-byte output limit. Windows passes SystemRoot/WINDIR
and an empty PATH; Linux passes only an empty PATH.
Raw helper/OS output is never included in the public error.

Cancellation/timeout retires the query helper, not the sampled native worker.
The promise joins the helper's close/streams even if execFile rejects earlier,
then checks cancellation again before publishing a scalar. The caller still
owns identity and post-query state checks. This reader adds no CPU poller/history,
utilization budget, background enforcement or public config. A separate opt-in
[host policy](WORKER_CPU_POLICY.md) composes it with owned-worker sampling.

This requires the new platform helper/command. Existing bundled Release artifacts
have not been rebuilt to add them; missing/older helpers report unavailable.
Windows reader evidence uses MSVC Debug [iteration 304](ITERATION_304.md);
Linux GCC 13 Debug, focused GCC 12 helper and installed-query evidence is
[iteration 308](ITERATION_308.md). No production package adoption is claimed.

## Shared helper admission and Windows paired policy queries

CPU helper launches and Windows RSS helper launches share a FIFO owner per
Node execution context: 16 active tasks, 128 waiting tasks, three-second
admission bound. Overflow or expiry becomes the existing fixed unavailable
error. Cancellation removes queued work; the permit is released only after
joined child close. An expired waiter cannot launch merely because its timer
callback was delayed. This owner is not an OS-wide or cross-Node-thread limit.
Standalone calls can spend up to three seconds awaiting admission plus the
existing two-second execution timeout; OS retirement must still complete.
The worker policy's existing three-second total deadline includes both.

The internal query-owner snapshot additionally distinguishes three lifetime
maxima, rounded upward to milliseconds. `maxAdmissionMs` measures entry through
admission settlement, including queue/continuation delay and refused or
cancelled admission. `maxInvokeMs` measures the synchronous call to the admitted
task, including helper launch/setup or a synchronous exception, until it returns
its promise. `maxTaskMs` includes invocation and awaited completion; the existing
readers join native helper close before completion. Pending tasks have an
invocation sample but contribute no completed-task maximum yet. These fixed
scalars retain no PID, arguments, outputs, error details or sample history.
They are independent maxima and cannot be summed/subtracted into a per-query
timeline. They do not identify an OS/driver cause or change enforcement.
[Collection and observed capacity profile](ITERATION_375.md).

Admitted owners now take successive invocation turns: after the preceding
task returns its promise, the next invocation crosses a `setImmediate`
boundary. This prevents a burst of sixteen synchronous launch/setup calls
from occupying one microtask checkpoint. Only invocation is sequenced;
already launched helpers continue concurrently. The same sixteen permits
cover invocation staging through joined helper close, and at most sixteen
owners can await the invocation chain. No sample cache, additional helper,
polling interval, recurring idle timer or larger queue is introduced.

The original absolute admission bound is checked again immediately before
invocation, including staging time. An expired or cancelled staged owner
starts no helper, releases its turn/permit and preserves following work.
`maxAdmissionMs` includes this staging; invocation/task maxima retain their
existing boundaries. Two-second helper execution and three-second worker
query deadlines stay unchanged. This improves event-loop opportunities;
it does not establish a hard OS close bound or adequate capacity headroom.
[Controlled and actual Windows observations](ITERATION_376.md).

The Windows helper also accepts `--process-resources <pid>`. This additive
private command queries working set and cumulative CPU through one limited
process handle, closes it before output and returns exactly
`{"v":1,"bytes":N,"micros":N,"error":N}` within 128 bytes. Both measured
scalars are zero on failure. PID validation, numeric error/exit conventions
and checked CPU conversion match the existing commands. No session data is
accepted. The internal Node reader validates unique literal keys and exact
safe scalars, with the same hidden window, minimal environment, timeout and
joined cancellation as the separate queries.

Windows worker CPU/RSS policies with equal intervals share this one in-flight
query with at most two participant signals. Either cancellation aborts the
helper; all listeners retire before completion. CPU observation uses the actual
shared monotonic bracket, including admission. Results are never reused after
completion. Existing public scalar reader signatures are unchanged.
[Implementation, failed controls and scoped capacity evidence](ITERATION_310.md).
Release helper adoption remains pending.

New Windows source builds additionally advertise a bounded sixteen-PID resource
command. Capability-gated worker policies collect admitted requests for the same
helper path for five milliseconds and launch one helper for the group. They
preserve the shared sixteen/128 admission, execution/policy bounds, conservative
CPU brackets and joined per-member cancellation. Missing support retains the
scalar path; standalone readers are unchanged. Each physical launch still
crosses the invocation owner. Numeric batch counters distinguish launches from
logical samples. [Owner contract](PROCESS_RESOURCE_BATCH.md),
[prepared native component](ITERATION_377.md), [adoption](ITERATION_378.md).
