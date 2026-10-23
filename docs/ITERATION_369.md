# Iteration 369 — separate browser-consumer reset requests

2026-10-20. Native loss/cause receipts alone do not show how many resets the
Node browser-consumer requested. The lab viewer now wraps the existing reset
method with fixed scalar call/result counters and reports `consumerRecovery`
after joined close. Epoch arguments, completion values and thrown errors keep
their exact identity and behavior; none is retained in diagnostics. No new
reset, retry, request queue, timeout or policy is introduced.

The fixed fields are `requests`, `scheduled`, `stale`, `busy`, `unavailable`,
`unexpected` and `failures`, saturating at the JavaScript exact-integer ceiling.
Snapshots are copies. Calls awaiting completion have no invented result;
scheduled completion does not prove source reset, playback or the cause of a
particular pause. The wrapper is local to the lab helper, not a public metric
or session API. The existing Opus sender/socket controls separately exercise
ready-source attachment recovery and pending-prediction overflow.

Focused wrapper identity, unresolved completion, error/refusal and snapshot
controls plus all Opus delivery/socket and numeric diagnostic tests pass 22/22.
Helper syntax passes. The user authorizes one actual repeat, to run after local
verification; this collector block itself claims no audio-quality fix or actual
new cause. Native/production code, Release artifacts and dependency pins remain
unchanged.

Full `pnpm check` passes build, repository ESLint/formatting and Node 762 passed /
101 profile/platform skips / 863 total, zero failures. This also covers the
recent fixed-tone and native source-diagnostic collector additions. The retained
log is `%TEMP%/freerdp-bridge-iteration369-check.log`; `git diff --check` passes.
No native rebuild is required by these lab-only JavaScript changes.
