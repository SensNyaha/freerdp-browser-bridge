# Iteration 30 — public touch lease and browser capture

Date: 2026-10-10. Implements SPECIFICATION §2.5, PROTOCOL §3 and ARCHITECTURE §7
under ADR-008 / ADR-009 / ADR-011. Experimental opt-in remains default false.

Touch now uses the current control lease and existing 64-slot input serialization.
Admission and delivery validate readiness and display generation; stale queued
controllers cannot dispatch. Replacement input follows the release reset barrier.
NativeSessionWorker forwards readiness and typed semantic refusals. Control WS
replays decimal epoch metadata; pause/refusal preserves the session without replay.

The browser captures separate touch Pointer Events with bounded contact ownership,
scaled/clipped coordinates and rendered-generation gating. Cancel/lost capture is
per contact; blur/visibility/dispose/readiness/display change clears local state
and resets native ownership. Touch is not mapped to mouse. Manual local viewer
opts in; ordinary session configuration remains explicit. The harness serves the
new metadata module through its existing same-origin route.

Verification: narrow touch suite **5/5**: exact control shape/u64 bounds, matching
Node/browser metadata validation, rendered ownership, queued readiness and lease
checks, typed WebSocket pause, and actual Edge emulated two-contact capture/move/
cancel/blur/unavailable behavior against a fake backend. No real remote contact
or physical touch device is claimed. Native lifecycle/fake IPC and actual XRDP
negotiation evidence are separate in [Iteration 29](ITERATION_029.md).

The fake native adapter additionally verifies public lease → NativeSessionWorker
→ private IPC, capacity/transition refusals without session failure, and reset
before replacement-controller reuse. Narrow adapter/registry suite: **15/15**.
An outdated generic unsupported-command fixture was updated to clipboard.request;
touch now has strict command validation and its own positive/refusal tests.

Bundled pnpm check: **139/139**, no skipped/cancelled tests, **102.74 s**. Strict
TypeScript, lint, formatting and the full native/fake/Edge lifecycle regressions
passed. Bundled CTest **10/10**, foundation **4/4** also passed; this block changes
no native implementation. Existing private native package remains unchanged.
Logs are
Git-ignored build/iteration-030-*.log. Actual device/application touch, no-stuck
remote release, timestamp/v1.0 and reopening compatibility, host/reassembly audit,
Linux/sanitizers/soak and other Stage 5 acceptance gates remain open.
