# Iteration 287 — incremental preparation of the libusb test copy

2026-10-18. Continues the Stage 0 reproducible-build gate / SPECIFICATION §3.1
after completing iteration 286 in `5427e70`. This is a local CMake build-system
correction for the isolated descriptor fixture. It adds no security research,
fuzz campaign, external-system connection, RDP or device access.

## Requirement and correction

The fixture applies `interface-ownership.patch` during configuration through
`execute_process`. CMake already tracks the copied original files through
`configure_file`, but the patch was not a configure dependency. Editing that
patch followed by ordinary `cmake --build` therefore left the previous prepared
descriptor in use. An explicit manual reconfigure worked; an incremental build
did not necessarily test the current patch.

The fixture now registers the exact patch in `CMAKE_CONFIGURE_DEPENDS`. Ninja
automatically reruns configuration and regenerates the private source copy
when the patch changes. The original source/hash guards, compiler options,
default-OFF fuzz targets, dependency versions and Release configuration remain
unchanged. This does not adopt the descriptor correction in production.

The new `usb-patch-reconfigure` CTest uses a private project/build directory.
It configures and builds once, changes only a comment in its copied patch,
runs ordinary build, checks the corresponding prepared-source bytes, restores
the patch, rebuilds and checks exact restoration. A final incremental build
must succeed, and the original descriptor hash must remain unchanged. It never
edits the tracked project or original dependency. Each child command has a
60-second bound; the complete CTest has a 120-second bound and parallelism two.

## Verification

- The exact final regression script against the iteration-286 fixture fails
  with `Prepared descriptor did not follow changed patch`, proving the missing
  dependency. The first exploratory invocation had an incorrectly quoted
  PowerShell `-D` path and is retained separately; the corrected invocation
  and final-script control reach the intended assertion.
- Fresh GCC 12.4 Debug build: full standalone CTest **4/4**. Repeating the new
  focused test against its already populated directories passes **1/1**.
- Fresh Clang 18 Debug build: full standalone CTest **4/4**. The same focused
  repeat passes **1/1**. Existing BOS values (105 checks), ownership input and
  corpus (150 inputs / 317 checks) continue to pass with ASan/UBSan.
- Both profiles retain three instrumented compile commands, fuzz targets OFF,
  original descriptor SHA-256
  `4e80077f28a033ba07befceac0347a64ea0e23c34c93b96cfaf8b188d69e401d`
  and prepared descriptor SHA-256
  `363fac348e7d2024d7de75f179f1516ad1279991a4adbd5228a1ec19170b5d2b`.
- `git diff --check` and staged diff checks pass.

The same-turn full common controls were completed before `5427e70`: linked
bridge CTest **31/31** and Windows `pnpm check` **628 passed / 90 skips /
718 total / zero failures**, including TypeScript, lint and formatting.
They are not repeated for this standalone build-graph/test-only follow-up:
root native code, Node sources, protocols, runtime dependencies and application
binaries are unchanged. The new focused/full standalone suites above test
the actual changed CMake project. No additional platform or device acceptance
is inferred from those common controls.

Tests use the existing local UID1000 container with network disabled, read-only
root and its writable bounded build tmpfs; restrictions remain unchanged.
Host `build/iteration-287-review.log` retains both the expected failing-before
control and successful GCC/Clang builds/tests. The runners are
`build/iteration-287-review.py` and `build/iteration-287-transfer.cjs`; earlier
diagnostics remain in `iteration-287-before.log` and
`iteration-287-before-retry.log`.

Stage 0 remains IN PROGRESS. Shared libusb/eudev/backend instrumentation,
production adoption, remaining dependencies/addon/platform/CI and actual
RDP/device/resource acceptance remain open as recorded in iteration 286.
