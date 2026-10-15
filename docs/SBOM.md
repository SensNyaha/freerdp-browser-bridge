# Application artifact SPDX inventory

On Linux amd64, after the verified native and production Node packages exist:

```sh
node scripts/generate-sbom.mjs
```

The helper inventories the exact two archives under build/packages. It hashes
them before extraction, reads only their extracted Node/native trees, and checks
the archive hashes again before publishing the result. The SPDX root and copied
upstream documents are written under build/sbom-linux and collected into
`build/packages/freerdp-bridge-sbom-linux.tar.gz`. This is a companion artifact;
neither application archive is rewritten.

The root uses [SPDX 2.3 JSON](https://github.com/spdx/spdx-spec/tree/v2.3/schemas).
It is validated offline against the unmodified, hash-pinned official schema and
then checked for duplicate identifiers and unresolved local/external references.
Source attribution/license for the schema is in
[scripts/schemas/SOURCE.md](../scripts/schemas/SOURCE.md).

Contents:

- actual production Node package identities and dependency edges obtained from
  the deployed tree, with registry credentials, absolute paths and arbitrary
  manifest fields excluded;
- FreeRDP/WinPR 3.32.1 with its pinned source commit;
- filtered native dependency versions and the vcpkg documents supplied by their
  installed build receipts, preserved byte for byte with SHA-256 references;
- individual SHA-256 values for files under native bin/lib, including aliases
  and nested directories, plus both complete application archive hashes.

The vcpkg documents describe their complete installed SDK packages, including
build/provenance files. They are supplied upstream SPDX documents, not newly
claimed schema-valid or runtime-only inventories. The root checks required
source/binary identities and version agreement before referring to them.
Native component membership is flattened; a precise native dependency graph is
not inferred from that membership. Unresolved license declarations remain
NOASSERTION; a short set of recognized declared licenses is retained without
inventing conclusions. Supplied license notices remain in the native archive.

Bounds include 4 MiB pnpm output, 4,096 visited dependency records/edges, depth
64, 512 unique Node packages, 32 native components, 8 MiB per companion and
32 MiB combined companion input. Native traversal limits depth to 16, entries
per directory to 512, files to 1,024 and hashed file input to 512 MiB total.
Metadata file reads and archive hashes also have explicit size limits. Runtime
files/Node manifests must resolve inside the extracted artifact roots. No RDP
process, network connection or lab configuration is used.

The report covers application/native artifacts. Base-image OS packages, the
Node.js distribution and its embedded third-party code, Windows runtime/CRT
metadata, vulnerability analysis and a full licensing review remain separate
release work. This report is not a complete container-image SBOM or a signature.
[Current actual generation and test evidence](ITERATION_214.md).
