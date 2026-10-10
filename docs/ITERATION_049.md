# Iteration 49 — paced PCM packets and monotonic presentation

Date: 2026-10-10. Implements MEDIA_PIPELINE §6/8 packetization, bounded late
playback and a common monotonic clock, plus SPECIFICATION §2.6 / ARCHITECTURE §5/7.
Continues provider composition `7842b32` (iteration 48).

The native sink now exposes fixed 20 ms / 960-frame / 3,840-byte PCM packets.
Early calls consume nothing; due packets contain exact FIFO samples plus counted
underflow silence. Entirely missed deadlines discard the corresponding old frames
and emit one current packet with discontinuity, without catch-up loops, waits or
new queues. A fixed sample clock preserves subinterval jitter without cumulative
floating-point drift. Backward/overflow clocks fail before consuming samples.

Queue skips have a separate lifetime counter. Source/connection resets restart
the packet epoch while retaining global monotonic checks and native statistics.
Sink volume/normalization and actual linked RDPSND dispatch with simulated SVC
feed this path; source discontinuity clears old timing and Close stops emission.
No worker audio selection, IPC or browser playback is enabled here.

Verification: portable audio **48 cases / 438,643 assertions**, native RDPSND
**42 cases / 7,295 assertions**. Foundation CTest **5/5**, bundled **13/13**,
/W4 /WX /analyze. pnpm check **141/141**, no skips/cancellations, **125.40 s**.
clang-format and git diff whitespace checks pass.
Logs: ignored `build/iteration-049-*.log`.

Actual audible audio/microphone, scheduling and wire delivery, end-to-end latency,
larger source bursts, earlier core limits and finite shutdown deadlines remain
open. The virtual-minute test proves arithmetic/sample continuity, not a timed soak.
