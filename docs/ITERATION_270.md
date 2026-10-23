# Iteration 270 — artifact-contained DSP correction in SPDX

2026-10-16. Implements Stage 0 artifact identity and BUILD_AND_DEPLOY dependency
inventory for the [verified DSP correction](ITERATION_269.md), commit `3e3cd79`.
No native runtime or public wire changes.

## Provenance projection

`scripts/freerdp-override-model.mjs` validates the approved correction manifest
and exact canonical recipe from the extracted archive. JSON input is bounded
to 4 KiB and recipe input to 128 KiB before parsing; filesystem admission also
checks these bounds before reading, regular files and canonical containment.
Unknown, partial, malformed or mismatched corrections fail with fixed errors.
Arbitrary manifest fields are not copied into SPDX or diagnostics.

FreeRDP sourceInfo records the pinned upstream commit, correction ID and source /
recipe / generated C hashes. The upstream downloadLocation is retained. The
two exact packaged files get SHA-256 file records, artifact CONTAINS edges and
FreeRDP GENERATED_FROM edges. Their unresolved licensing conclusions remain
NOASSERTION. This is build provenance, not a binary signature or source/binary
equivalence proof.

Both metadata files absent is a historical-inventory case: sourceInfo explicitly
reports absent metadata and unestablished modification status. It does not
identify an old binary as corrected or unmodified. New SDK configure admission
continues to require the approved correction. Historical artifacts are not
rewritten or substituted.

## Actual packaged artifact checks

New CPack outputs use `build/packages-270` separately on each platform. Exact
archives are copied into fresh fixtures containing only the archives, repository
inventory scripts/schema and pinned source metadata. There is no SDK/staging
tree; validator packages resolve from the parent frozen Node installation.
The independent helper verifies the new correction file records and edges as
well as root SPDX 2.3 schema/reference integrity. Historical archive fixtures
also pass and report `freerdpOverrideRecorded=false`; new archives report true.

| Platform | Packages | Original vcpkg documents | Files | Relationships |
| --- | --- | --- | --- | --- |
| Windows native ZIP | 11 | 7 | 26 | 54 |
| Linux native + existing production Node archive | 76 | 13 | 103 | 210 |

New native archive SHA-256 values:

- Windows: `a67d00122dcc31274b392c51208a640982997600f421cadf69c18eb12e3e3adb`.
- Linux: `e85ab7bcaa21166e14301041f923ff1326be41143e407d8341d78731e93cfd5e`.

Generated root report SHA-256 values:

- Windows: `b67917a3e34e3d4c35f6612f624a7772c5ddf0b4faefcdfd81bfd504825fd41d`.
- Linux: `54b54ee3fc26acc0ddf0f8386459aa99e1dee0f13d1279c3f0e037ff9a03fa09`.

The report hashes bind these actual outputs, including their generated timestamp
and document namespace; they are not claims of byte-identical regenerated SPDX.
The Linux Node archive remains the existing artifact, not a new application
deployment. The immutable historical release/image cohort remains unchanged.

Three new portable tests cover byte/checksum identity, LF/CRLF canonicalization,
metadata privacy, incomplete/oversized/malformed/changed/unknown inputs and
explicit historical status. The narrow model/schema suite passes 8/8.
Full Linux pnpm check passes 662 / 59 skips / 721 total, zero failures.
Full Windows pnpm check passes 669 / 49 skips / 718 total, zero failures.
Native binaries are unchanged from iteration 269's accepted CTest 30/30 on
Windows and 31/31 on Linux; no new native acceptance is inferred from SPDX.

Evidence: `build/iteration-270-windows-package.log`,
`build/iteration-270-linux-package.log`,
`build/iteration-270-windows-sbom.log`, `build/iteration-270-linux-sbom.log`,
`build/iteration-270-win32-receipt.json`,
`build/iteration-270-linux-receipt.json`,
`build/iteration-270-linux-full-check.log`,
`build/iteration-270-windows-full-check.log`.

Complete embedded Node/native edges, license/vulnerability review, full service
image refresh, distro/source/CI and actual RDP/device/resource gates remain open.
Stages 0 and 10 remain IN PROGRESS. No package-size estimate is made.
