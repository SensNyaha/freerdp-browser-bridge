# Iteration 381 — foundation output hashes in clean-native receipts

2026-10-21. Implements TODO Stage 0 build-provenance follow-up identified in
[380](ITERATION_380.md): foundation receipts bind source/compiler checks but
previously omit the artifact map that linked receipts already contain. New
foundation receipts now bind the actual worker and colocated host-query helper.
No production/native source, Release configuration/artifact, dependency pin,
public protocol, RDP connection, device or external system is changed/used.

The existing bounded linked-output hashing loop moves into one shared function.
Windows profiles retain the worker/runtime-directory map. Linux linked
inventory remains worker/addon/IPC metadata; Linux foundation records its
worker and process-query helper. Each file streams into SHA-256 with the
unchanged 64 MiB bound. The receipt is created only after complete hashing,
source/profile checks, native tests and lifecycle checks. No partial artifact
map is published on failure, no history/cache or extra binary copy is added,
and existing receipts are not rewritten.

Four filesystem cases verify independent known digests, foundation helpers,
unchanged linked inventories, absent output refusal, one-byte-over-limit refusal,
exact 64 MiB admission, stream retirement and subsequent successful hashing.
Unsupported profile inputs refuse before filesystem access. The Linux-named
inventory cases run as portable filesystem controls on Windows; they are not
actual Linux build acceptance. Combined new/output-profile/compiler-provenance
focus passes 13/13 in 1.74 s. An earlier isolated draft passes 4/4.
Logs: `build/iteration-381-focus.log`, `iteration-381-prototype.log`.

The new function also reproduces the existing linked Debug receipt's exact
artifact map on actual `build/native-clean-4ZhORq/out` bytes and matches both
independently recorded foundation hashes from `native-clean-qRtFwb`. These are
read-only controls; neither old receipt nor artifact is changed.

A new offline source-only MSVC 19.44 Debug output verifies writer integration:
`build/native-clean-u8LktC/receipt.json` now contains both artifact entries.
Native CTest passes 17/17 in 7.26 s and framed lifecycle passes 16 / one skip
in 30.87 s. All 353 source files / 1,938,082 bytes remain identical to 380,
source SHA-256 `767b9ddd7bd3089e3c6ec04543267b6210077e4b29f90feef8ea829a16cf0897`.
The receipt binds worker
`82e2d83091e4f83c0d0744c121f22766857b99d7626683289eadebe0235eb6e7`
and helper `079d09bd61b8333294a9f4a38bd4fd22a33ad21e858e1410b5743aace0c0f5f7`.
An independent source/artifact/protected-input audit matches all sources,
both recorded output hashes and seven unchanged protected files. Evidence:
`build/iteration-381-foundation-build.log`, `iteration-381-audit.cjs`.

Full Windows foundation `pnpm check` passes strict build, lint, formatting and
813 tests / 102 platform/profile skips / 915 total, zero failures, in 494.20 s.
The new artifact cases and existing native/resource/lifecycle suites pass on
the receipt-bound output. Log: `build/iteration-381-check.log`.
Post-full-run source/artifact/protected-file audit, local documentation links,
report formatting and `git diff --check` pass before commit.

Actual Linux writer verification could not start: Docker's default local named
pipe has no running daemon and its user config read is denied in this
environment. No endpoint/ACL/system changes or container is attempted. Linux
artifact inventory remains portable-test evidence only; its native run stays
open.
Wider platform/CI/fresh-toolchain, deterministic outputs,
packaging/redistribution, connected resource and complete stage gates remain
open. This receipt improvement makes no new runtime capability claim.
