# Iteration 288 — current Clang 18 Debug source export

2026-10-18. Continues Stage 0's clean-build/compiler matrix / SPECIFICATION §3.4
using a complete tracked-source archive of `3534484`. No production source,
Release setting, dependency pin or wire contract changes in this block. New
security research, fuzz campaigns and external systems remain outside scope.

## Input and environment

The 6,676,480-byte Git archive has SHA-256
`f8be34e8d0409bfe754af3110fde2d7179e35b18ef00e0a24490299ea08ae386`.
The exported source initially contains no build, node_modules, SDK, .deps,
.local-tests or .git. The prepared public Node/cache bundle from iteration 267
still matches SHA-256
`c6f64ae9ae68c3c55948ba26d7df808a962d6789c2dc540a6d4e63b4021a1591`.
Node reports 24.21.0 and pnpm 10.11.0. Frozen offline installation with lifecycle
scripts disabled succeeds; the lockfile remains unchanged.

A new local container uses the already cached
`freerdp-bridge-ubuntu-gcc12-check:264` image with `--pull never`, UID1000,
network none, read-only root, init, all capabilities dropped and
no-new-privileges. Limits are two CPUs, 4 GiB memory, 256 PIDs, executable
3 GiB build tmpfs and noexec 128 MiB /tmp. No workspace, Docker socket, SDK,
device or lab directory is mounted. Archives are hash-checked, admitted within
fixed size/member bounds and extracted into the writable build tmpfs.

## Actual checks

- All four TypeScript packages build from the new offline installation.
- The existing clean-native helper selects **Clang 18.1.3**, passes the actual
  C++20 library probe and creates new Debug foundation objects/executables.
  `BRIDGE_WITH_FREERDP` and `BRIDGE_SANITIZERS` are OFF. Prepared Catch2 3.8.1
  source is reused through disconnected FetchContent; no previous object or
  binary is copied into the new native fixture.
- Native CTest passes **16/16**, zero failures, 6.60 seconds. Framed native
  worker/clipboard lifecycle tests pass **15 / one absent-primary-transport
  skip / 16 total**. This includes actual worker spawn, HELLO/CLI, heartbeat,
  parent death, bounded output and cleanup; it is not RDP integration.
- Full `pnpm check` passes build, ESLint, Prettier and **574 passed / 147
  platform/profile skips / 721 total / zero failures**, 95.89 seconds for Node
  tests. The different platform totals reflect conditional test registration;
  absent native features/browser profiles remain explicit skips.
- Post-run comparison verifies all **1,107 archived regular files** remain
  byte-identical. The isolated native receipt binds 342 files / 1,895,221 bytes
  with source SHA-256
  `4f3f80d64c630f060bef31a041e95008f301db1c1b60e5bf52951813dc545378`;
  prebuiltOutput=false, sourceUnchanged=true and freerdpRebuilt=false.
- Worker SHA-256:
  `197ac487c47b75673a9e14ff2d19b36db078918a97aecc851d7db05a469140fc`.
  `git diff --check` and staged diff checks pass for the documentation block.

## Evidence and remaining gate

Host `build/iteration-288-run.log`, `iteration-288-receipt.json` and
`iteration-288-integrity.json` retain the results. Runner
`build/iteration-288-run.py` has SHA-256
`0ab3bd813dde9d4a4c9dc7aa9a3b3da54ae05fe1d475a847421a6ee5d8fd3cd3`.
Complete log SHA-256:
`6716502725e9f7d23d96051a191c22bd65837fd89fe768c5df08877e03747c33`.
The source fixture and native receipt remain inside the restricted local
container for follow-up inspection.

This accepts a current local Clang Debug foundation/source-export slice. It
does not establish a new OS/toolchain installation, linked Clang FreeRDP build,
actual CI, sanitizer/backend acceptance or remote RDP/device functionality.
The GNU minimum stays 12; Stage 0 remains IN PROGRESS. Release configuration
and dependency versions are unchanged.
