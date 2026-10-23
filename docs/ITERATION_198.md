# Iteration 198 — bounded Node packet owner and independent deadlines

2026-10-14. Implements Stage 1 readiness/timer/queue ownership above `d8cb27e`
without new public wire or session settings. [Owner contract](NODE_SEQPACKET_OWNER.md).
One typed owner borrows one active encoded send, bounds the FIFO/bytes, pauses
read interests, keeps original partial deadlines and joins native retirement.
Ordinary WorkerProcess still uses framed pipes pending supervisor activation.

Focused verification passes **22/22**: eight new pure adapter cases and fourteen
actual Linux addon/kernel/linked-worker cases (including eleven earlier gates).
New actual owner cases repeat ten HELLO/heartbeat/shutdown/runtime-cleanup cycles,
expire a blocked maximum send and a paused partial receive without further
readiness, wipe unsent storage and observe descriptor release. Pure cases cover
limits/FIFO, callback reentry/faults, static error privacy, EOF distinction,
deferred close, failed binding and uncertain close deadline.

The first actual lifecycle test timed out: post-EOF message scheduling cleared
the timer observing deferred native close. Message and retirement timers now have
separate ownership; the same actual lifecycle passes and a pure delayed-EOF-close
regression covers the failure. Strict TS also required the close timer to be
observed in the scalar snapshot. Checks were retained. First failure:
`build/iteration-198-owner-tests-first-failure.log`.

Full Linux check: **475 passed / 75 skipped / zero failures**, 550 cases;
linked CTest **24/24**. Windows check: **536 passed / 14 Linux-addon skipped /
zero failures**, 550 cases. The addon
ASan experiment/runtime baseline from iteration 196 remains open; these passing
Release owner cases do not establish that sanitizer gate. No actual CI or connected
Linux RDP/audio/input-release/resource/soak acceptance is added.

Next block is WorkerProcess selection, inherited FD plumbing, handshake identity,
startup/force-close joins and regression for legacy/fake peers. Native RDP remains
only in the separate C++ worker.
