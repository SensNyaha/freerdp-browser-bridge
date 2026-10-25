# Iteration 433 — node:http 0.2.3 release acceptance

2026-10-23. Implementation `6a5c432` is accepted through its separate feature
branch and merged before `release/0.2.3`; alignment checkpoint is `5a9cf52`.
[Feature evidence](history/iterations/401-450.md#iteration-431), [release preparation](history/iterations/401-450.md#iteration-432).
The annotated immutable `v0.2.3` identifies the final accepted release commit.
Prior tags/archive bytes remain unchanged. Registry publication is separate.

## Accepted distribution

`@freerdp-bridge/http` prepares the existing bridge engine for Node.js 24
`http.Server`/`https.Server`, with an explicit host request dispatcher and
selective automatic/manual WS ownership on the same listener. Independent
close preserves host HTTP/foreign WS. The bounded per-host pool supports 16
non-overlapping prefixes using one close observer and one automatic upgrade
dispatcher. The host still owns its server shutdown and must join bridge/WS
before waiting for the final server-close callback.

One C++20 worker per session remains outside Node over private IPC. Strict
certificates, identity/Origin/ownership, body/parser limits, bounded media/control
and token contracts are unchanged. Fastify is an internal router dependency;
the host does not need to become a Fastify application. HTTP/2, new devices,
audio quality, arbitrary OS/security profiles and complete V1 are not accepted
by adapter tests. [Usage guide](NODE_HTTP_USAGE.md).

All seven JS packages and both native runtimes are **0.2.3**. FreeRDP remains
3.32.1 at `bf217a504e54cc719880c228e82353382cd7d4fa`; dependency recipes,
compiler support, Release flags and wire/ABI versions are unchanged. The explicit
runtime install is Windows x64 or Linux x64/glibc. Node/browser remain host
prerequisites; the consumer needs no compiler, SDK or system FreeRDP.

## Final aligned checks

| Gate | Windows x64 | Linux x64 |
| --- | --- | --- |
| Clean linked native CTest | MSVC 19.44.35228: 36/36 | exact GCC 8.3.0: 37/37 |
| Clean native Node lifecycle | 27 pass / 1 skip | 40/40 |
| Full `pnpm check` | 941 pass / 61 skips / zero fail | 918 pass / 87 skips / zero fail |
| Exact HTTP npm consumer | strict TS and 10/10 | strict TS and 10/10 |
| Exact NestJS regression consumer | strict TS and 15/15 | strict TS and 15/15 |
| Exact Fastify regression consumer | strict TS, HTTP/WS/media/native TLS | same |
| Uninstall/missing import/reinstall, all three adapters | pass | pass |
| Nine exact archive README/audit/dry-run checks | pass | identical publication JS bytes |

Both clean native builds bind the same 369-file source hash:
`ea0e41568756c5a51d469887b68b86403e29f56b9f83a327c4d3956a29d7c282`.
Windows receipt: `build/native-clean-BVIjOf/receipt.json`; Linux fixture:
`build/native-clean-akZZnn`, copied receipt `build/release-432-native-linux.json`.
Previously source-rebuilt pinned SDK/dependency receipts are revalidated. No
older worker is relabeled as 0.2.3. Linux closure passes 34 ELF / 333 resolutions,
and flattened package relocation/codec probes pass with empty library overrides.
The IPC-only addon still has no FreeRDP dependency.

Compiler/foundation, installed-OS/security-policy and actual RDP-target evidence
remain distinct. This does not claim a new installed-Astra or RED OS/GCC 11
compiler run. Mandatory earlier GCC 11 support is retained without changing its
source/ABI policies; actual remote Astra/RED OS desktop profiles are below.

Final logs under `build/`: `iteration-432-{windows,linux}-native.log`,
`iteration-432-{windows,linux}-check.log`, `iteration-432-linux-stage-package.log`,
`iteration-432-native-npm-win32.log`. No production code changes follow these
full/native checks. The later documentation clarifies existing cookie/identity
behavior; [shared host contract](HOST_AUTHENTICATION.md) does not add cookie auth,
CORS support or a per-target authorization callback.

## Exact artifacts and external projects

The candidate set is `build/release-432-archives/`, with nine root README and
project LICENSE files. Both runtimes include notices/licenses, inventory/hashes,
IPC pairing and verified LGPL corresponding-source archives/recipes. Component
counts remain Windows 1 and Linux 4. Known lab password sentinels are absent in
the bounded decompressed audit; this is not unknown-secret detection, signing
or blanket legal/vulnerability clearance.

All nine archives match the official npm dry-run SHA-512, retained in
`release-432-npm-dry-run.json` with `release-432-artifact-audit.json`.
`iteration-432-archive-readmes.log` checks actual tarball README content. These
exact bytes are preserved for publication, without repacking.

External Windows/Linux npm projects install the exact publication archives,
without scripts or checkout imports. TypeScript uses `skipLibCheck: false`.
HTTP's 10 cases include installed browser assets, CA/hostname-verified HTTPS/WSS,
actual native strict RDP TLS refusal and the focused routing/lifecycle/bounds
matrix. Nest's 15 cases cover both actual host adapters. Fastify additionally
checks foreign host HTTP/WS survival and fake binary media. All three undergo
uninstall, missing-import verification and reinstall with native repeats.
These are exact tarball consumers, not registry-only acceptance.

Windows HTTP/Nest projects are `build/http-consumer-86yL2J` and
`build/nestjs-consumer-1aL3lY`; Fastify is `build/fastify-release432-Fg4Ey6`.
Linux HTTP is `build/http-consumer-ngJ8YG` under the isolated viewer test project.
Logs: `iteration-432-{http,nestjs,fastify}-exact-{win32,linux}.log`,
`iteration-432-reinstall-all-win32-decoded.log`,
`iteration-432-reinstall-all-linux.log`.

The first Windows reinstall wrapper reads a UTF-16 PowerShell log as UTF-8 and
fails receipt parsing before any package removal. A BOM-aware decoder fixes
only that local wrapper; the final unchanged package graph passes HTTP 10/10
and Nest 15/15 after reinstall. This failure is retained, not counted as passing.
The earlier feature-phase isolated ECONNRESET observation remains in 431; no
cause or production repair is inferred from the successful aligned repeats.

## Actual version-stamped RDP

The exact installed **0.2.3** HTTP/native packages run in the external app with
no SDK/library-path override. Its real Node server exposes host HTTP and bridge
HTTP/control/media on one port. Edge exercises the selected public upgrade mode
and renders the actual desktop. Approved certificate pins are unchanged;
credentials stay in authorized ignored helpers and private worker IPC.

| Target | Automatic WS | Manual WS |
| --- | --- | --- |
| Astra Linux 1.7.5, .56.20 | H.264 form + JPEG API pass | H.264 form + JPEG API pass |
| RED OS 7.3, .56.21 | H.264 form + JPEG API pass | H.264 form + JPEG API pass |

All eight pass nonuniform 1920x1080 rendering, confirmed 1280x720 resize,
restored 1920x1080, new media configuration/keyframes where applicable,
fresh-token reattach, host HTTP, bounded one-session/two-WS diagnostics and
joined PID/runtime cleanup. No application launch, text/clipboard/device action
or new sound-quality acceptance is added. Complete matrix is
`iteration-432-http-rdp-matrix.log`; individual receipts are
`iteration-432-{astra,redos}-http-{automatic,manual}-{h264,jpeg}.log`.
Earlier accepted actual NestJS/Fastify adapter profiles are retained; the table
here is the new version-stamped HTTP distribution profile.

## Release and publication boundary

All 0.2.3 release checks pass and permit shared merge/tag. Registry publication,
public exact integrity and fresh registry-only consumers remain pending. The
prior 0.2.2 set is staged/download-verified 8/8 and awaits owner 2FA; it is not
credited as public. Official staging can prepare the accepted 0.2.3 bytes next,
with approval still required before release availability.

Express 0.2.4 proceeds on its own branch only after this release checkpoint.
Other framework adapters require a concrete unmet need. Separate local delivery
repositories for the user's GitHub synchronization, standalone installers and
the original full V1 remain separate requested work.

## Accepted archive digests

| Package suffix | Bytes | SHA-256 |
| --- | ---: | --- |
| api | 99516 | `80b561a14b598e8325f9188976f48ca95d2fe0123c863eb1d594ea9dcf6123a7` |
| config | 9276 | `4e2afeb16edff9679759fc5312bc050031dd89e0d7b8a27523501d9c6bbb2958` |
| fastify | 3536 | `f556791f6ad502a1e631f0a3edb70885b004a225fe2b83c67f72c41fdcbbc08b` |
| http | 7478 | `a036f2577e4764010961c6b230783fba693864cd9b0cee74c315c45dd5c0a4cd` |
| nestjs | 8165 | `d78346375bd243915ea201a181fa577fafd9e55fe38298210e9b83247b4a2fa2` |
| node | 110658 | `9c87f5231b55746fa00fba07326ab05b12a0e9a613e8ad2cffbe018d865d0fae` |
| protocol | 38848 | `3938d65ddc13f32505e3ab05c07dcaf71a9c7e179cd434ddf33b59146c52a9b8` |
| runtime-linux-x64-gnu | 76474589 | `fcd57a164abd531b8cb6d51dd253025307033b54976bebb0b30e64956f487bf1` |
| runtime-win32-x64 | 6902225 | `e7c66b5560507ca0af0bab2035e749da25bdb4faa836d96ed571b49341437189` |
