# Application artifact SPDX inventory

On Windows x64 the same `node scripts/generate-sbom.mjs` command inventories
the exact generated native ZIP without requiring a Node application archive.
It writes build/sbom-win64/native.spdx.json plus the original seven vcpkg
companions, collected into build/packages/freerdp-bridge-sbom-win64.zip. The
document explicitly describes the native artifact only. The archive is hashed
before extraction and after inventory; every packaged bin file is hashed.

A fixed PowerShell file reads version resources from the eight packaged MSVC
CRT DLLs in the extracted artifact, using Get-Item/VersionInfo. It does not
evaluate script text, compile dynamic code or run a packaged DLL/executable.
The bounded projection rejects missing/duplicate/unrecognized records and
invalid version components. Files with the same four-part file version share
one CRT package, with separate file relationships. These are file versions,
not redistributable installer versions or verified publisher signatures.
CRT license conclusions remain NOASSERTION pending licensing review. Windows
OS/Node distribution/application packaging, installers and a precise native
dependency graph remain outside this native-only report.
[Actual Windows and Linux regression evidence](ITERATION_221.md).
The optional local lab audit `node scripts/audit-local-artifact-secrets.mjs
--windows` checks both Windows ZIPs against the authorized ignored password,
without putting its value in reports, argv or environment. It is separate from
the default Linux artifact audit and from unknown-secret discovery.

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

## Final Linux runtime image

After building the runtime target (not the verification target), run on a Node 24
Windows x64 or Linux x64 host with access to its local Docker daemon:

```sh
node scripts/scan-runtime-image.mjs freerdp-bridge-service
```

An optional local tag is accepted, for example `freerdp-bridge-service:211`.
Only this repository's runtime image name is accepted. The helper inspects the
local image, saves its immutable ID without pulling or running it, and scans the
archive with [Syft 1.54.1](https://github.com/anchore/syft/releases/tag/v1.54.1).
Tool archives for the two supported hosts are pinned by SHA-256 in
scripts/sbom-tools.json. Fetching the tool is a separate TLS download; it is not
a signature verification. The scanner uses explicit squashed scope, two workers,
disabled update checks and disabled enrichment/remote license lookups. No
scanner is installed in the production image. See the upstream
[scan documentation](https://oss.anchore.com/docs/guides/sbom/getting-started/).

The helper follows hash-verified OCI index/manifest/config descriptors to the
Linux amd64 configuration, or accepts a directly addressed classic Docker
configuration. Its ordered rootfs diff IDs must match Docker inspect, and Syft's
source config digest must match the verified configuration. The saved archive
is hashed before and after scanning. The SPDX output must pass the same official
schema and reference checks as the application report; Debian packages and a
Node 24 binary must be present. Source paths passed to Syft are relative. Raw
image metadata and scanner diagnostics are not printed.

Published files are build/packages/freerdp-bridge-runtime.spdx.json and
build/packages/freerdp-bridge-runtime-sbom.json, the latter containing the image
ID, config digest, archive/report SHA-256, scanner version/archive hash and counts.
Previous success outputs are removed before a new scan. Bounds are 256 MiB
Docker image size, 512 MiB saved archive, 32 MiB per report, 64 KiB process output,
64 KiB per descriptor, four descriptor levels, 64 rootfs layers and 180 seconds
per subprocess. Report limits are checked before reading JSON; disk output from
the external scanner is subject to the scan deadline rather than a filesystem
quota. Temporary saved archives are removed on success; failed local scan inputs
remain under build for inspection.

This adds the packages discovered in the final base image, including its bundled
npm/yarn packages and Node binary. The separate application/native companion
retains build provenance for private FreeRDP/vcpkg libraries that binary scanning
does not fully identify. The documents are complementary, not merged assertions
of a complete embedded Node/native graph, license clearance, signature or
vulnerability result. [Actual evidence](ITERATION_215.md).
