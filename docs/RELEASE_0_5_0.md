# 0.5.0 release acceptance

## Status

**0.5.0 is fully publicly delivered and verified.** Ten exact npm packages are
latest 0.5.0; five GitHub Releases and OIDC workflows pass. Four fresh
registry-only consumers pass on each OS. Seven final standalone files and the
manifest/checksums are downloaded and verified; public 0.4.0 upgrades pass Astra
1.7.5 and RED OS 7.3, alongside final hosted Windows/Ubuntu installer acceptance.
Immutable private `v0.5.0` is `cec3b8e00da849dd524ce55917f76f39fcfe537c`;
public core tag commit is `31dcee4bd4128768f2b55e620f51fd221cc3bbb5`.
The former candidate checkpoints below retain their original scope.

The accepted image source is merged at `a1909bd`. Release preparation is on
`release/0.5.0`; `adcde20` fixes Windows recovery executable paths above MAX_PATH,
`3d055c6` aligns ten manifests/archives and both production locks, and `807126c`
admits the explicit 0.5.0 Linux application-test profile. No published archive
or existing tag has been replaced.

## Versioned checks

- Exact npm archives: ten root-README-complete packages, SHA-256/SHA-512 verified,
  known lab-secret scan and isolated official npm publish dry-run. The export
  input directory `build/release-50-archives` refers to the same accepted bytes
  as `build/release-0.5.0-archives`; it does not repack the packages.
- Four independent installed archive consumers on each OS: Fastify, NestJS,
  node:http and Express. Strict TypeScript, installed image capability/assets,
  quota/codec checks and actual native refusal/recovery pass. These are exact
  archive consumers; registry-only acceptance remains a publication gate.
- Full linked checks: Windows 1230 passed / 71 skipped / 1301 total; Linux
  1186 passed / 120 skipped / 1306 total. Zero failures/cancellations. Linked
  native CTest: Windows 40/40 and GCC 8.3 Linux 41/41.
- Final helper-source [foundation and sanitizers](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40498757183)
  and [exact GCC 8.3 foundation](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40498757179)
  pass at public `4ad216b`.
- Both [versioned bundled runtimes](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40496532691)
  pass at public `51bc17e`. Clean offline runtime/API assembly and the complete
  312,431,151-byte Linux image scan pass; its schema-validated SPDX contains
  300 packages. Later helper/docs changes leave production inputs unchanged.
- [Candidate installer CI](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40497112168)
  passes at public `ac64166`: MSI/DEB/RPM/ZIP/TGZ and two source companions,
  exactly seven verified files. Windows Server 2025 / Ubuntu 24.04 installation,
  immutable 0.4.0 upgrade, old-worker retirement, crash recovery, reinstall/config
  retention and uninstall pass. Publication is skipped, `candidateOnly: true`.
- Actual Astra 1.7.5 DEB and RED OS 7.3 RPM 0.4.0-to-0.5.0 upgrades pass with
  those exact CI packages. Non-root service, strict native TLS refusal, recovery,
  reinstall/config retention and uninstall pass. Installer fixtures make no
  RDP desktop claim.
- Eight separate actual standalone desktop profiles pass: exact CI Windows ZIP
  and installed CI Linux packages, each against Astra / RED OS, JPEG / H.264.
  Actual rendered frames, 1280x720 and 1920x1080 resizing, browser reattach,
  strict approved certificates, zero browser errors and joined cleanup pass.
