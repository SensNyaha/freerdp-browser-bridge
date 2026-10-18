# Iteration 296 — optional sampled native worker RSS enforcement

2026-10-18. Implements the sampled-memory portion of SPECIFICATION §2.12/§3.1
and Stage 10 resource watchdogs, following cancellable sampling in `61ec364`.
Release configuration, dependency pins and native code are unchanged.

## Change and scope

`WorkerProcess` accepts a positive trusted-host RSS cap and bounded optional
poll interval. The default remains off. One current-child query is allowed;
the three-second deadline, scalar validation and observed cap breach fail the
owned native worker with fixed resource codes. Shutdown stops future polls,
aborts and joins the current query before successful cleanup. Late results
are inert. Uncertain query retirement remains a separate close failure.
The actual native session adapter preserves only the two known resource
failure codes into static public errors. No public config/wire fields change.
[Contract](WORKER_MEMORY_POLICY.md), [sampler](PROCESS_RESIDENT.md).

## Verification

Focused Windows watchdog tests pass **10/10**. Actual native lifecycle cases
exercise a real one-byte RSS breach, repeated healthy samples under a 1 GiB
cap, omitted-policy inactivity and joined PID/runtime cleanup. Separate
synthetic probes exercise unavailable/invalid results, one outstanding query,
late completion during close, cancellable three-second deadline and uncertain
close. Unit tests check option refusal and fake-adapter error classification.
These are unconnected workers, not RDP/device integration.

Linux focused watchdog/resident checks pass **15/15**, native CTest **16/16**
(6.66 seconds), full `pnpm check` build/lint/format and Node **596 passed /
147 platform/profile skips / 743 total / zero failures** (109.72 seconds).
The existing restricted no-network GCC Debug fixture is reused with exact
changed-source overlays; no pristine checkout or new native compilation is claimed.

Windows full `pnpm check` passes **650 / 90 skips / 740 total / zero failures**
(380.42 seconds for Node tests). The ordinary build/lint/format checks pass.
Repeated MSVC Debug CTest passes **15/15** in 6.56 seconds, restoring/removing
the existing fixture alias. Working and staged `git diff --check` pass.

Local evidence: `build/iteration-296-windows-focused-final.log`,
`iteration-296-windows.log`, `iteration-296-linux.log`,
`iteration-296-run.py` and `iteration-296-transfer.cjs`.

Periodic RSS cannot bound between-sample/startup/private/Node-total memory or
CPU. Kernel I/O retirement may outlast the failure deadline. Complete OS-fault,
connected resource/soak and remaining abnormal-exit gates stay open. The user
restored lab access while these local suites ran; subsequent RDP evidence is
recorded separately in iteration 297.
