# Iteration 214 — artifact-bound application/native SPDX SBOM

2026-10-15. Implements the named Stage 10 application dependency/SBOM slice.
The generator reads exact native/Node TGZs, hashes before extraction and after
inventory, and emits a separate companion archive. It does not mutate either
application package or alter production code/protocol. The Node graph is read
from the deployed tree using pnpm's ignore-workspace mode; parent-workspace
discovery initially omitted dependencies and is explicitly excluded.

Native inventory uses the archive's filtered versions/commit metadata and
13 original vcpkg provenance documents. Required package/source/binary IDs and
versions are checked; copies are bound by SHA-256. Those upstream documents
retain their original scope and bytes rather than being relabeled runtime-only
or newly schema-validated. Root relationships include flattened native
membership, actual Node dependency edges and native file hashes. Unrecognized
license metadata stays NOASSERTION.

Official SPDX 2.3 schema bytes are vendored with attribution/license link and
SHA-256 239208b7ac287b3cf5d9a9af23f9d69863971102a5e1587a27a398b43490b89b.
Ajv 8.20.0 / ajv-formats 3.0.1 are explicitly declared dev dependencies using
versions already present in the lockfile. Registry versions/integrities do not
change. The root document passes this offline schema and additional reference /
identifier checks. Bounds precede metadata parsing; graph/tree expansion and
file hashing are finite, and unknown manifest/registry fields are not projected.

Actual Linux generation succeeds with 76 packages, 13 upstream native documents,
101 files and 206 relationships. The first flat traversal correctly refuses a
directory in lib; bounded recursive traversal is then added. Final collection
SHA-256: 04d2ec6a73adbd93585e2a69f0544b98928f036b4db6d20ff60b02ad45cd9ee4.
It exists in the isolated SDK at build/packages/freerdp-bridge-sbom-linux.tar.gz.
The host export action was not executed because automatic approval review hit
its usage limit; this was a review-service failure, not an unsafe-action ruling.
No export or host-copy acceptance is claimed.

Five portable tests verify privacy/projection, duplicate dependency edges,
malformed identity/callback errors, recursion/record/unique-package bounds,
companion version/checksum ownership and official-schema/semantic reference
rejection. Complete pnpm check passes Windows 552/47 platform skips and Linux
545/54, 599 cases each, zero failures. Native code is unchanged since the linked
Linux 24/24, Windows 23/23 and foundation 11/11 CTest baseline. Logs:
`build/iteration-214-*`. The manual bundled workflow now generates the companion
after packaging; actual GitHub CI has not run.

This completes the named Linux application-artifact inventory component.
Container base OS/Node distribution, Windows CRT/native collection, complete
native graph, vulnerability/licensing review and remaining deployment/installer /
remote/resource/soak gates are preserved as open requirements.
