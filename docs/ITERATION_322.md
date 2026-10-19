# Iteration 322 — capability-gated WEB appearance controls

Requirement: SPECIFICATION §2.10, existing CONFIG_SCHEMA quality booleans,
TODO Stage 9 and the manual WEB example. Builds on the accepted native and
Windows connection slice in [iteration 321](ITERATION_321.md).

The manual form now exposes wallpaper, font smoothing, desktop composition,
full-window dragging, menu animations and themes. Each select defaults to
profile inheritance, with explicit enabled/disabled alternatives. Inheritance
omits its optional boolean; disabled sends false, preserving preset override
semantics. Actual performanceSettings capability enables controls. Old/missing
capabilities leave them disabled with a short unavailable explanation, preserving
the existing encoding-only profiles. Form conversion independently refuses
unsupported explicit selections and malformed values before a session request.
No persistence, protocol/schema, native build configuration or dependency change
is introduced.

## Verification

Focused Windows checks pass **8/8**: six pure builder/ownership cases and two
actual Edge/synthetic HTTP scenarios. All six fields exercise inherited/true/
false values, malformed strings/types and false/missing capabilities. The strict
session schema accepts the resulting booleans. Edge checks all six alternating
booleans in the actual POST body, disabled controls on an old backend, inherited
omission after disconnect, active-form locking, authorization refusal, password
clearing, late-create cancellation/deletion and empty browser storage. Both
synthetic form snapshots are retained under `build/iteration-322-form-*.png`.
The capable layout was visually inspected; labels and controls remain readable.

The unchanged Windows linked source consumer from iteration 321 passes CTest
**32/32** (20.23 s); the unchanged Linux GCC 13 Debug foundation passes **17/17**
(6.80 s). Linux focused checks pass **6 / 2 Edge platform skips**; full
`pnpm check` passes build/lint/format and Node **665 passed / 154 skips / 819
total / zero failures** (133.70 s). Linux remains foundation/common coverage,
without linked RDP. Original native/SDK/dependency receipts, seven protected
inputs and old/current worker/helper hashes remain unchanged. Existing actual
module-origin/codec checks still bind the original iteration-321 inputs.

Full Windows `pnpm check` passes build/lint/format and Node **765 passed /
51 skips / 816 total / zero failures** (531.56 s), using the unchanged linked
worker from iteration 321. Logs are retained in `build/iteration-322-{focus,
windows-full,windows-ctest,linux-full}.log`. Local documentation links and
`git diff --check` pass. The existing Node module-type inference warning for
imported harness JavaScript remains; it is separate from lint/test failures.

These are browser/HTTP fixtures and ordinary native regressions. No RDP
connection, server visual-effect readback, remote application/device action or
new actual-platform acceptance is inferred. The four actual Windows connections
and public SDK projection remain separately recorded in iteration 321. Server
policy/effects, full browser-to-RDP appearance integration, Linux linked/wider
profiles, complete budgets and unrelated TODO gates remain open.
