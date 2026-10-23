# Iteration 294 — shared typed resident-memory sampling

2026-10-18. Prepares Stage 10's resource-watchdog requirement / SPECIFICATION
§2.12 with a shared host diagnostic after `876ecea`. Existing Linux/Windows
resident readers were local `.mjs` lab helpers. They now live in the strict
TypeScript Node package so later worker supervision can reuse their bounded
implementation. This block does not introduce resource enforcement.

## Implementation and preserved behavior

The shared module exports the platform-aware sampler, platform readers, scalar
receipt parsers and a typed fixed-code `ProcessSampleError`. Linux preserves
its fixed 16,385-byte scratch / 16,384-byte admission, PID guard, KiB-to-byte
conversion, scratch zeroing and joined file close. Its regex parser now retains
at most two matches. Windows preserves the existing colocated private helper,
schema-1 receipt, positive DWORD PID guard, two-second timeout, 128-byte output
bound, hidden execution and minimal nonsecret environment. No native helper or
dependency changes.

The existing lab scripts delegate to the typed implementation and translate
errors back to their original `LAB_PROCESS_SAMPLE_INVALID` /
`LAB_PROCESS_SAMPLE_UNAVAILABLE` messages. The Windows script's soak constants
and fixed aggregates are unchanged. The updated development instructions make
their new built-package dependency explicit for historical lab containers;
those containers are not contacted or refreshed during this work.

The host sampler returns only byte scalars and requires caller-owned process
identity/liveness. It is not a hard allocation limit, CPU sampler, global
session-memory measurement or a background watchdog. No session/API/IPC field,
capability, Release option, compiler flag or dependency version changes.

## Verification

Initial Windows focused compatibility/shared-sampler tests pass **9 / one
Linux-only skip / 10 total**. Linux focused tests pass **10/10**, including the
existing 32-read FD-return control and new repeated sampling of an actual owned
native worker. Both keep heartbeat and normal private-runtime cleanup.
Strict TypeScript build passes. Complete `pnpm check` passes on Windows
**638 / 90 platform/profile skips / 728 total / zero failures** (365.77 seconds)
and Linux **584 / 147 skips / 731 total / zero failures** (104.08 seconds),
including build/lint/format. These expanded suites also include the native
capacity, isolated exit and corrected startup-cancellation cases from 291–293.

Native foundation CTest controls pass Linux **16/16** in 6.33 seconds and
Windows **15/15** in 6.17 seconds. The Windows control restores/removes only the
existing MSVC Debug fixture's temporary build alias; no rebuild/Release change
is performed. Final working/staged diff checks pass.

Evidence: `build/iteration-294-windows-focused.log`,
`iteration-294-windows.log`, `iteration-294-linux.log` and runner
`iteration-294-run.py`. Linux reuses the existing restricted network-none /
UID1000/read-only container and GCC 13 Debug worker; Windows uses its existing
Debug foundation worker/colocated helper. The current helper/source files are
explicitly overlaid into the existing Linux workspace; no new pristine archive
or native source build is claimed.

Repeated Windows CTest log is `build/iteration-294-windows-ctest.log`.
Shared sampler source SHA-256:
`a10e89824c0c419c935ef7c483a2bef4c6c6c5df708fde39958ca41606498128`.

No RDP/DNS endpoint, physical device, external service or security investigation
is used. Stage 10's memory/CPU watchdog, connected resource/soak and wider
platform/OS-failure gates remain open. The original performance budgets and
Release/dependency profiles remain unchanged.
