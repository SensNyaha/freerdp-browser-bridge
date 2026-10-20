# Iteration 340 — session-manager remote failure snapshot

2026-10-20. Verifies that a recognized `RDP_SESSION_REPLACED` worker failure
passes through the Stage 2 manager into the terminal session snapshot with its
fixed code, message and retryability. This catches accidental conversion of
new recognized RDP codes to generic `WORKER_FAILED`. The test uses an explicit
fake backend and does not claim native or remote RDP emission.

The focused manager case passes **1/1**. Node package build, focused ESLint,
Prettier and `git diff --check` pass under the available Node 22.22.0. Full Node
24 acceptance remains open as recorded in [iteration 332](ITERATION_332.md).
