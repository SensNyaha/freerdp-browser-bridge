# Iteration 453 — aligned 0.2.5 preparation

The separate **release/0.2.5** branch inherits the verified standalone prototype
and guarded delivery tooling. Shared master and all existing stable tags remain
unchanged. Version 0.2.5 is not accepted or publicly published yet.

All ten workspace/root manifests and native CMake product version now read
0.2.5. Package README commands select the aligned candidate versions while the
root overview preserves the actual public stable 0.2.4/history. The version guard,
all ten public npm README guards and complete recursive TypeScript build pass.
No dependency or wire-schema version is advanced; FreeRDP remains 3.32.1 at
`bf217a504e54cc719880c228e82353382cd7d4fa`.

The production installer locks still name the accepted 0.2.4 archives at this
checkpoint. They cannot be updated truthfully before the new native/JS archive
hashes exist. No synthetic hash or relabelled 0.2.4 binary is substituted, and
the final full suite is not claimed with those pending inputs.

Next compile new native 0.2.5 workers against the already validated exact SDKs,
run fresh native CTest, produce exact package archives and update the locks from
their bytes/metadata. Then run full checks, external consumers, candidate CI
upgrade and actual lab profiles before stable tagging/publication.

## New native builds and exact locks

Fresh clean-source linked workers complete on both platforms: **MSVC 36/36**
and **GCC 8.3.0 37/37 CTest**, plus the clean build driver's native/Node lifecycle
checks. Windows fixture is `build/native-clean-ROjNo4`; Linux's exact fixture
and hashes are in `build/release-453-native-linux.json`. The previous accepted
FreeRDP SDK/dependency receipts are reused as explicit pinned inputs; those
dependencies are not claimed to have been rebuilt for this version-only change.
Logs: `build/iteration-453-native-{win32,linux}.log`.

Eight JS archives and both new native npm archives exist in
`build/release-453-archives`. New runtime SHA-256:

```text
Windows cc9515469501f9911aa9bbf44e561f8512b05c724a6a448bdb4d0204dc655394
Linux   a717e6e2647eb2cd38807cd19fbc8c96b0eeee8db9054e3ff93348af2a77963a
```

Both runtime assemblers pass actual codec/relocation/source/license probes and
README guards. Linux contains four corresponding-source components; Windows one.
The first Docker receipt transfer is not executed because automatic review hits
its usage limit; after review becomes available, the same normal approved
transfer succeeds and the copied archive SHA-256 matches. No approval bypass
or relaxed certificate/secret policy is used.

`advanceStandaloneLock` permits only a version-only core graph advance. It reads
real archive metadata/hashes, preserves the entire external dependency graph
and refuses changed dependency/platform/license/engine fields that would need
a fresh resolution. Both exact production locks now name 0.2.5 official registry
URLs and the actual new archive SHA-512. The existing candidate verifier checks
all five real archives for each platform. Six lock/candidate guard tests pass;
changed JS passes lint/format. Full regression, archive audit/dry-run, external
consumers, installer upgrade, real labs and publication remain pending.

The user's 2026-10-24 goal update continues development after final cleanup/docs:
new feature branches, stable checks before merge, scope-appropriate versioning
and coordinated npm/standalone releases. This supersedes the previous stop
instruction without skipping the current release gates.
