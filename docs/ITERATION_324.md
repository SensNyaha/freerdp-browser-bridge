# Iteration 324 — custom profile in the manual WEB form

Requirement: SPECIFICATION §2.10 / existing CONFIG_SCHEMA custom quality profile
and TODO Stage 9 manual connection controls. The backend already accepts custom;
the form now offers it as “Свои параметры” rather than requiring callers to
select a preset when entering explicit appearance settings.

With all six controls inherited, the form emits only profile custom and maxFps;
no appearance boolean is injected. The existing resolver therefore selects no
appearance preset. Explicit overrides and old-worker refusal retain the existing
contract; encoder defaults and FPS ceilings remain unchanged. No new API/wire
field, native change, storage or dependency/configuration change is introduced.

Focused Windows checks pass **8/8**: all four profiles with inherited fields
agree with the strict schema for true/false/missing capabilities. Both actual
Edge/synthetic HTTP scenarios switch from the balanced connection to custom
with empty appearance controls and verify exact custom/20 FPS POST contents,
including the old backend. Existing ownership, authorization, password clearing
and cancellation checks remain. This is form/HTTP verification; actual native
custom projection and Windows connection remain separately in
[iteration 321](ITERATION_321.md), and actual balanced Windows/Edge form
integration in [iteration 323](ITERATION_323.md).

Linux focused checks pass **6 / 2 Edge platform skips**; full `pnpm check`
passes build/lint/format and Node **666 passed / 154 skips / 820 total / zero
failures** (137.29 s). This is foundation/common coverage, without Linux linked
RDP. Native source and binaries are unchanged, retaining the iteration-322
CTest 32/32 Windows / 17/17 Linux baseline; it is not claimed as rerun here.

Full Windows `pnpm check` passes build/lint/format and Node **766 passed /
51 skips / 817 total / zero failures** (574.90 s), against the unchanged
iteration-321 linked worker. Logs are retained as `build/iteration-324-{focus,
windows-full,linux-full}.log`. Original protected inputs/artifact hashes,
local documentation links and `git diff --check` pass. Release configuration,
dependency pins and all broader appearance/platform/visual-policy/budget gates
remain unchanged. No new actual RDP run is claimed by this form-only change.
