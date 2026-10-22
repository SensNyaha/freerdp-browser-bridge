# Iteration 429 — NestJS 0.2.2 release acceptance

2026-10-22. The implementation `a8afefb` is accepted and merged at `dd33501`;
separate `release/0.2.2` begins with version checkpoint `aade8e3`.
[Feature acceptance](ITERATION_427.md), [release preparation](ITERATION_428.md).
The annotated immutable `v0.2.2` identifies the final accepted release commit.
Existing 0.1.0/0.2.0/0.2.1 tags and archive bytes are unchanged.

## Accepted distribution and limits

NestJS 12.2.0 / Node.js 24 applications mount the existing bridge engine on
their own Express 5.3.0 or FastifyAdapter/Fastify 5.12.7 listener. The explicit
bridge prefix, verified host identity callback, DI configuration and joined
lifecycle are provided by `@freerdp-bridge/nestjs`. Internal routing pins
Fastify 5.12.5. Host-owned HTTP/1.1 and HTTPS/WSS pass with CA/hostname
verification; no extra HTTP port or proxy process is created.

Each session retains one separate C++20 worker, private IPC, strict RDP
certificates, bounded queues/control/media, ownership and Origin checks.
Independent close preserves host HTTP/foreign WS; whole-Nest shutdown joins
the bridge resources. This accepts the named adapter profiles, not HTTP/2,
new devices/audio quality, macOS/ARM/musl, arbitrary OS/security profiles or
the complete original V1. [Real-project guide](NESTJS_USAGE.md).

All six JS packages and two native runtimes are **0.2.2**. FreeRDP remains
3.32.1 at `bf217a504e54cc719880c228e82353382cd7d4fa`. Dependency pins, Release
flags and language/ABI policies are unchanged. Windows x64 and Linux x64/glibc
runtime packages are installed explicitly; consumers need neither a compiler,
system FreeRDP nor network install scripts. Node.js/browser remain prerequisites.

## Final checks

| Gate | Windows x64 | Linux x64 |
| --- | --- | --- |
| Clean source linked native CTest | MSVC 19.44.35228: 36/36 | exact GCC 8.3.0: 37/37 |
| Clean native Node lifecycle | 27 pass / 1 platform skip | 40/40 |
| Full aligned `pnpm check` | 932 pass / 61 skips / zero fail | 909 pass / 87 skips / zero fail |
| Exact NestJS external npm consumer | strict TS, 15/15 | strict TS, 15/15 |
| Nest uninstall, missing import, reinstall | strict TS and 15/15 again | strict TS and 15/15 again |
| Exact Fastify regression consumer | strict TS, HTTP/WS/media/native TLS | same |
| Fastify uninstall, missing import, reinstall | pass | pass |
| All eight exact archive README/metadata/integrity checks | pass | identical candidate set |

Both clean native builds bind the same 369-file source snapshot:
`dba7bcd220813cc0b2a8788f32d6371e42f7b926c3e55df62b96177df01e1419`.
Receipts are `build/native-clean-7QO67D/receipt.json` and the copied
`build/release-428-native-linux.json` (Linux fixture `native-clean-7exS0B`).
The existing source-rebuilt pinned SDK/dependency receipts are revalidated;
no earlier-version worker is relabeled as 0.2.2. Linux private closure checks
34 ELF files / 333 resolutions and package relocation succeeds with empty
library-path overrides. The IPC-only addon still has no FreeRDP dependency.

Compiler/foundation results remain separate from installed distro and actual
desktop results. This is not a new installed-Astra/security-profile acceptance
or remote RED OS/GCC 11 compiler run. Its previously accepted mandatory support
is retained; no GNU version requirement or source portability rule changes.

Final logs under `build/` are `iteration-428-windows-native.log`,
`iteration-428-linux-native-root.log`, `iteration-428-windows-check-network.log`
and `iteration-428-linux-check.log`. The full suites include all 14 final
Nest module cases, including host HTTPS/WSS. The later producer-only exact
archive helper changes additionally pass narrow ESLint/Prettier and actual
external consumer checks; no native/runtime code changes after the clean builds.

## Exact artifacts and consumers

The immutable candidate set is `build/release-428-archives/`. Every package has
its own explanatory root README and project LICENSE. Native packages also carry
notices/licenses, pairing metadata, inventory/hashes and verified LGPL source
archives/recipes. Source component counts remain Windows 1 and Linux 4.
`iteration-428-archive-readmes.log` verifies all eight actual archive READMEs.

The bounded audit checks expanded workspace dependency versions, pack paths,
metadata and absence of known approved lab password sentinels in decompressed
payloads, without recording the passwords. It is not unknown-secret detection,
publisher signing or a blanket legal/vulnerability clearance. The exact audit
is `release-428-artifact-audit.json`; all eight official npm dry-runs match its
SHA-512 (`release-428-npm-dry-run.json`). No archive is repacked for publication.

