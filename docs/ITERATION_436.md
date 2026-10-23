# Iteration 436 — aligned 0.2.4 release preparation

2026-10-23, separate `release/0.2.4`, after accepted Express feature
`3c13ff6` ([iteration 435](ITERATION_435.md)). Documentation correction
`7ca93de` explains transitive shared JS packages and fixes the Express guide's
omitted explicit platform runtime. That omission was found after feature
acceptance, before any 0.2.4 archive/tag; earlier evidence is preserved.

Root/eight publishable JS manifests and CMake product version now align at
0.2.4. All adapter root READMEs install the adapter and an explicit native
runtime of the same version; common JS modules remain transitive dependencies.
Express README no longer describes the prior 0.2.3 development snapshot.
Version check and strict workspace build pass (nine manifests).

This is release preparation, not a stable/public 0.2.4 claim. `v0.2.3` remains
the latest accepted stable tag. Fresh linked MSVC/GCC 8.3 native builds,
CTest/lifecycle, ten exact archives/audit/dry-run, full checks, exact external
consumers/reinstall, versioned RDP profiles and release tag remain required.
Public npm integrity and registry-only consumers remain separate gates.
Historical tags and accepted 0.2.2/0.2.3 archive bytes are unchanged.

FreeRDP remains pinned to 3.32.1 commit
`bf217a504e54cc719880c228e82353382cd7d4fa`. Mandatory RED OS 7.3/GCC 11 support
and Astra 1.7.5/GCC 8.3 requirements remain; new compiler/foundation checks
must not be confused with installed-OS desktop/device acceptance.
