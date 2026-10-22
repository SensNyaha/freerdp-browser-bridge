# Iteration 416 — RED OS static-channel failure diagnosis

2026-10-22. Branch `fix/redos73-xrdp-receive`, based on `b5d56a3` from
`feature/astra17-gcc83`. Requirement: actual RDP acceptance on mandatory
RED OS 7.3 before the requested 0.2.0 release. This block identifies a failure;
it does **not** repair or accept the RED OS RDP profile.

## Current source location

At the user's request, the repository root is now the active development
worktree on this fix branch. It contains all committed GCC 8.3 source changes
and the current tracked C++ changes. The prior root branch
`feature/managed-drives` remains intact at `e94891b`; the former fix worktree
is detached and its duplicate edits are retired only after the copied root
files match SHA-256. Historical compiler worktree commits belong to the same
shared Git object database, but locating that working copy inside ignored
`build/` made changes hard to review. Further source edits use the root.
Build directories retain generated artifacts and logs. Shared `master` is
not merged while required acceptance remains incomplete.

## Actual failure and bounded diagnostics

The user confirms the RED OS node's exact RDP certificate and prepares an
unsaved editor. Read-only SSH inventory over the original confirmed host key
identifies RED OS 7.3 and installed XRDP **0.10.6.1-1.el7**. No server
software/service/configuration change or application launch is performed.

Actual public Edge H.264 and JPEG attempts activate and receive a first frame,
then terminate with `RDP_PROTOCOL_ERROR`, before test input or clipboard writes.
Disabling dynamic resize in a separate JPEG control does not remove the failure.
Direct native controls also fail while idle without any resize/input request;
FreeRDP's native error remains zero. Cleanup succeeds.

The existing code-owned `bridge.rdp.failure` diagnostic is extended with numeric
SVC ID, public lookup IDs for drdynvc/rdpsnd/cliprdr/rdpdr, flags and actual/total
lengths of the rejected callback. No payload, channel name, application content,
authentication field or upstream free-text error is retained. State lives on
the serialized RDP thread and only the existing failure diagnostic emits it.
Protocol admission, bounds and public error mapping are unchanged.

The final actual RED OS control identifies:

| Scalar | Value |
| --- | --- |
| Diagnostic stage | 11, terminal retirement observation |
| Outer receive guard failed | 1 |
| DVC assembly / registry / plugins failed | 0 / 0 / 0 |
| Rejected SVC / rdpsnd ID | 1005 / 1005 |
| drdynvc / cliprdr / rdpdr IDs | 1006 / 0 / 1004 |
| Flags | 3, FIRST and LAST |
| Actual / total bytes | 52 / 52 |

This narrows the failure to RDPSND routing/validation/delegation. It does not
establish the exact rejected PDU or justify bypassing the guard. The public
pinned FreeRDP loader can add a fake RDPSND channel for device-redirection
dependencies even with browser audio disabled; whether this explains the
observed rejection still needs a targeted control. A previous GCC 12 container
control fails before native startup and provides no compiler-regression verdict.

## Verified build and package

A new clean-source GCC 8.3 Release consumer builds with the exact existing pinned
SDK and dependency receipts. It passes CTest **37/37** and actual Node
IPC/lifecycle/protocol fixtures **40/40**, zero skips, **27.33 s**. Native source
is 369 files / 2,024,974 bytes, SHA-256
`e7d8309772fc6156cbafc9c24f1f16fd8d17fbb184850a45e051e80c5eb51fe9`.
Worker SHA-256:
`a3e571bd88dda42c310b7b256d5cc9bec02a2049e9c217c0de520f2487760e52`.
The clean snapshot/receipt preserves the exact bytes before the root worktree
relocation; copied root C++ edits are hash-checked against their prior worktree.

Full `pnpm check` passes **877 / 87 skips / 964 total**, zero failures,
**220.74 s** for the test suite, including version/build/lint/format checks.
The separate installed diagnostic package passes strict private-runtime closure
**34 ELF files / 333 resolutions** and real relocation **1/1**. Its archive
SHA-256 is `7e497eadfa2e4708d65c5f0418ff3889ffcec904072be9651ad3e4ca742aa976`.
It does not replace the final iteration-411 package or stable MVP artifacts.

The earlier diagnostic checkpoint also passes CTest 37/37, focused Node 40/40,
full Node 877 / 87 skips / 964 and relocation. One full check stops on an
unformatted temporary test adapter accidentally placed under scripts; removing
only that owned adapter restores the tracked-source check. A staging shell's
CRLF causes its trailing hash command to fail after relocation passes; the final
runner uses LF. Attempts to run a build-tree consumer without private DSO paths,
or to add bridge networking to a `network none` compiler container, fail before
the intended RDP check. Separate installed runtime containers resolve those
test prerequisites without altering the compiler container or product guards.

Evidence includes `iteration-414-*` failed/control logs and
`iteration-416-gcc83-receive-diagnostic.log`,
`iteration-416-gcc83-full-check.log`, `iteration-416-diagnostic-package.log`,
`iteration-416-redos-channel-diagnostic.log` and
`iteration-416-redos-xrdp-version.log` under ignored root `build/`.
The [real Astra desktop profiles pass separately](ITERATION_415.md).
No shared merge, RED OS desktop acceptance or 0.2.0 tag is accepted here.