- Three actual versioned PNG application profiles pass with npm-identical native
  artifacts: Windows, installed GCC 8.3 Linux RWS1 and Linux framed IPC. Headed
  Edge 156 and real OS clipboard APIs verify owned opaque 32x32 PNGs both ways,
  newer remote revision, explicit actions and revoke/cleanup. [Named scope](CLIPBOARD_BROWSER.md#versioned-050-image-application-acceptance).
- Actual RED OS 7.3 / GCC 11.4.1 fresh linked Release CTest passes 41/41 on the
  versioned 398-file native source digest. It reuses the accepted GCC 8.3 SDK;
  this does not claim a GCC 11 dependency rebuild or Node-addon/RDP acceptance.

Local `build/current-validation/image05-versioned-platform-acceptance.json`
binds 66 inputs, retained logs/reports, all eight versioned desktop copies and
585 unchanged production files. Per-profile evidence distinguishes native,
mock-worker, real desktop and real OS clipboard tests.

## Retained failures and lab maintenance

The initial RED OS upgrade hit insufficient disk space; its logs remain.
After removing two unused, checksum-verified older Node copies, the same
package and assertions pass on retry. The initial Astra desktop attempt refuses
an issuer-clock skew above 900 seconds before connecting. Under explicit user
instruction its UTC is corrected over pinned SSH; NTP stays active/enabled and
the timezone is unchanged. The two unchanged Astra profiles then pass.
After internet is restored, DNS resolves and ntpd selects a peer with measured
zero-second skew. Final post-desktop checks prove both temporary services absent
and only the original public default configuration retained.

At the user's disk-space request, 15 old RED OS test contexts are removed after
process/reference checks and local preservation of logs. Measured free space
increases from 847,319,040 to 2,597,601,280 bytes. Current 0.5.0 inputs, immutable
0.4.0 seed and retained toolchain remain. The local cleanup receipt records exact
paths, metadata and saved-evidence digest. No system/application files are removed.

## Exact accepted npm archives

Do not rebuild these bytes for publication.

| Package | Bytes | SHA-256 |
| --- | --- | --- |
| `@freerdp-bridge/api@0.5.0` | 115494 | `8a352c934cf9f25d9c95e40a91be35ea3ffc988a9ef26ef88e542f5f311d00b3` |
| `@freerdp-bridge/config@0.5.0` | 9954 | `641888a4826057822d946500d041028b62ba85b10df3940074bec2baf4898d90` |
| `@freerdp-bridge/express@0.5.0` | 5858 | `80f7b24927d238b4a9c79059100c0ee9fe330a8355cf6f2fc46318039a351e9a` |
| `@freerdp-bridge/fastify@0.5.0` | 4433 | `ae1445d68c9ce37710978c250185f88ff9bc4337d4cbb3b39d2b787d809943bf` |
| `@freerdp-bridge/http@0.5.0` | 8403 | `a5dbbe2cc40eb5398cf59391d7b2225082fb77a3123c03798f2956e569b325db` |
| `@freerdp-bridge/nestjs@0.5.0` | 9120 | `4924c726c10cbeb98979fad885f5bb8615fee12a5748ca4772f0fa6a95cc65c8` |
| `@freerdp-bridge/node@0.5.0` | 127822 | `ad093eb9325468ace12019d7fe3ab6cbd4bd8cbee9a68af97a731969fa990d9b` |
| `@freerdp-bridge/protocol@0.5.0` | 44113 | `656627349611e988097559c8c799b0e673da0e79b720899feca1131ff3abbbaf` |
| `@freerdp-bridge/runtime-linux-x64-gnu@0.5.0` | 76540142 | `8c36e55e21de2490d5eb593af08bbf392b10cbe1bbae63f79e1cfa1cd6b2ea30` |
| `@freerdp-bridge/runtime-win32-x64@0.5.0` | 6938328 | `22ff3eecf42f57a4472e3486efa4e7d471d0148488a430186e83475b3191de48` |

## Delivery completion and limits

The accepted release branch is merged, the annotated tag is immutable, five
history-preserving delivery repositories are pushed, and exact OIDC publication,
fresh registry consumers and final public standalone upgrades all pass.

Image acceptance does not establish arbitrary alpha/color-space fidelity,
universal browser/server behavior, file clipboard, complete Stage 7 or V1.
The standalone web service and installers remain in scope; desktop GUI does not.


## Public delivery

The final audit confirms all ten named versions and latest tags at the exact
accepted SHA-512, all five main/tag/Release bindings and all previous 0.4.0
annotated tags unchanged. Each adapter keeps its own repository and tested
build/declarations/fixtures. Shared JS dependencies install transitively; the
platform native runtime remains an explicit matching-version dependency.

| GitHub Release | Tag commit |
| --- | --- |
| [SensNyaha/freerdp-browser-bridge](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/v0.5.0) | `31dcee4` |
| [SensNyaha/freerdp-bridge-fastify](https://github.com/SensNyaha/freerdp-bridge-fastify/releases/tag/v0.5.0) | `8955b4f` |
| [SensNyaha/freerdp-bridge-nestjs](https://github.com/SensNyaha/freerdp-bridge-nestjs/releases/tag/v0.5.0) | `6438d0a` |
| [SensNyaha/freerdp-bridge-http](https://github.com/SensNyaha/freerdp-bridge-http/releases/tag/v0.5.0) | `fafa0a6` |
| [SensNyaha/freerdp-bridge-express](https://github.com/SensNyaha/freerdp-bridge-express/releases/tag/v0.5.0) | `3fe747f` |

All five automatic OIDC workflows pass: [Publish accepted npm archives / core](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40529044144), [Publish accepted npm archives / fastify](https://github.com/SensNyaha/freerdp-bridge-fastify/actions/runs/40532914797), [Publish accepted npm archives / nestjs](https://github.com/SensNyaha/freerdp-bridge-nestjs/actions/runs/40532915337), [Publish accepted npm archives / http](https://github.com/SensNyaha/freerdp-bridge-http/actions/runs/40532912833), [Publish accepted npm archives / express](https://github.com/SensNyaha/freerdp-bridge-express/actions/runs/40533973952).
No manual per-package 2FA queue is used. Tag foundation/GCC 8.3 and the
additional identical main foundation also pass. The initial local export's
native-smoke refusal is retained; unchanged detailed consumer and complete
native-smoke reruns pass before the remaining exports are resumed. No source,
accepted archive or existing tag is changed to pass that retry.

All eight fresh registry-only consumers pass: Fastify, NestJS, node:http and
Express on Windows and Linux. Strict TypeScript, installed image/HTML assets
and capability/codec/quota checks, real native TLS refusal/lifecycle and runtime
recovery pass. These consumers use public npm dependencies, with no checkout
imports or local archive overrides. They distinguish fake desktop transport
from actual native and named PNG application acceptance.

Final [standalone CI](https://github.com/SensNyaha/freerdp-browser-bridge/actions/runs/40532820944)
passes Windows Server 2025 / Ubuntu 24.04 installation, 0.4.0 upgrade, old-worker
retirement, recovery, reinstall/config retention and uninstall. Its combined
manifest admits exactly seven files, `candidateOnly: false`; publication and
strict public readback pass. All seven files below are downloaded and match
both SHA-256 and SHA-512. The downloaded public manifest and SHA256SUMS agree.

| Public standalone file | Bytes | SHA-256 |
| --- | --- | --- |
| `freerdp-bridge_0.5.0_amd64.deb` | 122016974 | `7179bceafbec230762691a569efdd0b7d8c994ac2d63b077bda1de564c6929bc` |
| `freerdp-bridge-0.5.0-1.x86_64.rpm` | 122602856 | `f0bd4bdf42d1126fb3158fd4dace8e53b14f3ecb4fdcd9ba40988492034e214e` |
| `freerdp-bridge-0.5.0-corresponding-source-linux-x64-gnu.tar.gz` | 4009873 | `295b99dc7dc9326ffaf78c8b49cff20005a048d0da11c2b7311aaa84a631fbbc` |
| `freerdp-bridge-0.5.0-corresponding-source-win32-x64.tar.gz` | 440160 | `86021951bd1eda5f2cc1c2eff64cb6a7c0a371a63c2d776f3f9c2da5563ba52f` |
| `freerdp-bridge-0.5.0-linux-x64-gnu.tar.gz` | 122365825 | `a14e0f8dab088ff5c49acb92c71a8ab581fccd20b35a696b539770b8239cd1b4` |
| `freerdp-bridge-0.5.0-win32-x64.msi` | 36732951 | `eb20428e9be8ad43fa0e891a2f2864bd948a053857db4148010d5f27a0e67666` |
| `freerdp-bridge-0.5.0-win32-x64.zip` | 47736006 | `c3c476d4db295d81a459232b9ce1be2ddbe6fd26de01c866475ed3010eb5b49c` |

The exact final public DEB and RPM independently pass actual Astra 1.7.5 and
RED OS 7.3 upgrades from immutable public 0.4.0, non-root service, strict native
TLS, old-worker retirement/recovery, reinstall/config retention and uninstall.
Their fixtures do not make a real RDP desktop claim. The eight actual desktop
profiles above belong to versioned candidate acceptance; the three actual PNG
profiles use native bytes identical to the published npm cohort.

After final acceptance, obsolete candidate contexts are removed only after
input hashes/process references and saved logs are checked. One current public
0.5.0 test context is retained per lab. RED OS has 2,596,548,608 bytes free and
Astra 7,262,810,112 bytes free at the cleanup check; toolchains remain. Bridge
services/programs are absent and original public default configs remain.

Local `build/current-validation/image05-public-delivery-acceptance.json` binds
68 final inputs, including terminal workflow logs, eight registry logs, public
artifact hashes, named OS upgrade reports and post-cleanup state. Earlier
source/versioned receipts remain separate. Full Stage 7/V1, managed drives,
file clipboard, total resource budgets and broader browser/device matrices
remain open. The archived partial 0.2.3 is not republished.
