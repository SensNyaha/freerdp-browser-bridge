# Iteration 266 — physical Windows paths for Node native-build tests

2026-10-16. Implements the Stage 0 test-driver correction identified by the
complete Windows export in [iteration 265](ITERATION_265.md). Loading workspace
entry modules through a temporary SUBST drive while pnpm junctions resolve
dependencies to the physical drive creates different ESM instances of the same
error class. This breaks constructor checks and downstream error classification.

`test-native-clean-build.mjs` now resolves the Node child project directory,
test entry paths and BRIDGE_TEST_BINARY_DIR with `fs.realpathSync.native()` on
Windows. Linux paths are unchanged. CMake's ASCII alias and the SDK/source
receipt namespaces remain intact. No production error check, runtime wire
contract or public capability changes.

A bounded Windows integration test creates its own free SUBST alias, uses the
same helper as the driver, and loads a subprocess probe through the resulting
physical path. The probe checks exact SessionError and ProtocolError identity
between direct workspace imports and pnpm dependency junctions. The test releases
its owned alias; it uses no RDP host, credentials, devices or OS clipboard.

Verification:

- New Windows alias/identity case **1/1**; Linux front-door cases **3 passed /
  1 Windows skip / 4**.
- Actual `native-build.ps1 -Task clean-bundled` with rebuilt SDK receipt
  `build/freerdp-source-clean-MpfPs4/receipt.json` creates
  `build/native-clean-UYk7Zc`: new MSVC build, actual C++20 probe, linked CTest
  **30/30**, Node process/TLS/identity **27 passed / 1 skip / 28**.
- Full Windows pnpm check **664 passed / 49 platform skips / 713**, zero failures.
  It uses this new consumer's binaries through their physical paths.
- Full Linux pnpm check **657 passed / 59 platform skips / 716**, zero failures,
  with the verified GNU 12.2 linked consumer `native-clean-pX9Xo8` (CTest 31/31
  from iteration 263). Its binaries and native sources are unchanged by this fix.
- Formatting and `git diff --check` pass.

The new native source fixture retains 330 files and source hash
`6006c5a835210a2e9e8e977e8663be67d430094c83dd201c8e14b9aa82eeb83d`.
Its worker SHA-256 is
`7a83e444f34fbdf731dcde530a1388687e8337542fb88e4570371d0a8be3b7dd`;
directory helper SHA-256 is
`464e8ef0f77015532a9a7c497fae7b0e2398afb3ebe5d4cc125ebad637955e62`.
SDK/dependency receipts and selected feature inventory remain bound and unchanged.

Evidence: `build/iteration-266-windows-module-paths.log`,
`build/iteration-266-linux-frontdoors.log`,
`build/iteration-266-windows-native-driver.log`,
`build/iteration-266-windows-full-check.log`,
`build/iteration-266-linux-full-check.log`.

This accepts the maintained local Windows Node driver correction. Fresh OS/distro,
actual CI, linked/upstream/addon sanitizer and RDP/device/resource gates remain
open. The separate GCC 12 minimum is unchanged.