Windows and Linux consumers install the exact same JS archive bytes and their
appropriate native archive with npm `--ignore-scripts`. Strict TypeScript uses
`skipLibCheck: false`. Native resolution and browser assets come from installed
packages, with no source-checkout imports. Nest's helper now supports bounded
`--archives build/release-428-archives`, verifies packed names/versions and
refuses an unlinked runtime. All 15 checks run, including native strict RDP TLS
refusal and fixture-CA HTTPS/WSS. These are tarball consumers, not registry-only
NestJS acceptance.

Nest projects: `build/nestjs-consumer-loo85J` (Windows), Linux
`build/nestjs-427-check/build/nestjs-consumer-q0gVkg` in the owned viewer
container. Exact consumer/reinstall logs are
`iteration-428-nestjs-exact-consumer-win32.log`,
`iteration-428-nestjs-exact-consumer-linux-local.log`, and
`iteration-428-nestjs-reinstall-{win32,linux}.log`.
The Fastify regression additionally verifies surviving foreign HTTP/WS and fake
binary media plus native TLS refusal after reinstall, in separate projects
`fastify-release428-9BEJBp` and `fastify-release428-A0fk7C`.

## Versioned actual RDP

The installed **exact 0.2.2** Node/native packages serve public prefixed
HTTP/control/media routes through the real Nest host adapter. Headless Edge
renders the actual RDP desktop. Credentials stay in authorized ignored lab
helpers and private worker IPC; approved certificate pins are unchanged.
No SDK/library-path override, application launch, text/clipboard/device input
or new sound-quality claim is introduced.

| Target | Express | FastifyAdapter |
| --- | --- | --- |
| Astra Linux 1.7.5, .56.20 | H.264 form and JPEG API pass | H.264 form and JPEG API pass |
| RED OS 7.3, .56.21 | H.264 form and JPEG API pass | H.264 form and JPEG API pass |

All eight profiles pass nonuniform 1920x1080, confirmed 1280x720 resize,
1920x1080 restoration, new media configuration/keyframes where applicable,
fresh-token reattach, host HTTP availability, bounded one-session/two-WS
diagnostics, and joined PID/runtime cleanup. Complete success matrix:
`iteration-428-nest-rdp-matrix.log`; individual receipts end in
`iteration-428-{astra,redos}-nest-{express,fastify}-{h264,jpeg}-index-assets.log`.

## Retained setup failures and publication boundary

The first Linux clean invocation is refused because its SDK receipt is outside
the isolated fixture project's build root. The final clean build runs in the
original compiler workspace with the original validated receipt graph. Native
source is still copied into a fresh output fixture; the guard is not relaxed.
Likewise the first external Linux exact-archive invocation refuses archives
outside its project build directory. Copying the unchanged archives inside
that build directory permits the final acceptance without weakening the guard.

Windows' initial dependency refresh prompts for reinstall; the noninteractive
repeat explicitly uses CI mode. Its offline store lacks new Nest tarballs, so
an authorized strict-TLS frozen-lockfile network install restores the graph.
The first native npm invocation during that incomplete install fails an import;
the final repeat uses the same stage and passes after dependencies are restored.
Earlier logs remain separate; neither failed attempt is credited as acceptance.

The release checks are complete and permit shared merge/tag. npm publication is
**pending** at this checkpoint. Successful dry-run does not establish registry
availability. Publish only these exact eight archives, then compare public
`dist.integrity` and run fresh registry-only Windows/Linux consumers before
crediting publication. GitHub delivery repositories, node:http 0.2.3,
Express 0.2.4 and standalone installers remain requested subsequent work.

## Accepted archive digests

| Package suffix | Bytes | SHA-256 |
| --- | ---: | --- |
| api | 99513 | `2892030c28d6674bff1ea2bcad06321d738a34d55c56d3f76bc92a2e69dd3832` |
| config | 9276 | `3d5cb7e5dc2f4b004e08021ab2d152dee3e51ad9015c234899887fcc37d3967d` |
| fastify | 3536 | `9766105e1ee6d186254f0d8e957be1b52d0e26fbc20e4335f78f07128d30e648` |
| nestjs | 8161 | `2639a700e33c23b078ea0fb3383df21597a79fbe69c42f8eb2110f5fda5cd7b9` |
| node | 110658 | `f762962291e7155719b3d10d0d109ad369ca235ab82cced62afd19e52df91645` |
| protocol | 38848 | `4141e4a9951db5e0a8df03307ad16f9c38584a78a54fc151e8ee6e2cb3ea370f` |
| runtime-linux-x64-gnu | 76474682 | `c6b979c689e59ffaf0dbcb7293e9aaa157d3f2ab74b236b30ebfade2c6b20ced` |
| runtime-win32-x64 | 6902225 | `9a915d6fc6a4cb033422bbe4fdc5360c6c5b69146e7b324db2c7d235cc4c6f60` |
