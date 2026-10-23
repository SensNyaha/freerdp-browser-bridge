# Iteration 295 — cancellable resident sampling joins owned resources

2026-10-18. Continues the Stage 10 watchdog prerequisite / SPECIFICATION §3.1
bounded-resource ownership after `f9ff66d`. The host RSS readers now accept an
optional AbortSignal so a later watchdog can retire a query during worker close.
This block adds no background watchdog, default enforcement or native changes.

## Implementation

PID validation retains its existing precedence. Pre-aborted queries reject
with fixed `PROCESS_SAMPLE_CANCELLED` before acquiring platform resources.
Linux observes the signal after open/read boundaries, zeroes its fixed scratch
and awaits file close before publishing cancellation. Pending kernel operations
still have to complete. Windows forwards the signal to the existing private
query helper and explicitly joins the helper's `close` event and streams on
every completion path, including execFile's earlier abort rejection.

Both platforms recheck the signal after retirement before returning a scalar.
AbortSignal.reason is never forwarded as an error message/cause. An owned
file-close failure retains unavailable status. Existing query size/PID/time
bounds, the scalar receipt format, minimal helper environment and lab wrapper
errors are preserved when the new signal is omitted. The sampled RDP worker
receives no cancellation signal from this API; only the query is retired.

## Verification

Windows focused tests pass **11/11**, including pre-abort fixed errors, existing
lab parser/budget compatibility, actual positive worker RSS and eight cancelled
query-helper requests. The target worker keeps heartbeat and accepts a fresh
RSS query afterwards. Linux focused tests pass **12/12**, including the
existing current-process FD-return control and both actual owned-worker cases.

Complete `pnpm check` passes build/lint/format and Windows **640 / 90
platform/profile skips / 730 total / zero failures**, 369.71 seconds for Node
tests; Linux **586 / 147 skips / 733 total / zero failures**, 104.26 seconds.
Native CTest controls pass Linux **16/16** in 6.37 seconds and Windows **15/15**
in 5.52 seconds. The latter repeats the existing MSVC Debug fixture with its
temporary alias restored and removed; no native rebuild is performed.
Final changed-file lint, working and staged diff checks pass.

The new actual cancellation case checks a warmed Linux FD baseline after eight
sequential cancelled queries. The test owns its unconnected native process and
joins normal runtime cleanup. It uses no RDP/DNS target, physical device or
external service. No security research/fuzzing or Release/dependency setting
changes occur.

Evidence: `build/iteration-295-windows-focused.log`,
`iteration-295-windows.log`, `iteration-295-linux.log`, runner
`iteration-295-run.py` and explicit source transfer
`iteration-295-transfer.cjs`. Existing local Debug workers and the restricted
Linux container are reused; no new native build/pristine checkout is claimed.

Repeated Windows CTest is `build/iteration-295-windows-ctest.log`.
Shared sampler source SHA-256:
`c263b56947f63e34be04cab76257bc4ce2d6cfd5da12fd2d0f473d03a7288cfc`.

The sampler remains a prerequisite. CPU/RSS watchdog enforcement, hard memory
limits, complete kernel/OS-failure deadlines, connected resource budgets and
soak acceptance remain open. Stage 10 is not marked complete.
