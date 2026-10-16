# Iteration 265 — complete tracked-source Windows export

2026-10-16. Continues Stage 0 with a complete `git archive` of `2885a57`,
SHA-256 `aabca591dd1c0705658dc778f4d6af0ac3a4f4a2f3329d7368fe629b0a14cc09`.
The new `build/source-checkout-PBeAQy/source` initially contains no build,
dist, node_modules, .deps, lab files or .git. It uses the separately verified
Windows source-built SDK `freerdp-source-clean-MpfPs4` and cold dependencies
`dependencies-source-clean-MypULr`, prepared MSVC/CMake/Ninja/Catch2 and the
cached public pnpm store. No native source or compiled project output is reused.

Frozen offline Node installation with lifecycle scripts disabled installs all
152 public packages. A new Release build completes 401 Ninja steps; the actual
C++20 library probe and linked CTest **30/30** pass. All three native CMake package
origins match the selected SDK. Full pnpm check builds four TypeScript packages
and passes **663 / 49 platform skips / 712**, with zero failures. Actual install
and relocation **1/1** check private modules/codecs, directory helper and worker
lifecycle with minimal PATH. Offline production API deployment includes 57
dependencies, excludes source/TypeScript/ESLint, and imports its server module.
The lockfile and both external native input receipts remain byte-identical.

| New build artifact | SHA-256 |
| --- | --- |
| worker | `f7c04766aeaddb4144a77fc13ee98ee467654c3c8f6cf7209915e3723c0d380e` |
| directory helper | `0ad2362e152e6a6afb0d6263a39daebbc966a6a9012b32ae8857b9f4420dcaca` |

Retained setup failures explain the accepted run's corrections:

- The first isolated fixture used an empty default pnpm store and refused an
  offline cache miss. The new fixture selects the existing public store at
  `build/node-production-store`; no online fallback is used.
- Passing `--store-dir` before the bare `check` script alias made pnpm interpret
  the directory as a command. The resumed run supplies `npm_config_store_dir`.
- Running Node entry modules through the temporary `R:` CMake alias produced
  **648 passed / 49 skips / 15 failures**. pnpm junctions resolve dependencies to
  physical `D:` paths, creating duplicate ESM instances of SessionError and
  ProtocolError. In the same alias context, direct class identity checks are
  false through `R:` and true through `D:`. A controlled Unicode control test
  fails through the alias and passes through the physical path. The accepted
  full run uses `fs.realpathSync.native()` for Node project, test and binary paths;
  the ASCII alias remains available for CMake. Production error checks are not
  weakened. A maintained driver correction is verified separately in iteration 266.

Evidence: `build/iteration-265-windows-checkout.log`,
`build/iteration-265-windows-checkout-repeat.log`,
`build/iteration-265-windows-checkout-resume.log`,
`build/iteration-265-module-identity-repeat.log`,
`build/iteration-265-alias-regression.log`,
`build/iteration-265-unicode-alias.log`,
`build/iteration-265-unicode-canonical.log`,
`build/iteration-265-windows-checkout-canonical.log`, and
`build/iteration-265-windows-checkout-receipt.json`.

This accepts the named complete tracked-source Windows project export against
prepared tools/public caches and the external source-built native chain. Together
with iteration 260 it covers both local project-export platforms. Fresh OS/distro
toolchains, network checkout/download, actual CI, linked/upstream sanitizers and
RDP/device/release acceptance remain separate; Stage 0 stays IN PROGRESS.
