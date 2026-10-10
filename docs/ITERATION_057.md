# Iteration 57 — bounded Windows pipe writer

Date: 2026-10-10. Implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §11/12
native IPC ownership. Continues dispatcher `46245b2` and registry completion
`120c5b1`. The driver is not installed in the worker yet.

`WindowsPipeOutput` borrows a trusted synchronous byte-pipe write handle, owns one
writer plus a deadline watchdog, and uses private events for wakeup/completion.
One whole-record deadline covers the fixed header and all body chunks (at most
64 KiB/write); producer admission does not wait for WriteFile. Timeout cancels
the writer's synchronous I/O and refuses/discards pending output. Failed/partial
writes are not replayed or counted as sent records. Normal drain joins watchdog
before writer so cancellation cannot target a closed native thread handle.

Default record/drain deadlines are 1,000/1,500 ms, followed by 250 ms cancellation
grace after drain timeout. Cancellation is retried to cover the call-start race.
Caller must keep the borrowed pipe and owner alive until finish/destruction; only
the creating thread may finish/destroy. If OS cancellation cannot complete, the
owner retains all live spans/threads. Destruction cannot free them and fails the
owned process rather than permit use-after-free. This fallback does not establish
hostile-driver or simultaneous-hard-kill directory reclamation.

Five cases / **61 assertions** use actual Windows anonymous pipes, not simulated
write callbacks: exact ten-record forwarding, stalled reader with producer credit,
watchdog cancellation, shorter drain cancellation, broken reader, owner/deadline/
handle refusal and twenty sequential drivers with unchanged process handle count.
Bundled CTest **14/14**, foundation CTest **6/6** and bundled `pnpm check`
**162/162** (no skips, 115.86 s) pass. /W4 /WX /analyze, clang-format, strict
TypeScript, ESLint, Prettier and diff checks pass.
Logs: ignored `build/iteration-057-*.log`.

Worker selection/shutdown failure reporting, actual XRDP media regression and
audio activation remain next. Linux transport/driver acceptance, fairness,
source-reset queue barriers, audible browser RDP, microphone and latency remain
open. No public wire change or measured latency improvement is claimed.
