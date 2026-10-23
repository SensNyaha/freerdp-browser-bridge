# Iteration 366 — successful media forwarding requires every record write

2026-10-20. Stage 4's protected forwarding histogram counted a frame whenever
its last-index RWB1 write callback succeeded, even if the configuration record's
callback had already failed. That contradicts the documented exclusion of
failed writes. A separate callback-order control also observed a sample before
all writes completed.

The media attachment now keeps a scalar outstanding-callback count and a
failure latch for the current frame group. It records one `forward` sample
only when every write callback succeeds. Any error still terminates the socket
and joined close releases render credit as before. No frame queue, metric label,
timer, public wire format, Release configuration or dependency pin changed.

Two synthetic-write regression cases fail before and pass after the correction.
Their matrices cover JPEG/AVC configuration+image groups, both callback orders,
successful completion and error followed by success, including zero credit on
retirement. These are callback fault fixtures, not actual network faults or RDP
acceptance. The existing real local HTTP/WS media regression remains the normal
transport control. Full dirty-to-send/queue-delay and performance acceptance
remain open.

The focused synthetic-write and existing local HTTP/WS media suites pass
28/28. Full `pnpm check` passes build, ESLint, formatting and Node 753 passed /
101 profile/platform skips / 854 total, zero failures. The retained full log is
`%TEMP%/freerdp-bridge-iteration366-check.log`; `git diff --check` passes.
Native code and artifacts are unchanged; the existing linked CTest 29/29
control is recorded in [iteration 364](ITERATION_364.md), not claimed as a new
native run for this TypeScript-only change.
