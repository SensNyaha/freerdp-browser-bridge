# Iteration 299 — precise core lab result acceptance

2026-10-18. Continues the actual connection acceptance checks in TODO Stage 3
and SPECIFICATION §3.2 after the restored lab regression. The old core helper
waited for any failed/connected state and only checked success in connect mode.
Consequently its strict-mode exit code alone could accept an unrelated connect
or authentication error. Iteration 297's retained strict result was the correct
certificate rejection; this correction strengthens future runs.

The shared lab-only result classifier now requires failed plus exact
`RDP_CERTIFICATE_REJECTED` for strict, code-owned inspected state for inspection,
and connected plus `NONE` for connect/memory. Every mismatch has one fixed
error, without forwarding the candidate diagnostic. Strict also requires
heartbeat after the expected rejection, matching the existing transport helper.
No production/native/Release or dependency configuration changes occur.

Three new unit cases cover correct named outcomes, unrelated failure/partial
states, inconsistent connected errors, unknown modes and fixed diagnostics.
Together with the existing transport-options test they pass **4/4**. All four
actual Windows helper modes pass sequentially on the authorized RDP lab using
the existing exact fingerprint; memory mode observes 26 connected 1080p samples
with peak **158,703,616 bytes**, heartbeat/JPEG and empty runtime.

Evidence: `build/iteration-299-focused.log`,
`iteration-299-lab-{strict,inspect,connect,memory}.log`,
`iteration-299-lint.log` and `iteration-299-format.log`. Whole-workspace lint
and format checks pass; working/staged `git diff --check` and local links pass.
The full Windows build/Node baseline immediately preceding this lab-only change
is iteration 298 (650 passed / 90 skips); it is not represented as a new full
653-test pass. Native CTest remains iteration 296's unchanged baseline.

This is acceptance-tool correctness, not new certificate policy, persistent
trust or new security research. Other lab/application/device/audio and wider
platform/resource gates remain unchanged.
