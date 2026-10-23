# Iteration 55 — native producer/writer ownership

Date: 2026-10-10. Implements ARCHITECTURE §11 and SPECIFICATION §3.1/3.3.
Continues bounded lane storage `76c66fd` without activating worker audio.

`OutputDispatcher` protects queue ownership separately from the external writer.
Producer admission uses try-lock credit and never waits for a pipe callback. A
single in-flight record owns its bytes; the callback receives a fixed 24-byte
header and borrowed payload with no extra full-record serialization buffer.
Concurrent/reentrant write calls are refused. Callback failure/exception aborts
pending records, preserves bounded high-water/drop counters and refuses producers.
Finish refuses new admission and retains records for draining; abort drops queued
records but cannot interrupt an already executing external write.

Maximum retained wire ownership is **70 records / 17,639,002 bytes**, including
one maximum AVC record in flight plus the full queue. Allocator/container overhead
is additional; there is no second encoded full-frame buffer in this dispatcher.
Snapshots distinguish queued bytes from in-flight bytes and successful records.

Five native cases cover fixed-header equivalence/bounds, stalled writer with free
producer credit, control/audio drain ordering, callback reentry, false/throw/empty
writer failure, source queue invalidation and abort with an in-flight write. The
blocked fixture has a finite one-second deadline, and test threads are joined.
Foundation CTest **5/5**, bundled CTest **13/13**, and IPC **41 cases / 5,310
assertions** pass with /W4 /WX /analyze. clang-format and diff checks pass.
First bundled `pnpm check` was **158/159**: unsupported-config cleanup observed
a runtime directory after the registry deadline. Isolated repeat **1/1** and
the full repeat **159/159** (no skips, 117.81 s) pass. This is retained evidence,
not proof that the cleanup race is fixed. Registry forced-termination completion
must be handled in the next block before returning to the pipe adapter.

The external driver must own one writer thread, bounded/cancellable pipe I/O,
wakeups and shutdown deadlines, and keep the dispatcher alive through callbacks.
The dispatcher does not supply those policies and is not installed in the worker.
Actual XRDP audible audio, worker/Node activation, upstream limits, microphone
and latency acceptance remain open. Logs: ignored `build/iteration-055-*.log`.
