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
[Actual Windows and Linux regression evidence](history/iterations/201-250.md#iteration-221).
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

Current bundled archives also include their original vcpkg provenance under
share/freerdp-bridge/sbom/vcpkg. Generation reads these extracted bytes and checks
the expected binary triplet as well as port identity/version. It no longer
consults the mutable installed SDK for companions. Older native archives without
these embedded documents must be rebuilt; no silent SDK fallback is performed.
`node scripts/test-sbom-artifacts.mjs` repeats generation in a separate tree with
only the exact archives, scripts/schema and pinned source metadata, without
.deps or native staging. JavaScript validator dependencies come from the parent
frozen installation. [Artifact-only verification](history/iterations/201-250.md#iteration-222).

Current corrected SDK artifacts also retain
`share/freerdp-bridge/freerdp-overrides.json` and the DSP build-copy recipe.
The generator reads these only from the extracted native archive. It checks
the approved correction identity, pinned source commit, original/generated C
hashes and canonical LF recipe hash. Both files have exact byte checksums and
CONTAINS / GENERATED_FROM relationships in the SPDX root; FreeRDP sourceInfo
explicitly describes the correction. Original downloadLocation still refers to
the pinned upstream commit, with the modification recorded separately.

Manifest input is bounded to 4 KiB and recipe input to 128 KiB before reading /
JSON parsing. Missing one of the pair, symlink files, unknown or mismatched
corrections are refused. These two fixed provenance files supplement the bounded
runtime traversal. Arbitrary manifest fields and local paths are not projected.
When both are absent in a historical archive, sourceInfo explicitly states
that override metadata is absent and modification status is not established.
This preserves historical inventory without asserting an unmodified binary.
New linked builds separately require correction metadata at configure time.
This is provenance, not a binary signature or licensing conclusion.
[Correction contract](FREERDP_OVERRIDES.md), [new artifact evidence](history/iterations/251-300.md#iteration-270).

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
[Current actual generation and test evidence](history/iterations/201-250.md#iteration-214).

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

The developing image branch adds a fixed `code` to Docker-inspection refusals:
`SBOM_IMAGE_IDENTITY_RECORDS`, `_ID`, `_PLATFORM`, `_SIZE` or `_LAYERS`, while
retaining the existing `SBOM_IMAGE_IDENTITY` message. These identify which
unchanged admission guard refused the input without including inspected values.
That diagnostic checkpoint retains the original 256 MiB size, Linux/amd64 and
digest/layer limits; the later measured size correction is recorded below.
Ten focused image/application SBOM model checks pass, including a failing-before
diagnostic case, metadata non-disclosure and unchanged input. This instrumentation
also preserves admission outcomes in 456 comparisons with the original model.
Full linked `pnpm check` passes Windows 1228/71 skips and Linux UID1000/CapEff=0
1185/119 skips, zero failures; local
`build/current-validation/image-sbom-identity-acceptance.json` binds the source
hashes, before/focused/full logs, local scan and equivalence receipts. Native
sources are unchanged. This instrumentation
does not establish the cause of hosted run `40472270571`'s generic identity
refusal; its native and full API runtime steps pass, but final image SBOM and
overall bundled acceptance remain incomplete pending an actual inspection.
The bundled workflow prints only the image byte count and rootfs layer count
before invoking the scanner; the next refusal therefore has both fixed guard
codes and these two bounded scalars, without full Docker metadata or config.

The current artifact-only local image independently passes the complete scanner:
115,997,218 inspect bytes, seven rootfs layers, and a schema-valid SPDX inventory
of 304 packages (89 Debian, 209 npm, five binary). Config digest, ordered layers,
saved-archive hashes before/after scanning and Node/Debian presence all pass.
The earlier generated report is preserved before producing the new report.
`build/current-validation/image-service-sbom-acceptance.json` binds the image ID,
scanner pin, output hashes and preserved files. This does not reproduce or
explain the hosted identity refusal, and does not accept a versioned installer.

Hosted diagnostic run `40482004084` subsequently identifies the exact refusal:
`SBOM_IMAGE_IDENTITY_SIZE`, with **312,426,738 inspect bytes** and seven layers.
All native/Node, clean assembly and restricted API runtime checks pass before
this pre-scan refusal. The prior generic cause is therefore resolved as the
256 MiB inventory admission budget. The local and hosted Docker byte counts
differ; they must not be treated as interchangeable artifact-size evidence.
The ignored `build/current-validation/image-sbom-hosted-size-counterexample.json`
binds the terminal log and these measured scalars.

The inspection budget is explicitly increased to **512 MiB** to admit the
measured complete service while retaining a finite bound. The saved archive
also retains its separate 512 MiB limit. Regression checks admit the exact
hosted byte count and exact new ceiling, refuse one byte above it and invalid
numeric values, and retain platform/digest/layer refusals at the admitted sizes.
This is an SBOM artifact budget; session memory targets and the 16 MiB clipboard
item quota are independent. A passing model fixture does not accept the hosted
full scan, which still needs its corrected-source execution.

Published files are build/packages/freerdp-bridge-runtime.spdx.json and
build/packages/freerdp-bridge-runtime-sbom.json, the latter containing the image
ID, config digest, archive/report SHA-256, scanner version/archive hash and counts.
Previous success outputs are removed before a new scan. Bounds are 512 MiB
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
vulnerability result. [Actual evidence](history/iterations/201-250.md#iteration-215).
