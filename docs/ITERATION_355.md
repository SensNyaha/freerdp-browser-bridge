# Iteration 355 — pinned licensing ERRINFO classification

2026-10-20. The Node native-session adapter now classifies the eleven
protocol-independent FreeRDP 3.32.1 licensing ERRINFO values as the fixed
`RDP_LICENSE_FAILURE` public error. This separates licensing failures from
generic disconnects while keeping numeric FreeRDP diagnostics private. Unknown
ERRINFO values and non-disconnect error classes keep their previous behavior.

The `SessionError` contract and session API documentation describe the new
fixed 502 message and retryability. Tests cover all eleven numeric values,
adapter-level publication, fixed session error fields and propagation through
`GET /v1/sessions/:id`. Actual server emission of licensing reasons remains
unverified. Full `pnpm check` passes: build, lint and format are clean; Node
reports 748 passed, 101 skipped, zero failures (849 total). No native wire
record, Release setting or dependency pin changed.
