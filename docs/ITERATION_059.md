# Iteration 59 — PCM source-to-consumer reset barrier

Date: 2026-10-10. Implements ARCHITECTURE §5/11 and MEDIA_PIPELINE §6/8 source
discontinuity ownership. Continues worker output `604bd10`; audio is still disabled.

The PCM publisher now requires a nonblocking consumer-discard callback. Initial
ownership, source revision changes and explicit reset keep a discard barrier
until the consumer accepts clearing unsent audio config/PCM. No fresh source
samples are read and no records are offered while discard credit is refused.
Source Close with no fresh PCM still drives the barrier. The callback runs under
the existing owner/reentry guard; empty binding is refused and exceptions produce
fixed failed state. Stats distinguish pending discard from pending PCM and count
accepted consumer resets separately.

Two pure cases cover accepted consumer ownership, denied discard preserving source
samples, resumed epoch/config ordering, idle behavior, empty/fault/reentrant
callbacks and explicit reset. An actual linked RDPSND/fake-SVC case demonstrates
Close removing already accepted unsent queue records, then a clean next epoch.
RDPSND now **51 cases / 8,431 assertions**, bundled CTest **14/14** and
/W4 /WX /analyze/clang-format pass. Foundation CTest **6/6** and bundled
`pnpm check` **163/163** (no skips, 111.79 s) pass. Strict TypeScript, ESLint,
Prettier and diff checks pass. Logs: ignored `build/iteration-059-*.log`.

The callback targets must outlive the publisher. It clears unsent consumer data;
it cannot retract a record already taken/written or browser buffers. Callback/
source exhaustion failure still requires outer connection/queue retirement.
The publisher is not installed in the worker. Audio status/browser reset without
fresh packets, config/provider/IPC activation, audible RDP, microphone, upstream
limits and latency acceptance remain open.
