# Pinned FreeRDP build-copy corrections

The SDK remains FreeRDP/WinPR 3.32.1 at
`bf217a504e54cc719880c228e82353382cd7d4fa`, with unchanged public headers/ABI.
The bridge additionally requires the following explicitly recorded build-copy
correction. The verified Git checkout itself stays clean; this is not an
unmodified upstream binary or a different upstream version.

## DSP Opus reset ownership

ID: `dsp-opus-reset-ownership-v1`. Repeated public DSP reset overwrites its
previous Opus encoder/decoder pointer in the pinned implementation, including
resets to PCM sample rates supported by Opus. Normal context destruction then
releases only the latest allocation. The linked AUDIN sanitizer suite and an
independent public new/reset/free reproducer detect the lost allocations.
[Retained failure](ITERATION_268.md).

`native/freerdp-dsp-override.cmake` reads at most 128 KiB from the regular DSP
source file, normalizes CRLF to LF and requires source SHA-256
`40715894dc14e2869c64bbf3ebfcf209fe12483890ffb709133d7034f32ad10f`.
It adds destruction/nulling of the preceding Opus codec before assigning the
next format and creates `bridge-overrides/dsp.c` in the SDK build directory.
The generated file retains the original copyright/license and has exact LF
SHA-256 `f1da137622368914628be9ef79888186bb6a9a1dc7e5fa77771535c061dae35a`.
Unknown input or unexpected generated code fails configure. Unchanged output
bytes are not rewritten.

The `CMAKE_PROJECT_FreeRDP_INCLUDE` entry is `native/freerdp-build.cmake`.
It keeps the existing MSVC dependency setup and defers source replacement until
the actual `freerdp-codecs` target exists. Only that target's DSP source entry
is replaced; the source checkout, public headers and other codec sources remain
unchanged. The tested private profile uses native DSP with FFMPEG/FDK AAC absent;
other provider/profile and upstream sanitizer acceptance remains separate.

## SDK and native package metadata

The SDK installs `share/freerdp-bridge/freerdp-overrides.json`, with schema 1
and these required fields:

| Field | Meaning |
| --- | --- |
| schema | Metadata version, currently 1 |
| id | Exact correction ID above |
| sourceCommit | Original pinned FreeRDP commit |
| sourceSha256 | Canonical LF input source hash |
| recipeSha256 | Canonical LF hash of `freerdp-dsp-override.cmake` |
| outputSha256 | Exact generated LF C source hash |

The new source-build receipt includes this object as `sourceOverrides`.
Linked bridge configure requires bounded metadata (at most 4 KiB), the exact
source/correction identity, current recipe and generated-code hash. A previous
SDK without the correction or with a different recipe must be rebuilt; it is
not silently accepted. Native packages retain the metadata, recipe and original
FreeRDP license. A recipe change requires a new SDK build before its consumer.
Artifact hashes and runtime-origin checks remain separate from this metadata;
the metadata is not a signature for untrusted third-party binaries.

Ordinary local rebuild order:

```sh
pnpm build:freerdp
pnpm build:bundled
```

For isolated cached-source checks, run the existing `clean-freerdp` helper with
its completed dependency receipt, then `clean-bundled` with the new SDK receipt.
Run Windows native wrappers sequentially. The compiler minimum remains GCC 12;
RDP/device, complete upstream/addon sanitizer and release/SBOM review gates are
not implied by this ownership correction.

[Verified build and sanitizer evidence](ITERATION_269.md). The artifact-only
SPDX generator also records the correction and exact packaged recipe/metadata
hashes; see [SBOM contract](SBOM.md) and [artifact evidence](ITERATION_270.md).
