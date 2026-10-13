# Iteration 180 — actual viewer soak refusal and bounded fault diagnostics

2026-10-13. Implements Stage 4 / PERFORMANCE verification and SPECIFICATION
§3.1 failure observability. The first authorized H.264/1080p observation did
**not** pass 30 minutes: it stopped with `RDP_PROTOCOL_ERROR` after the last
successful sample at 1,329,198 ms (22 minutes 9 seconds). The viewer closed;
the helper returned exit 1 and its private runtime directory was empty.

The 45 completed samples report maxima of one queued frame / 2,508 queued bytes,
zero decoder/socket backlog, 228,847,616 worker resident bytes (218.25 MiB) and
128,958,464 Node resident bytes. Worker samples stayed below 256 MiB. These are
30-second working-set observations, not absolute peaks or a leak proof. At
failure the viewer had rendered 3,533 frames / 49,190,498 bytes. The maximum
observed decode p95 was 41.1 ms; the final snapshot was approximately 3.9 ms.
This does not establish the 30 ms rendering budget. Resize/replay checks after
the soak were not reached. Stage 4 and its full soak gate remain IN PROGRESS.

The original run did not capture the underlying native fault stage; a slow
tunnel is not established as its cause. The worker now emits at most one fixed
`bridge.rdp.failure v=1` scalar diagnostic for a caught protocol fault or terminal
protocol retirement failure. It contains no packet contents, peer identity or
credential. Stages are 0 setup, 1 pre-pump DVC poll, 2 RDP event dispatch,
3 post-pump DVC poll, 4 input, 5 resize, 6 output reset, 7 input reset,
8 microphone dispatch, 9 audio publication, 10 capture, 11 retirement.
Receive/assembly/registry/plugin flags and bounded reservation counters retain
fault ownership; caught faults are sampled before cleanup changes it.

A trusted protected process-construction seam lets the local viewer use the
existing WorkerProcess stderr hook. The default still drains/discards upstream
text. The lab recognizer stores only fixed parser state, scalar accumulation and
one latest validated record; fragmented lines work, foreign text and excessive
values are discarded. Failure output is emitted after server/worker shutdown,
so cross-pipe event ordering does not lose an already-written diagnostic.
Incomplete-run aggregates are retained; failed memory budgets now also fail the
helper exit status. No public protocol, arbitrary native argv, certificate
policy or device permission changes.

Focused diagnostic/soak/mode tests pass 9/9. The existing forced-termination
integration now verifies that a host-supplied process is joined and removed.
Foundation CTest passes 10/10, final bundled CTest 22/22, and full `pnpm check`
520/520. Final LF/CRLF fragmentation checks pass 9/9; clang-format, Prettier and
diff checks pass. Actual diagnostic/recovery results will be recorded after
completion; an instrumentation change is not a fix or an accepted rerun.
