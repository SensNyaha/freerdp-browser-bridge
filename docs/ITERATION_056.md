# Iteration 56 — forced termination completion and startup cancellation

Date: 2026-10-10. Implements SPECIFICATION §3.1, ARCHITECTURE §12 and the Stage 1/2
cleanup ownership requirement. Follows dispatcher `46245b2` and its observed
registry cleanup failure; pipe activation is still pending.

The registry previously marked capacity released immediately after calling
`terminate`, even while a native child's close/runtime-directory cleanup was
pending. Trusted `SessionWorker.terminate` may now return a completion promise.
The registry keeps capacity through that promise or a separate bounded
termination deadline (default two seconds after the graceful two seconds).
Void/rejected/hung backends remain bounded; no raw diagnostic is forwarded.
The native backend kills immediately and returns completion after startup settles
and `WorkerProcess.close` completes. Cancellation checks after filesystem awaits
and HELLO prevent a terminated asynchronous start from spawning a late child or
re-entering ready state.

Focused checks **4/4** cover retained capacity through explicit completion,
rejection/hang bounds, actual native lifecycle startup cancellation, a compiled
fake-worker shutdown stall with native adapter/process close/runtime cleanup,
and the original actual linked worker unsupported-config cleanup case. Fake worker
tests do not establish actual RDP/device integration. Bundled `pnpm check`
**162/162** (no skips, 110.19 s) and foundation CTest **5/5** pass. This full run
also included a concurrent foundation build, without the previous cleanup failure.
Prettier, ESLint, strict TypeScript and diff checks pass.
Logs: ignored `build/iteration-056-*.log`.

The forced deadline can still expire before resources retire; legacy void
backends offer no join guarantee. Simultaneous hard kill/orphan reclamation,
filesystem/ACL failure and hostile OS cancellation remain open gates. This block
does not enable audio or change the public wire protocol.
