# Iteration 335 — public RDP failure envelope

2026-10-20. Verifies the public `SessionError` envelope for the selected RDP
timeout, logoff and server-refusal codes. The mappings preserve fixed HTTP
status, fixed text and retryability: server timeout is 504/retryable, logoff is
502/retryable, and server policy refusal is 502/not retryable. The API exposes
no FreeRDP numeric diagnostic. Connection/authentication codes keep their
existing fixed envelope. No wire, worker or session schema change is made.

The new focused session-manager assertion passes **1/1**. The node package
TypeScript build, focused ESLint/Prettier checks and `git diff --check` pass
using the available Node 22.22.0. Full repository Node 24 execution remains
unavailable for the reason recorded in [iteration 332](ITERATION_332.md).
This verifies public error construction; it does not claim an actual remote
server emitted each reason.
