# Iteration 418 — 0.2.0 preparation and versioned artifacts

2026-10-22. Root branch `release/0.2.0`. Verified receive fix `4d26874`
merges into the compiler feature at `390bfe5`; the completed feature merges
into shared `master` at `5c033e5`. Version preparation is `48836b1`.
The unfinished managed-drive branch remains at `e94891b`.

All five product manifests and CMake now declare 0.2.0. FreeRDP, dependencies,
wire schemas and Release settings are unchanged. Packaging, runtime preparation,
SBOM and artifact-audit selectors now derive archive names from the bounded
stable product version instead of selecting hardcoded 0.1.0 inputs. SBOM
archives also include the version, preserving prior archive names/contents.
The SBOM isolated-fixture copy includes the new version reader.

Actual CLI tests select the correct 0.2.0 and future-version archives even
when old 0.1.0 files coexist, reject missing current archives without fallback,
and reject invalid/path-like versions before creating a runtime context.
These and the existing version consistency tests pass 5/5.

## Native and real RDP checks

Clean linked Release 0.2.0 passes GCC 8.3 CTest 37/37 and focused Node 40/40;
MSVC passes 36/36 and 27 / 1 skip. Native/CMake snapshots match after CRLF
normalization; generated platform features differ. Linux source hash:
`ee47f3634d91ce5da1b703a991ffaa33e47bd72668b1e1744e849cb3aa71cbb3`;
Windows source hash:
`3b2bad8fabd0e62b4a92c8b39100096219f0133017a4e72993b47c6554297ec7`.
Worker hashes are respectively
`8c9cd4a3b1de90b2c2b5e9208d5bcedda56a4fc9c91684b6f7994d19419d194b`
and `765a039d94ee9504d6895a8c6729032cd4d4fa91cc1bf09020da9a6f071f768f`.
Windows receipt: `build/native-clean-vFT2JK/receipt.json`.
The receipt-selected reference form opens empty and cleans up without creating
an RDP session. Both native CLI and browser build checks verify version 0.2.0.

The installed Linux package passes strict closure (34 ELF files / 333
resolutions) and relocation 1/1. The actual approved Astra 1.7.5 node passes
release-worker public Edge H.264/JPEG, both resize sizes, reattachment and
cleanup. Actual RED OS passes release-worker native connection, both codecs,
fresh 1920×1080 JPEG, heartbeat and cleanup. Its new public H.264 attempt
connects and renders frames but fails the nonuniform-image predicate; it is
not a second full desktop acceptance. The complete RED OS H.264/JPEG desktop
acceptance remains the same C++ implementation before the version stamp
[417](ITERATION_417.md). No new application input, audible Windows profile,
installed-Astra security profile or long soak is claimed.

## Offline packaging and SBOM

The compiler container remains `network none`. Ordinary offline deployment
initially fails for an absent Typebox tarball; separate container and host
pnpm direct downloads stall/reset and are stopped. The Windows HTTP client
downloads all 54 production tarballs and verifies each SHA-512 against the
unchanged lockfile. A bounded loopback-only server inside the offline container
serves exactly those 54 checked files to a fresh pnpm fetch/store context.
Default offline deployment then reuses all 57 entries, downloading zero.
An earlier local-file store import does not populate registry indexes; an
earlier fetch in the existing modules directory prompts and serves zero files.
Neither attempt is treated as successful cache preparation. No production
registry configuration, credentials or lockfile changes are required.

Actual native and Node archives package successfully. Linux SBOM schema and
archive-only provenance pass with 76 packages, 13 upstream documents and 104
files; Windows passes with 11 packages, 7 documents and 26 files. Archive-only
controls have no SDK present. New archives and SHA-256 sidecars are under root
`build/packages/`:

| Archive | SHA-256 |
| --- | --- |
| `freerdp-bridge-native-0.2.0-Linux.tar.gz` | `28dbd76eef9b07fec29121f3bf541b94db6edeed5fa1bef0bcf4dc3a259226d4` |
| `freerdp-bridge-native-0.2.0-win64.zip` | `745d184b1aee4ecb6f5786c1178cb5daea410ddd01b1e643eef676e79aeff6cc` |
| `freerdp-bridge-node-0.2.0-linux.tar.gz` | `4832642484a90c489904e5bc87bcf28d7b138fa1eb3b8d3b388a4af8f1f3465a` |
| `freerdp-bridge-sbom-0.2.0-linux.tar.gz` | `9a5b8885b030abdc7304bfb24c135ef5e16403fbd5cd01a7f0e46a28eba1ee5d` |
| `freerdp-bridge-sbom-0.2.0-win64.zip` | `78b9f37a4945b7855206368b4d7f3ade046517a946800919688428d00c6f026a` |

## Remaining release check at this checkpoint

Linux full `pnpm check` passes 880 / 87 skips / 967 total, zero failures.
The initial Windows check fails with 877 passed, 24 failures, 2 cancellations
and 61 skips; most browser failures are five-second Edge launch deadlines,
with additional resource/CLI deadlines. A separate reviewed focused run passes
the permission/reset cases but still misses one Edge launch deadline.
The next full Windows check passes 902 with 61 skips, but one invalid-selection
resource-lab CLI child hits its ten-second deadline. That exact test passes
separately (2/2); its intermittent startup failure is retained, not waived.
Release merge/tag remain pending a passing required check. Follow-up work
checks argument/profile rejection before the CLI loads heavy runtime modules;
no deadline extension or disabled test is accepted here.

Evidence: root ignored `build/iteration-418-*` logs, including clean build,
full/reviewed/focused Windows results, source comparison, package/Node-package
attempts, pinned public tarballs/cache receipts, real RDP profiles and
Windows/Linux archive-only SBOM controls. Remote contents/secrets are absent.
