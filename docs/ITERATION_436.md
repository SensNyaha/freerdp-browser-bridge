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

## Later native and artifact preparation

Fresh 0.2.4 clean linked builds pass: MSVC CTest 36/36 and Node lifecycle
27 pass / 1 skip; exact GCC 8.3.0 CTest 37/37 and lifecycle 40/40. Both have
identical native source hash
`fa47e50649c1cecea7d4f5fdc68b469257a3776c499a6efe46f97aa28ac11274`.
Windows fixture `build/native-clean-YQk1rT`; Linux
`/work/build/native-clean-VAVyx5`. Logs
`build/iteration-436-{windows,linux}-native.log`; parsed receipts
`build/release-436-native-{win32,linux}.json`.
SDK receipts/pin remain unchanged; no installed-OS compiler/device claim is
inferred from these clean native results.

The user's final GitHub owner is **SensNyaha**; npm scope stays freerdp-bridge.
Repository metadata is assigned before final archive acceptance, following
[the direct OIDC publication plan](NPM_TRUSTED_PUBLISHING.md). Earlier unaccepted
native drafts using the initially supplied owner are superseded, retained
locally and never published. Current candidates are Windows
`build/npm-native-win32-4aYYSw` and Linux
`/work/build/npm-native-linux-CckSNy`. They contain the same accepted native
source/binaries, with corrected public repository metadata.

All ten candidates in `build/release-436-archives/` pass bounded tar/metadata,
license/root README/source-notice, known lab-secret sentinel and exact
repository-URL checks. Official npm dry-run reports exact SHA-512 for all ten;
it performs no stage/publish or interactive approval. Evidence:
`build/release-436-artifact-audit.json`, `build/release-436-npm-dry-run.json`,
`iteration-436-artifact-audit.log`, `iteration-436-npm-dry-run.log`.
An initial local receipt-reading helper has an extra closing parenthesis and
fails before parsing; it is corrected without changing native output/tests.
One inline PowerShell audit command also fails to parse before executing;
its JavaScript is moved to a helper file and the audit then passes.

Full checks/exact external/reinstall/versioned RDP acceptance and release tag
remain separate; this checkpoint alone does not complete 0.2.4. No new manual
npm approval queue is started. Hosted repositories and actual OIDC trust setup
await prepared local delivery repos and the user's push.
