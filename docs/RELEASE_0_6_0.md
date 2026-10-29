# 0.6.0 release acceptance

## Status

**0.6.0 is published and verified:** all ten npm packages, five GitHub Releases
and the final standalone distributions pass public delivery acceptance.
[Public artifacts, exact identities and installed profiles](#public-delivery)
are authoritative for the current release. Broader Stage 7/V1 gates remain open.

### Historical prepublication checkpoint

**Prepublication acceptance has passed. Public npm and stable standalone delivery
are pending.** Public stable remains 0.5.0 until final publication is verified.
This is a capability release for managed files and redirected sandbox drives;
it does not complete Stage 7 or the original V1 requirements.

## Delivered capability

Trusted applications can enable bounded session storage and authenticated
streaming HTTP file routes, then redirect selected sandbox scopes through
RDPDR. All four Node adapters and the standalone service expose the same policy.
Owners use opaque locators; sessions cannot select arbitrary host paths or
increase configured limits. Read-only shares enforce their own mutation denial.

The Windows path handles empty-root CREATE, standard NO_RECALL/no-follow opens
and terminated preferred aliases. Audio-off drive sessions use guarded silent,
zero-format RDPSND without a host audio backend or audio publication. The pinned
FreeRDP 3.32.1 SDK remains the implementation authority. Its narrow terminated
DeviceData behavior and the protocol wording discrepancy remain documented in
[FILES](FILES.md), rather than being generalized to arbitrary RDP servers.

File-manager Ctrl+C/Ctrl+V is still deferred (`clipboardFiles: false`); requesting
it fails explicitly before backend start. Managed HTTP files do not enable file
clipboard. See [file integration and limits](FILES.md) and the
[standalone configuration](STANDALONE.md#managed-files-in-the-unreleased-development-branch).

## Acceptance

- Full versioned Windows checks: 1306 pass, 73 skips, 1379 total. Linux checks:
  1278 pass, 124 skips, 1402 total; no failures or cancellations.
- Native CTest: Windows foundation 25/25, Windows linked 42/42, GCC 8.3 linked
  43/43. Actual RED OS 7.3 with GCC 11.4.1 passes linked Release 43/43, verifying
  all 440 archived source files. That run reuses the GCC 8.3 SDK and makes no
  claim of a GCC 11 dependency rebuild or Node-addon/RDP acceptance.
- Eight independent installed npm consumer projects cover HTTP/HTTPS, Express,
  Fastify and NestJS on both OS builds, strict TypeScript, installed browser
  assets and actual native file operations with synthetic RDP.
- Six actual installed npm HTTP/RDP profiles pass against Astra and RED OS:
  Windows worker, Linux RWS1 and Linux framed on each. Four additional actual
  Windows application profiles cover both workers/carriers and full 64-byte
  share names with a prepared PowerShell window.
- Six actual standalone file profiles pass: Windows ZIP, Linux TGZ and installed
  DEB/RPM on each named Linux lab. These verify Unicode rename/truncate and
  65599-byte readback, 131111-byte chunked transfer, owner isolation, read-only
  refusal, deletion, disappearance of owned shares and joined cleanup.
- Windows and Linux candidate installer jobs plus their combined verify job
  pass in [run 40904699711](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40904699711).
  These prove 0.5.0-to-0.6.0 upgrades, old-worker retirement, non-root service,
  native TLS, crash recovery, retained configuration and uninstall. The exact
  local DEB/RPM upgrades separately pass Astra 1.7.5 and RED OS 7.3. Installer
  lifecycle fixtures make no real desktop RDP claim.
- Versioned [source foundation](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40904652569)
  and [GCC 8.3 foundation](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40904652331)
  pass on public candidate source `d1d4446`. The corrected IPC fuzz target links
  all file grammars and seeds full 64 KiB chunks with a 65600-byte input bound.
  The transient Linux codec-admission fixture retries only `busy` within its
  existing one-second deadline; production admission remains unchanged.
- All ten exact archives pass isolated-config `npm publish --dry-run`. Adapter
  README commands select 0.6.0; compiled entries, four core archives and both
  native archives retain accepted bytes. Both production locks retain the
  external dependency graph and exact core integrities.

Windows npm worker SHA256:
`8f5b7c6b70f77dbf8ea586cdc87d49032dc77f94161c003a499f63f8d9e333a5`.
Installed Linux npm worker SHA256:
`c282e1e3ca304fee0c95dd38754231a1c7e954acbe7736c0ab5b3342ba853079`.
Linux installation changes ELF RPATH; its pre-install build bytes are distinct.
The native archives retain their tested development build identifier; later
source-only test/documentation commits do not imply an untested binary rebuild.
The source changes after native packaging are confined to the fuzz-only target
and the admission test. Local `managed06-prepublication-platform-acceptance.json`
binds the receipts; `managed06-native-source*.json` retains source inventories.

## Exact npm archives

| Package | Bytes | SHA256 |
| --- | --- | --- |
| `@freerdp-bridge/api@0.6.0` | 120846 | `90d283db6aaa38d5e812d2768d5129dc3014c57b85e0e3ea836b304b5d4ff32d` |
| `@freerdp-bridge/config@0.6.0` | 10100 | `bcf1e3174c711aaeb3b039bf65d156b7c4d65e519d1b22fce020ab7e4c9adc76` |
| `@freerdp-bridge/express@0.6.0` | 6064 | `7e0587c83b9382add9b87139d1c104fcd486aeda5e1940643f81dd187083d060` |
| `@freerdp-bridge/fastify@0.6.0` | 4656 | `da4bd237b935403a65d4472b4dc24119242e51d8dca5d51279db6535b6c3f386` |
| `@freerdp-bridge/http@0.6.0` | 8599 | `fe80066ea15a4f5c4eb92615b016528cf7874136b61cf952162dde0f5646c631` |
| `@freerdp-bridge/nestjs@0.6.0` | 9350 | `fa91ac442c3f25129910a32e5df80c4660adf12687e3625617ad11fa5a3b4628` |
| `@freerdp-bridge/node@0.6.0` | 143126 | `3401386559ed9d18ef5a0f4c1ca64ec9add0b25c091999b412f18cf67138237f` |
| `@freerdp-bridge/protocol@0.6.0` | 49672 | `4b1e6d3c0650a5dc47bf951862775d45a2e1948ef205332e752518f1653d0408` |
| `@freerdp-bridge/runtime-linux-x64-gnu@0.6.0` | 76693374 | `4b32018732fca6a3e25669f7ac6d19789d562458cb316c4b0212a04d601b0d85` |
| `@freerdp-bridge/runtime-win32-x64@0.6.0` | 7044572 | `edaac8a08fe1de278134c2d18964a852cbd2af88eccf63a120d7f3fba5a97589` |

These hashes match the exact published npm archives, their latest tags and
the GitHub release assets. Final public acceptance follows.

## Public delivery

Release 0.6.0 is published and verified. Private immutable tag `v0.6.0`
identifies `98b8f46a83c54158973e67d4203431862310bfe9`; the independent public
core tag identifies `21b4091ea51c7174da5c353b7f694ec2c228bf5b`. Existing tags
were not moved. All ten registry latest tags have the exact accepted integrities.
All five repository releases and their exact delivery manifests/assets pass
readback. Publication uses OIDC, without a new manual npm approval queue.

| Repository | Public source | Successful OIDC run |
| --- | --- | --- |
| [freerdp-browser-bridge](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/v0.6.0) | `21b4091` | [40908817255](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40908817255) |
| [freerdp-bridge-fastify](https://github.com/SensNyaha/freerdp-bridge-fastify/releases/tag/v0.6.0) | `d469018` | [40915461998](https://github.com/SensNyaha/freerdp-bridge-fastify/actions/runs/40915461998) |
| [freerdp-bridge-nestjs](https://github.com/SensNyaha/freerdp-bridge-nestjs/releases/tag/v0.6.0) | `940aa70` | [40915512559](https://github.com/SensNyaha/freerdp-bridge-nestjs/actions/runs/40915512559) |
| [freerdp-bridge-http](https://github.com/SensNyaha/freerdp-bridge-http/releases/tag/v0.6.0) | `7eb38ae` | [40915571162](https://github.com/SensNyaha/freerdp-bridge-http/actions/runs/40915571162) |
| [freerdp-bridge-express](https://github.com/SensNyaha/freerdp-bridge-express/releases/tag/v0.6.0) | `edd162a` | [40916466656](https://github.com/SensNyaha/freerdp-bridge-express/actions/runs/40916466656) |

The release source passes [foundation CI](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40915307310)
and [GCC 8.3 CI](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40915307286).
The initial tag-triggered Windows attempt exposed a fake-display peer ordering
race; its failed log is retained. An independent test-only correction does not
change the accepted production workers or immutable release archives.

Eight fresh registry-only consumer projects pass on Windows/Linux: strict
TypeScript, framework/server matrix, installed browser assets, HTML/image
capabilities, recovery and 15 native managed-file profiles. Those profiles
use synthetic RDP state; the actual application/platform RDP checks above
remain separate evidence.

Final registry-built standalone [workflow 40915307138](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40915307138)
passes Windows/Ubuntu build, portable/installed upgrade acceptance, aggregate
verification and publication. All seven public files below were downloaded
and checked against the final manifest, GitHub digest and checksums.
`candidateOnly` is false; the source is the public core tag above.

| Final public file | Bytes | SHA256 |
| --- | --- | --- |
| `freerdp-bridge_0.6.0_amd64.deb` | 122226690 | `87fa1831b5b5d8de28708d44c1f57b545125297a1f4e95efc9cf6580e06bccdf` |
| `freerdp-bridge-0.6.0-1.x86_64.rpm` | 122801498 | `48e4da49bdfb0803322a21b01bd42e0a5f7dd848aff83fabc700b83c184162a0` |
| `freerdp-bridge-0.6.0-corresponding-source-linux-x64-gnu.tar.gz` | 4008558 | `c6d2778d55aeebfecb91efb02f533a79777975751ee6c015e25deebd23778d8d` |
| `freerdp-bridge-0.6.0-corresponding-source-win32-x64.tar.gz` | 440163 | `6c06e60bfa72fb440bcc278a19d222a8682f50c87c47318b6515b25b9da5f005` |
| `freerdp-bridge-0.6.0-linux-x64-gnu.tar.gz` | 122563827 | `442ad3fb30c09496d889b3661c1fb6b5dd1d5db31ecdb29f76bf94abd5453908` |
| `freerdp-bridge-0.6.0-win32-x64.msi` | 36837695 | `8019d33db826150488cc3eaa8c4fdb2f3f1bb5a5963d08ec6c8d6aea78dc1666` |
| `freerdp-bridge-0.6.0-win32-x64.zip` | 47875625 | `e92ac4190d3ddac88a4fcda50b410af74dd8ecd9e03a8e956708d451b4013281` |

Final public DEB/RPM upgrade from the exact public 0.5.0 seed passes on Astra
Linux 1.7.5 and RED OS 7.3: non-root service, strict native TLS refusal,
crash recovery, configuration retention, reinstall and uninstall. Both final
installed services also pass actual HTTP/RDPDR file transfers, read-only
refusals, ownership/lifecycle cleanup, configuration restoration and uninstall.
These are separate from hosted Windows/Ubuntu acceptance.

The final Linux portable has 4253 byte-and-mode-identical entries to the
accepted candidate. The Windows portable has 4136 matching file identities
except the rebuilt `bridge-service.exe`; its service wrapper is covered by
the final hosted Windows installation tests. Service JS, private Node and
native runtime bytes are identical, preserving the earlier actual portable
RDP evidence. Native workers retain the two SHA256 identities above.

Local evidence: `managed06-final-public-delivery-acceptance.json`,
`managed06-public-registry-consumers.json`,
`managed06-{windows,linux}-public-package-equivalence.json`,
`managed06-public-installed-labs/` and
`managed06-public-files-installed-{astra,redos}-acceptance.json`.
Original failures and source/platform/compiler boundaries remain recorded;
this release does not complete all Stage 7 or enable file clipboard.

## Remaining scope

File clipboard, the wider resource/quota/soak matrix, arbitrary server/device
support and the remaining original TODO requirements remain open. Historical
failed attempts remain in local evidence: missing fuzz link sources, legal
try-lock contention, a Windows-host bind filesystem without exclusive rename,
a WiX long-path refusal and test-driver guard mismatches were resolved without
weakening production checks or repeating successful native builds unnecessarily.
