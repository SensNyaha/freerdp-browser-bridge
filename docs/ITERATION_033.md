# Iteration 33 — publish one terminal state after native retirement

Date: 2026-10-10. Traces SPECIFICATION §3.1, ARCHITECTURE worker ownership and
Stage 3/5 lifecycle requirements under ADR-008 / ADR-009.
Implementation commit: `ff5fcdf`.

Connection previously published closed/failed before display/addin retirement.
If provider close then failed, it emitted a second failed state, creating an
invalid public closed → failed transition; display unbind failure could also be
stored internally without changing the already-published outcome.

The RDP thread now selects an outcome, attempts all owned cleanup, promotes a
cleanup error to protocol failure and publishes exactly one terminal state after
retirement. Context and callbacks still follow their existing thread/lifetime
contracts. There is no retry of uncertain cleanup or change to the wire layout.

Verification: actual native worker / synthetic TLS lifecycle **8/8**, with terminal
cardinality/reason checks and heartbeat ordering; these are not successful RDP
desktop tests. Bundled CTest **10/10**, /W4 /WX /analyze, and private bundle
relocation **1/1** passed. Actual XRDP private inventory still reports ready ten
contacts, heartbeat/JPEG and bounded close, without sending touch. Existing
public addin/provider tests exercise retirement failure separately; this run
does not inject a provider-close failure through a full remote Connection.

Bundled pnpm check **139/139**, no skipped/cancelled tests, **106.50 s** passed.
Logs are ignored
build/iteration-033-*.log. Device/application/no-stuck and platform/soak gates remain.
