# Iteration 222 — artifact-contained native build provenance

2026-10-15. Closes the remaining SDK dependency in the Stage 10 SBOM generator.
Native Windows/Linux archives now contain their original vcpkg SPDX documents
beside the existing licenses and pinned build receipts. Generation reads those
exact extracted bytes, canonicalized inside the native artifact, instead of the
mutable installed SDK. Port name/version and expected Windows/Linux binary
triplet are checked before copying each byte-identical companion. Old archives
without embedded provenance fail explicitly and require rebuilding.

The independent helper copies only the exact generated archives, repository
scripts/schema and pinned source metadata into a fresh generated directory.
There is no .deps or native staging tree. Validator JS packages resolve from
the parent frozen installation. Actual generation passes Windows with seven
embedded documents / 11 packages and Linux with thirteen / 76. The first Linux
fixture setup lacked a copied public PowerShell file in the manually maintained
SDK source mirror; after synchronizing that repository file, the fixture passes.
This was an incomplete source mirror, not a generator/runtime fault. No
credentials, RDP connection or packaged executable execution is required.

Current native archive SHA-256 values:

- Windows 7c81eff17c76a5f9ba240d3ab1823a591df32aabbe9058345358d3dc6eaa12ec,
  6,299,411 bytes;
- Linux 6abd82c01dfe7409284a23e23c6abc3fb8cbfa297c9e4754a2cc7c95c762012d.

Actual root reports retain Windows 24 runtime files / 50 relationships and
Linux 101 / 206; runtime-file hashes and separate original provenance checksums
have different scopes. Windows native CTest passes 23/23, Linux 24/24, and
both platform relocation checks pass 1/1. Focused native-companion tests also
refuse a valid document for the wrong binary triplet. Logs:
build/iteration-222-*. Manual bundled CI invokes artifact-only generation on
both platforms; actual GitHub execution remains unrun.
Full pnpm check passes Windows bundled 567 / 48 platform skips and Linux
561 / 54, 615 cases each with zero failures.

The existing relocation test compares actual public FreeRDP static-addin
enumeration to filtered build metadata: Windows 20 / Linux 22. Both satisfy the
required client-channel build inventory, with serial/parallel explicitly absent
on Windows and present on Linux. The narrow Stage 0 inventory item is accepted;
this does not advertise those devices or substitute for Stage 8 runtime tests.

This does not complete native source/package dependency edges, license review,
installer or distro acceptance. The simultaneously running Linux viewer soak
uses its unchanged copied worker and is recorded separately in Iteration 220.
