# Iteration 261 — Ninja tracking checks the SDK consumed by the worker

2026-10-16. Stage 0 verification correction after `d37c2a4`. The Windows Ninja
fixture already checked the worker's header dependencies and exact copied DLL
hashes, but its two C-only FreeRDP object queries still used the ordinary
`build/freerdp-local` tree even for an isolated source-built SDK consumer. The
previous full suites therefore did not establish those two new SDK objects'
feature-header dependency tracking.

The fixture now derives the supported SDK build layout from the consumer's
actual rebased private prefix. It reads that SDK cache, checks its install
prefix matches the worker's input, and queries `gfx.c.obj` and `h264.c.obj` in
that SDK's output. Header paths are rebased through the SDK's own cached output
directory after alias removal. Unknown layouts refuse instead of using another
SDK. Portable path cases cover the new source-built and ordinary layouts plus
foreign-layout refusal. No production code or protocol changes.

Actual Windows new-SDK focus passes 4/4, and ordinary prepared-SDK backcompat
passes 1/1. Full Windows pnpm check passes 663 / 49 platform skips / 712 with
zero failures. Linux portable focus passes 3 / one Windows skip; full Linux
check passes 657 / 58 / 715, zero failures. Native binaries remain those already
verified by CTest 29/29 Windows and 30/30 Linux in iterations 257/258.

Logs: `build/iteration-261-ninja-current-sdk-final.log`,
`build/iteration-261-ninja-prepared-sdk.log`,
`build/iteration-261-windows-full-check-repeat.log`,
`build/iteration-261-linux-focus.log`,
`build/iteration-261-linux-full-check.log`. The first full Windows invocation
stopped at formatting of the new fixture; Prettier corrected it before the
successful narrow/full repeats. The original passing query of the old tree is
retained in `build/iteration-261-ninja-before.log`; it is not evidence for the
new SDK objects. Broader Stage 0 distro/CI and product gates remain separate.
