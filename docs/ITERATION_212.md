# Iteration 212 — actual concurrent Linux IPC capacity

2026-10-15. Verifies Stage 1 / ARCHITECTURE 2–3 at the current addon's explicit
32-pair/environment capacity. No production/native code or public limit changes.

One actual Node process starts 32 linked Linux workers through the primary packet
transport, with startup concurrency capped at four. All remain alive through
automatic heartbeats across idle polling boundaries and complete manual pings.
Each has one private runtime directory. A 33rd start fails with the existing
sanitized WORKER_START_FAILED before a child is spawned; its temporary runtime
is removed and the existing 32 owners remain healthy.

The fixture closes 16 workers, verifies their processes have ended and their
directories are gone, then starts 16 replacements to fill capacity again.
All current workers answer pings. Final joined close proves every recorded PID
is gone, parent /proc/self/fd count equals its warmed baseline and runtime is
empty. Failure paths join every owned close using inspected allSettled results.
The arrays/startup batches are fixed test bounds, not new production queues.

The focused actual Linux test passes (about 2.7 s); Windows correctly skips the
Linux-only adapter check. Existing addon fixtures separately cover native
32-slot allocation; this block composes it with actual worker startup, heartbeat,
slot retirement and runtime ownership. Logs: `build/iteration-212-*`.
Full Linux `pnpm check` passes 540/54 platform skips, 594 cases, zero failures.
Windows preceding full check is 547/46 (593 cases); the newly added Linux-only
case is independently verified as a platform skip. Changed-file lint/format pass.

This accepts the named Release worker/IPC capacity slice. No RDP connection,
credentials, server, browser or physical device is used; it does not satisfy
Stage 10's 30+ connected idle-session soak, active media/RSS/CPU acceptance or
host maxSessions policies larger than the fixed adapter capacity. Native code is
unchanged from the passing linked Linux 24/24, Windows 23/23 and foundation 11/11
CTest baseline. Sanitized addon/platform acceptance remains separate and open.
