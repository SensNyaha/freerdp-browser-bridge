# Iteration 457 — public standalone 0.2.5 acceptance

All ten exact npm packages and five GitHub Releases are public. All five npm
OIDC workflows pass, including the first actual Express OIDC write without
browser approval. All four fresh registry-only adapters pass on Windows/Linux,
with accepted installed graph integrities. [Npm evidence](ITERATION_456.md).

Automatic main-push installer workflow **40028484992** completes successfully:
plan **120670539649**, Windows **120670593620**, Ubuntu **120670593636**,
combined verify **120674450507**, publish **120674616958**. Both OS jobs pass
portable/private runtime checks and actual installed service **0.2.4→0.2.5**
upgrade, old-worker retirement, identity/JWT/native TLS, crash recovery,
reinstall and uninstall. CI reports actual RDP desktop as false; the independent
eight named real RDP profiles remain in [local acceptance](ITERATION_455.md).

The exact public main additionally passes source/foundation run **40028485015**
(including its sanitizer/fuzz jobs) and GCC 8.3 foundation **40028485069**.
Receipt: build/iteration-457-main-ci.json. Maintained Fastify registry-only
test-helper commit **94c8498** passes exact/archive and public consumers on both
OSes and full linked Windows pnpm check (1004 pass / 63 skips / zero failures).
Documentation checkpoint **0dbfe40** records public npm acceptance. These
post-tag tests/docs commits do not repack product archives or move release tags.

## Immutable source and public bytes

The original accepted root v0.2.5 stays at
231bda2db297d4d4061cb13e3843c6f4bffc5b0b. Public source exports continue each
repository's existing history. All five main branches and v0.2.5 tag commits
match, and all old v0.2.4 tags remain unchanged. No force push or tag movement.

| Repository | Exported main / v0.2.5 commit | Release ID |
| --- | --- | --- |
| SensNyaha/freerdp-browser-bridge | `c408783ccdb39380d985586e017fe0c994912ee1` | 422316927 |
| SensNyaha/freerdp-bridge-fastify | `0f3904a167f0f31f70d1a6dde0c212cf4471b1f1` | 422329924 |
| SensNyaha/freerdp-bridge-nestjs | `2c75f906085a5ff8952cf03f1f1293861914f3a3` | 422330376 |
| SensNyaha/freerdp-bridge-http | `c41d652d3691d4c7aba20441edc59eab7cb38e71` | 422330855 |
| SensNyaha/freerdp-bridge-express | `23c68d1093858a589219250df341dbe4b70da2bc` | 422333232 |

The [core Release](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/v0.2.5)
contains the exact core npm inputs and nine standalone files: MSI, DEB, RPM,
Windows ZIP, Linux TGZ, two corresponding-source archives, checksums and
standalone-manifest.json. Final manifest has candidateOnly false and exact source
c408783ccdb39380d985586e017fe0c994912ee1. Every downloaded file matches server
size/SHA-256; the seven distribution/source files also match manifest SHA-512.
Read-only release preflight verifies the final public manifest and all expected
assets; no partially published installer set is accepted.

| Final public file | Bytes | SHA-256 |
| --- | --- | --- |
| `freerdp-bridge_0.2.5_amd64.deb` | 121930648 | `ab1cfca521f3391877ae991f14cf426854d6256de69cbb3158baaa5475be79f8` |
| `freerdp-bridge-0.2.5-1.x86_64.rpm` | 122483701 | `bcd63d08b9f11f0e87c4345e72b0bcaf7d194102b4c4dc993fb55a7a0342ed17` |
| `freerdp-bridge-0.2.5-corresponding-source-linux-x64-gnu.tar.gz` | 4009862 | `a6df6cfaabf197989780b7e4f2d73c760e2bae0dfea52130df488d99e9225273` |
| `freerdp-bridge-0.2.5-corresponding-source-win32-x64.tar.gz` | 440173 | `c022b7e671bd700326b34abc2ac303e743f3711f6c8e0cef63953431e10c465c` |
| `freerdp-bridge-0.2.5-linux-x64-gnu.tar.gz` | 122266721 | `9a9dbe788af1c1043ca6e1f789b2d592e6ef86de9631ff33ab5fcc3778a28e55` |
| `freerdp-bridge-0.2.5-win32-x64.msi` | 36668221 | `0867d5700d058c579c609c6ff3e4732d0412a12c163670e9cee2e3d14dd2286a` |
| `freerdp-bridge-0.2.5-win32-x64.zip` | 47642837 | `1eb0fa2417b37e89c591e056996cbecb0da5cd32c8e4c9c8f4ce01f534c42bad` |

Receipts: build/iteration-456-final-installer-downloads.json,
build/iteration-456-final-public-delivery.json and build/public-standalone-456/.
The final archive hashes differ from local candidates; candidate hashes are
preserved separately, not substituted as final-artifact evidence.

## Installed lab verification of these final public files

| Host | Exact final file | 0.2.4→0.2.5 installed matrix |
| --- | --- | --- |
| Astra Linux 1.7.5 | DEB ab1cfca521f3391877ae991f14cf426854d6256de69cbb3158baaa5475be79f8 | PASS |
| RED OS 7.3 | RPM bcd63d08b9f11f0e87c4345e72b0bcaf7d194102b4c4dc993fb55a7a0342ed17 | PASS |

Each final package is rehashed locally and after pinned-host-key SFTP transfer;
the installed fixture checks the actual OS/version, non-root system service,
upgrade from the retained exact 0.2.4 package, old-worker retirement, public
configuration preservation, native version/TLS/JWT, crash recovery, reinstall,
joined cleanup and uninstall. Receipts/logs use iteration-456-final- prefixes,
preserving earlier candidate evidence. Secrets remain in private memory/stdin;
no production or session credentials enter argv, environment, artifacts or logs.

Independent empty-cache registry-only payloads match every accepted candidate
byte on Windows (4100 files) and Linux (4208 files); [comparison](ITERATION_456.md).
This is separate from final archive metadata and installed OS acceptance.
No additional audio/device/shared-viewing/recording capability is claimed.

The public 0.2.5 delivery gate is accepted.
Historical 0.2.3 JS publication was an open decision at this checkpoint;
the user subsequently archives it without further npm publication on 2026-10-24
([decision](ITERATION_458.md)). Project-owned cleanup and documentation
consolidation remain separate work. After those gates continue TODO features on
separate branches under the superseding 2026-10-24 user direction. No desktop GUI.

Fresh read-only historical audit (build/iteration-457-legacy-023.json) confirms
both 0.2.3 runtimes public at accepted integrity, seven JS versions absent, and
repository metadata absent from all nine unchanged accepted archives. npm's
[trusted publisher requirements](https://docs.npmjs.com/trusted-publishers/)
require the package repository URL to match the publishing GitHub repository.
The accepted 0.2.3 bytes are not repacked, and the user's stopped manual approve
queue is not resumed. A scope decision is requested separately: archive that
historical npm gap, prepare a one-time historical approval, or retain it open.
The subsequent explicit answer retains 0.2.3 as archived and accepts 0.2.4/0.2.5
instead of publishing those seven historical JS versions. Preserve its accepted
artifacts and evidence during cleanup; do not resume its manual approval queue.
