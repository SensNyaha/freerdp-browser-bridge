# Iteration 384 — retain capacity through unconfirmed cleanup

2026-10-21. Continues TODO Stage 1 forced-completion / configured-capacity work
and SPECIFICATION §3.1 lifecycle ownership. The historical
[56](ITERATION_056.md) wait was bounded, but its finalizer released capacity
after rejected, absent or still-pending termination completion. Repeated
cleanup failures could therefore admit replacements without knowing that
preceding workers/resources had retired.

Bounded API waiting now remains distinct from resource proof. The existing
global/per-principal reservation releases only after graceful close (including
its manager-owned close work) or a valid forced-retirement completion fulfills.
Unconfirmed cleanup keeps its reservation after the waiting deadline and logical
`closed` snapshot. Rejected, throwing, `void` or non-promise termination is not
confirmation. Existing successful-close and successful-termination paths keep
their normal release. A late successful completion releases once and runs the
existing retention pruning; failed completion diagnostics are discarded.

At most two completion observers are retained per owned entry, with no new
polling timer or history. Unconfirmed entries cannot be pruned by ordinary
terminal retention, and existing admission bounds prevent new factories from
exceeding either ownership limit. `statistics().active` counts those resource
reservations, including logically closed sessions. No new public option,
protocol/error field, default wait, native source, Release setting/artifact or
dependency pin is introduced. No RDP/device/source or external system is used.

Three isolated failing-before cases show capacity dropping to zero for
pending, rejected and `void` termination despite missing retirement proof.
The original log remains `build/iteration-384-retirement-before.log` (3 failures).
The first corrected manager focus retains one obsolete expectation that rejected
termination should free capacity. That assertion is updated to require the
stronger ownership invariant; its original result remains
`build/iteration-384-focus-first.log`.

Seven new synthetic cases cover pending/rejected/void/throwing/non-promise
termination, late graceful/forced confirmation, retention aging, pre-factory
refusal, replacement, two rejected completions and healthy-principal isolation.
Existing confirmed-termination and manager tests remain. Combined manager /
startup / timer focus passes 33/33 in 3.26 s, with strict workspace build.
Evidence: `build/iteration-384-build.log`, `iteration-384-focus.log`.

One separate composed test passes with a real Windows framed native worker and
a held test-only completion gate. Forced wait expiry leaves capacity reserved,
refuses a new factory, and actual native close joins PID/runtime retirement.
Only then does releasing the synthetic confirmation permit a normal replacement
worker, heartbeat and joined close. All owned native children and runtime files
retire in test cleanup. This is controlled delayed completion, not an actual
kernel failure or connected RDP acceptance. Evidence:
`build/iteration-384-native-focus.log` (1/1, 0.96 s).

Current unchanged native CTest passes 17/17 in 7.38 s through the temporary ASCII
alias, removed afterwards. Evidence: `build/iteration-384-native-ctest.log`.
Full Windows foundation `pnpm check` passes 835 / 102 profile/platform skips /
937 total, zero failures, in 490.70 s on receipt-bound `native-clean-u8LktC`
output. Evidence: `build/iteration-384-check.log`. Post-check audit verifies all
353 native source files, both native outputs and seven protected inputs;
`git diff --check` passes. Original Release and pinned inputs remain protected.

Physical uncertain-resource reclamation, simultaneous hard kill, hard OS-close
bounds, wider legacy backend adoption, connected resource faults and complete
Stage 1/10 acceptance remain open. A bounded wait cannot create retirement proof;
an uncooperative backend can keep its slot until it confirms cleanup or the
manager is stopped. Stopping the manager is not proof of OS resource retirement.
This relies on the existing trusted-backend contract: fulfillment must mean
resource retirement. The manager does not independently certify an arbitrary
backend's completion claim.
