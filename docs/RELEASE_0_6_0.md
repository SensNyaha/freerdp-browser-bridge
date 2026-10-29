# 0.6.0 release acceptance

## Status

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

These hashes identify the accepted archives. Public registry integrity, five
GitHub deliveries, final registry-built standalone artifacts and fresh public
consumer/install checks still require their own receipts.

## Remaining scope

File clipboard, the wider resource/quota/soak matrix, arbitrary server/device
support and the remaining original TODO requirements remain open. Historical
failed attempts remain in local evidence: missing fuzz link sources, legal
try-lock contention, a Windows-host bind filesystem without exclusive rename,
a WiX long-path refusal and test-driver guard mismatches were resolved without
weakening production checks or repeating successful native builds unnecessarily.
