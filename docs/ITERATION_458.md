# Iteration 458 — archive decision and project cleanup

2026-10-24, branch `chore/project-cleanup-0.2.5`, following accepted public
0.2.5 delivery and merge `ac725ee84e8f7097e1e8f037d7fabf61cf97f463`.
[Public delivery evidence](ITERATION_457.md).

## Explicit historical release decision

The user chooses to **retain 0.2.3 as archived**: its seven absent JS versions
will not be published to npm; complete public 0.2.4/0.2.5 suffice. This closes
the earlier publication decision by an explicit scope change, not by claiming
that 0.2.3 was fully published. Both existing runtime versions remain public.
Its immutable tag, original source, nine accepted archive bytes and audit
remain preserved. No repacking, unpublish, tag movement, manual stage/approve
or token workaround is authorized by this decision.

Current README, TODO, version policy and npm/HTTP guides record that distinction.
Historical iteration reports keep their original checkpoints and link forward.

## Cleanup inventory and current limits

Local no-follow inventory visits 882631 entries across build, tools, dependencies
and node_modules, totaling 44756927510 logical bytes (hard-link sharing is not
deduplicated). Receipt: `build/iteration-458-filesystem-inventory.json`.
There are 235 build directories. This is an inventory, not evidence of deletion.

Preserve the active Node/pnpm, pinned dependency/FreeRDP SDK, current native
worker, exact release archives, final standalone files, source receipts and
needed compiler/browser fixtures. Preserve all Git worktrees and histories
until their status and unique commits have been checked. Keep unrelated Docker
resources outside this cleanup.

The Docker size/mount inspection for temporary `freerdp-bridge-rpm-453` and
`freerdp-bridge-payload-449` did not execute: automatic approval review hit a
usage limit. That is a review-service failure, not an unsafe-action finding.
No bypass is attempted. Later ordinary review succeeds; the verified Docker
cleanup below supersedes that initial interruption. No image prune is used.
Deletions require exact resolved workspace paths and preservation checks first.

Cleanup and documentation consolidation are still in progress. After their
acceptance, continue TODO features on separate branches under the user's latest
direction; the goal is not complete and no desktop GUI is planned.

## First verified local cleanup block

Nine obsolete native-build directories are removed only after resolving their
absolute paths inside this workspace's build directory and scanning every
entry without following links. The preflight refuses links, special files,
Git metadata, private lab directories, changed inventory and missing/mismatched
receipts. The first preflight encounters a directory without a receipt and
stops before deletion; that directory is excluded and preserved. No acceptance
condition is weakened to delete unknown files.

Removed directories: native-clean-hHO2vQ, 4ZhORq, PUICs8, 7UfcdO, zR42jW,
qRtFwb, u8LktC, whWrt6 and SVB6FO (each has the native-clean- prefix).
They contain **10169167300 logical bytes**. This is not a measurement of physical
disk space freed: filesystem compression/hard links can change that amount.
Receipts, SDK features and available CTest results are copied and hash-verified
before deletion under build/retained-evidence-458/obsolete-native/. Historical
reports' old build paths now refer to removed reproducible outputs; their
preserved receipts and source history remain the evidence.

Post-delete verification confirms all nine targets absent, all retained evidence
copies unchanged, nineteen accepted 0.2.3/0.2.5 npm archives and eight final
distribution/checksum files unchanged, current native artifact hashes correct,
and canonical FreeRDP/dependency SDK and Node/pnpm still present.
[Compact retained cleanup receipt](evidence/CLEANUP_458.json).
Git worktrees, canonical toolchains and local lab data are untouched.

## Verified temporary-container cleanup

The normal approval service becomes available again. Fresh inspect confirms
both completed packaging containers have zero mounts and only an idle tail
process. The first process preflight requests a Docker top format without PID;
Docker refuses that format before any stop/remove. The corrected read requests
PID and executable name only and proves both containers idle.

Before removal, six bounded build/inventory receipts are copied locally and
verified. In particular, the two 4208-file Linux inventories still match exactly.
They are retained under build/retained-evidence-458/container-payload and
container-rpm. Both containers are stopped and removed by exact names, with
absence verified afterwards. Their writable layers total **4931981312 logical
bytes**; this is not a physical disk-space measurement.

GCC 8.3 and browser validation containers are preserved. The unrelated tasks,
metube and stirling-pdf containers have identical IDs, images and running/stopped
state afterwards. No images or volumes are removed; no global prune runs.
Canonical builder images remain useful for subsequent releases.
[Compact Docker cleanup receipt](evidence/DOCKER_CLEANUP_458.json).

## Documentation consolidation

The entry README now focuses on release status, choosing a distribution,
installation, capability boundaries and development rules. The previous text
is preserved in [the historical README](history/README_BEFORE_458.md): relative
links alone are rebased. Reversing that transformation reproduces the original
text exactly (source README at commit 6ec82e1).

[Documentation map](README.md) groups the detailed documents into six topics:
status/choice, application integration, standalone operations, architecture,
development/releases and historical evidence. The concise
[standalone install guide](STANDALONE_INSTALL.md) collects the platform commands,
configuration, restart, upgrade and uninstall behavior from the actual installer
recipes and accepted installed-service checks. Detailed normative contracts and
iteration reports stay intact. Historical development commands explicitly
require a fresh current receipt after old build outputs are removed.

Further cleanup remains open: other old build outputs, publication worktrees and
scattered temporary helpers need their own preservation/ownership audit. This
block does not claim that the entire project cleanup or the overall goal is done.
