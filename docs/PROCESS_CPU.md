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

This is a Windows query primitive. It does not add a Node sampler, a timer,
percentage/rate calculation, CPU watchdog or a browser-facing capability.
The trusted caller must own and revalidate process identity across samples;
a PID alone cannot protect against reuse. Linux CPU queries, cancellation/
deadline ownership in a future Node reader and actual connected CPU/resource
acceptance remain open. Existing RSS policy measures a different resource.
[Implementation and evidence](ITERATION_300.md).
