# Iteration 260 — full tracked-source Linux export builds and deploys offline

2026-10-16. Continues the Stage 0 clean-source gate after `5f584b4`. A complete
`git archive` of that commit, rather than the curated native-only copy, was
extracted into new `build/source-checkout-QiCyLt/source` in the network-disabled
Linux verifier. Before installation it had no build, dist, node_modules, .deps,
.local-tests or .git directory. No tracked symlink or ignored laboratory file
was included. Archive SHA-256:
`94d3d8c584fb6563a516049d7076353d1ddbbdfc8453272f91a7b55109c361b4`.

Frozen offline pnpm install with lifecycle scripts disabled creates a new
workspace from the cached public store. New Release worker/addon compilation
uses external, source-rebuilt SDK `freerdp-source-clean-HC5AcL` and dependencies
`dependencies-source-clean-w2PFkb`; all three consumer CMake package origins
must match that SDK. Catch2, compiler/CMake/Ninja/vcpkg tools and cached source
inputs are reused. The external SDK and dependency receipts are checked and
remain byte-identical after the entire run.

Actual linked CTest passes 30/30. Full pnpm check builds all four TypeScript
packages, lints/formats and passes 656 / 58 platform skips / 714 with zero
failures. Actual install passes canonical ELF closure (34 files / 274 edges)
and relocation 1/1 with private codec/module origins and lifecycle cleanup.
Offline production API deploy excludes source/TypeScript/ESLint; importing the
deployed server module succeeds. The lockfile stays byte-identical and no .deps,
.local-tests or .git directory appears inside the exported source tree.

| New build artifact | SHA-256 |
| --- | --- |
| worker | `65712785447d11712374fbc2acaab9e2a296e66c730cf0068e9cc16899ddeca1` |
| IPC addon | `bceb050c30f6f07f33595698f841eb7dc1e8653ad30b1a54726000ccf3252e3e` |
| pairing manifest | `106c7a088b299cb2765186f83d330f3ece7ca0de4333323f1cbc4a5e5db51041` |

The run explicitly configures origin-relative install RPATHs, including the
addon; use this exact matching trio for further checks. The worker's Git
metadata is `uncommitted` in the source export without .git; the receipt binds
the actual commit/archive instead. Node emits existing module-type/dependency
deprecation warnings; they do not fail the checks.

Evidence: host `build/iteration-260-source-checkout.log` records each command,
argument array and working directory. Host/exported
`build/iteration-260-checkout-receipt.json` binds the generated paths and checks.
The retained bounded local orchestration script
`build/iteration-260-checkout-runner.mjs` has SHA-256
`bc621afb7b6a213020b9c1f3a64cc1b22b08b58e3aeaa0eaa990905c43923a80`.

This accepts the named complete tracked-source Linux project export against
the separately verified external source-built native chain. It is not a new
network checkout/download build, a new OS toolchain/dependency source matrix,
Windows clean export, actual CI or standard PIE sanitizer acceptance. No actual
RDP host/device is contacted; Stage 0 remains IN PROGRESS.
