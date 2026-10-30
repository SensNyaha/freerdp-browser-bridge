# 0.7.0 release acceptance

## Status

**0.7.0 is published and verified:** all ten npm packages, five GitHub Releases
and the final standalone distributions pass public delivery acceptance.
[Public sources, file identities and installed profiles](#public-delivery)
are authoritative for this release.

This minor release adds bounded bridge-host device metadata inventory. It does not complete Stage 8 or V1, physical device redirection, or OS file clipboard.

### Historical prepublication checkpoint

**Prepublication acceptance has passed. Stable npm and standalone publication remain pending.** Public stable is 0.6.0 until public delivery is verified.

## Delivered capability

- Node SDK `discoverHostDevices` and matching exports/types from all four server adapters, with one disposable native worker, validation before dispatch, bounded metadata and explicit incomplete/refusal states.
- Printer, smartcard, serial, parallel and USB metadata from supported host providers; discovery does not grant device access or imply redirection support.
- Operator-only standalone `--inventory` CLI with an explicit private runtime root; it starts no HTTP/RDP server and does not read service configuration.
- Paired SDK/runtime upgrade is required for the new HELLO extension. All shipped package versions and standalone private dependencies agree at 0.7.0.

[Inventory API and limits](../DEVICE_REDIRECTION.md), [standalone command](STANDALONE.md#operator-only-host-inventory), [protocol upgrade](../PROTOCOL.md#host-device-inventory-grammar-in-development).

## Acceptance

- Full versioned Windows `pnpm check`: 1353 passed / 84 skipped; Linux: 1320 passed / 141 skipped. No failures or cancellations.
- Native CTest: Windows foundation 25/25 and linked 42/42; GCC 8.3 Linux linked 43/43. Actual RED OS 7.3 / GCC 11.4.1 linked 43/43 also passes, with all 450 archived source files verified. That run reuses the GCC 8.3-built SDK and does not claim a dependency rebuild, Node-addon or RDP acceptance.
- Eight independent exact-archive npm consumers pass strict TypeScript, ordinary server/TLS/assets behavior, twelve native inventory profiles and fifteen managed-file regression profiles with synthetic RDP state. All ten exact archives pass isolated-config npm publish dry-run.
- [Hosted installer run 41091608685](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/41091608685) passes Windows Server 2025 and Ubuntu 24.04 builds, portable inventory, installed 0.6.0-to-0.7.0 upgrades, lifecycle checks and combined artifact verification. Windows inventory runs as the operator; Linux installed inventory runs as the service account.
- The exact candidate DEB/RPM separately pass Astra Linux 1.7.5 and RED OS 7.3: immutable public 0.6.0 seed, 0.7.0 upgrade, service-account inventory, native TLS, non-root identity, crash recovery, retained configuration and uninstall. Test inputs are removed and service/program absence and default retained configuration are checked. These installer fixtures make no actual desktop RDP claim.
- All four source CI workflows at public candidate `ff744d6` pass, including source-worker NTFS disk-full checks. Public-runtime and installed-MSI resource qualification remain distinct public-delivery checks. Original failed checks and unchanged repeats remain retained; no product assertion or timeout was weakened. The RED OS source collector was corrected to include a nested fixture after successful build/CTest; all 450 source hashes match, without a rebuild.

The shipping native archives were compiled at `a43f6e4`; later commits only change release metadata and documentation. Native build identifiers remain those of the tested binaries. Local `inventory07-prepublication-acceptance.json` binds exact evidence and limits.

## Exact npm archives

| Package | Bytes | SHA256 |
| --- | --- | --- |
| `@freerdp-bridge/api@0.7.0` | 121618 | `7e6bbe9c0a79008eeca04c84bff2004067d1c1cf673ab83d4cffbe3ba87ae10d` |
| `@freerdp-bridge/config@0.7.0` | 10100 | `20e7b98b185f247cacc2630be030edf02641f3dfb432f0bffcb2b98540816f65` |
| `@freerdp-bridge/express@0.7.0` | 6638 | `0f3e4c80d6d699186e4e6e14e0ce5d3401e554e70f1e36f2f51eaa49264feb32` |
| `@freerdp-bridge/fastify@0.7.0` | 5220 | `8694645583351b4c605f93afffdc05d0eb3f825cd6ab28482ed7c593676d8914` |
| `@freerdp-bridge/http@0.7.0` | 9176 | `3cda2bfda495109032b47df9d89346122372e7a1e5549ae5ed1e3cdba8697e89` |
| `@freerdp-bridge/nestjs@0.7.0` | 10070 | `1dc67e4e02736a1a55372986caa7cf71f530f12778ceec8e3be54fe8c5c39770` |
| `@freerdp-bridge/node@0.7.0` | 144713 | `22029bdea5318291073efb812af6c59771512f3eec617af9db555ea664fba6e2` |
| `@freerdp-bridge/protocol@0.7.0` | 53554 | `6decaaf3da22bd7d392bb7583a7bc5e501742004b7da8553cc2c0b3178e4ac0d` |
| `@freerdp-bridge/runtime-linux-x64-gnu@0.7.0` | 76713342 | `363b89ae9a0b3f646083b9703c7868a672501b57a96352f67ead3f046f9dc977` |
| `@freerdp-bridge/runtime-win32-x64@0.7.0` | 7052294 | `1755b6b493ff4dd7f00a89805047504b75b33e6a7eeb5cddb7105d6ed676a6df` |

Shipping npm worker SHA256:

- `@freerdp-bridge/runtime-linux-x64-gnu`: `88e13aaa3b0b11f5d3155191462fe96ff006329a43137472ef2d9adc4f7fc629`.
- `@freerdp-bridge/runtime-win32-x64`: `a0222ef2906580ca3eba88a947d50d8742cef9fae5e00e3208eddb41243d21a3`.

## Exact prepublication standalone files

These are acceptance candidates, not public stable installer identities.

| File | Bytes | SHA256 |
| --- | --- | --- |
| `freerdp-bridge-0.7.0-1.x86_64.rpm` | 122800321 | `9347447d4816262e0d61028bef5784c1f86aa29984e718023be9ba2e57ba5034` |
| `freerdp-bridge-0.7.0-corresponding-source-linux-x64-gnu.tar.gz` | 4008553 | `9d1300467b90a45fcc8544a66723f0ccb79d106bd0279d3df0b8f2151adf2c61` |
| `freerdp-bridge-0.7.0-corresponding-source-win32-x64.tar.gz` | 440162 | `a2de2d70203e6ea03c1405270744c9957f39f7d2f5f66ce7770323a61391b0cd` |
| `freerdp-bridge-0.7.0-linux-x64-gnu.tar.gz` | 122585203 | `dbec788244406420533bdd9ce1fbdd2955cf0b1e24c41fbb6eaa8e73e31432ab` |
| `freerdp-bridge-0.7.0-win32-x64.msi` | 36850786 | `f66897d0005b3f4f6d774d17b88df466fb3ad9eb188bb08766112a73bbbcb5fa` |
| `freerdp-bridge-0.7.0-win32-x64.zip` | 47894941 | `306342770f8029472f084c9ef0b7590b7b3783e48ed9406d1200b0cfcc2bf659` |
| `freerdp-bridge_0.7.0_amd64.deb` | 122253940 | `fd4bd7076f83f9e481a41a57395d00ba4d965ac8bbf6d5de12302f3a0be5e20a` |

Final public delivery must retain the exact npm archives and separately verify the public standalone files and installation scope. Physical printer/card/USB/port redirection, browser device access and remaining TODO gates stay open.

## Public delivery

Private immutable `v0.7.0` identifies `afc7f4039ee753e92b026b6bbedcd27a2be5ae41`;
its release branch is merged into private `master` at `52db030`.
The independent public core tag identifies `dbf6ca53ff0edfe035fd3bcee259fd2573291b28`.
All five public release histories continue their accepted parents. Existing tags
and archive bytes were not changed. All ten npm latest tags select 0.7.0 at
the exact accepted SRI. Registry provenance subject digests, source commits,
workflow paths and invocation IDs match these releases; this records metadata
comparison, not independent cryptographic verification of Sigstore bundles.
Publication uses OIDC with no new manual per-package approval queue.

| Repository | Public source | Successful OIDC run |
| --- | --- | --- |
| [freerdp-browser-bridge](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/v0.7.0) | `dbf6ca5` | [41115827640](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/41115827640) |
| [freerdp-bridge-fastify](https://github.com/SensNyaha/freerdp-bridge-fastify/releases/tag/v0.7.0) | `60cabb9` | [41118988347](https://github.com/SensNyaha/freerdp-bridge-fastify/actions/runs/41118988347) |
| [freerdp-bridge-nestjs](https://github.com/SensNyaha/freerdp-bridge-nestjs/releases/tag/v0.7.0) | `147a6eb` | [41119069171](https://github.com/SensNyaha/freerdp-bridge-nestjs/actions/runs/41119069171) |
| [freerdp-bridge-http](https://github.com/SensNyaha/freerdp-bridge-http/releases/tag/v0.7.0) | `f95a869` | [41118909293](https://github.com/SensNyaha/freerdp-bridge-http/actions/runs/41118909293) |
| [freerdp-bridge-express](https://github.com/SensNyaha/freerdp-bridge-express/releases/tag/v0.7.0) | `324fd69` | [41119661539](https://github.com/SensNyaha/freerdp-bridge-express/actions/runs/41119661539) |

The public source passes [foundation CI](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/41118833427)
and [GCC 8.3 CI](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/41118833268).
Eight fresh registry-only consumer projects pass on Windows/Linux: strict
TypeScript, framework/server/TLS behavior, installed browser assets, recovery,
twelve native inventory profiles and fifteen native managed-file profiles.
Inventory opens no device and creates no RDP session. The file profiles use
synthetic RDP state; they do not establish desktop or file-clipboard acceptance.

Final [standalone workflow 41118833374](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/41118833374)
passes both platform builds, portable/installed inventory, 0.6.0 upgrades,
aggregate verification, publication and post-publication Windows MSI resource
qualification. All seven public files below were downloaded and verified
against the final manifest, GitHub digests, SHA256SUMS and SHA-512 integrities.
The checksum list also binds the manifest itself. `candidateOnly` is false.

| Final public file | Bytes | SHA256 |
| --- | --- | --- |
| `freerdp-bridge_0.7.0_amd64.deb` | 122254156 | `5957dc22c982d5d951d8dbe8b4af3160232914ab1f2f4de6ac13467deb4bf726` |
| `freerdp-bridge-0.7.0-1.x86_64.rpm` | 122800226 | `a155601a4cbcba4d7f9817b265e85b4f478a81e97bc564ad7667f6da4424ab01` |
| `freerdp-bridge-0.7.0-corresponding-source-linux-x64-gnu.tar.gz` | 4008580 | `5638e3111d875cd98de10a4cd866fe8c95a22b941ad437760ebe36e559ac58ea` |
| `freerdp-bridge-0.7.0-corresponding-source-win32-x64.tar.gz` | 440162 | `3e0dbf182eaf111a2569840ff742fa9c4b8ab89db0440df3b7eebe41b788bf8f` |
| `freerdp-bridge-0.7.0-linux-x64-gnu.tar.gz` | 122583508 | `456d863d5ca2eee9acfd0be9df374977079bd583c227bf610e016c3233fa4e48` |
| `freerdp-bridge-0.7.0-win32-x64.msi` | 36850786 | `1c816b23fc41e80f702dd6142ad4d50e401fbc6b35b58e02f49e10a7ff2d2468` |
| `freerdp-bridge-0.7.0-win32-x64.zip` | 47894941 | `006719d1750f715d691148b94b795b2ef05f16dfae2b037c8f52b792f5b2053e` |

Final public DEB/RPM separately pass immutable public 0.6.0-to-0.7.0 upgrades
on Astra Linux 1.7.5 and RED OS 7.3: service-account inventory, native TLS,
non-root identity, crash recovery, retained default configuration and uninstall.
Both owned test contexts are removed after hash/ownership/live-process checks;
the program and service remain absent. These lifecycle fixtures make no actual
desktop RDP claim. Existing 0.6.0 application/RDP evidence remains versioned
separately and is not relabeled as a new 0.7.0 desktop test.

The [Windows NTFS gate](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/41118833346)
passes source and exact published runtime physical exhaustion, quota refund
and cleanup. Its first attempt had one source-worker HTTP `ECONNRESET` before
the published-runtime step. The failed log remains retained; one unchanged
repeat on a fresh runner passes both profiles, including the shipping worker
SHA256 above. No product assertion or timeout was weakened.
The final public MSI separately passes LocalService, real loopback RDP and
bounded NTFS exhaustion with complete installed/account/volume cleanup in
job `124285544194` of the standalone workflow.

Local evidence: `inventory07-public-identity-acceptance.json`,
`inventory07-registry-consumer-acceptance.json`,
`inventory07-final-hosted-acceptance.json`,
`inventory07-public-installed-labs/` and both
`inventory07-*-installed-public-cleanup.json` receipts.
The initial report collector incorrectly expected seven checksum rows rather
than seven files plus the manifest; its refusal and correction are retained.
This changed no public bytes or acceptance tests.

## Remaining scope

Physical printer/card/USB/port redirection, browser device access, OS file
clipboard (`clipboardFiles: false`) and the remaining Stage 8/V1 requirements
remain open. Host metadata discovery does not authorize device access.
