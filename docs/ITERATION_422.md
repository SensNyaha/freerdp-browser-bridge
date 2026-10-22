# Iteration 422 — 0.2.1 release preparation

2026-10-22, `release/0.2.1`. The accepted Fastify implementation merges into
shared master at `bd9f6d3`, after `03aefc6`, `12cb6f0` and `b836b36`.
[Implementation checks](ITERATION_420.md), [installed-package actual RDP](ITERATION_421.md).

All six product package manifests and CMake now declare 0.2.1. The explicit
version guard passes with six manifests. FreeRDP 3.32.1 and its pinned commit,
dependency versions, native language mode and Release settings are unchanged.
Existing 0.2.0/0.1.0 tags and artifact bytes remain immutable.

This is preparation, not an accepted tag or npm publication. Fresh clean linked
MSVC/GCC 8.3 native consumers, corresponding native npm artifacts, external
consumer/runtime/RDP checks and final full regressions are required before
release merge/tag. Evidence is appended only after those checks finish.

The supported install path includes the platform native npm package explicitly
alongside Fastify. No compiler or network install script is required at the
consumer. Automatic optional package installation remains a future convenience.
Version-stamped artifacts must match the JS product version exactly; development
0.2.0 tarballs are not relabeled as 0.2.1.

## Fresh aligned native and full regression

The clean linked native consumers use the source/version checkpoint `96a1792`
and the existing source-rebuilt pinned SDK/dependency receipts. They do not
relabel the 0.2.0 binaries. Both native stages report bridgeVersion=0.2.1.

| Platform / compiler | Clean receipt | CTest | Focused Node lifecycle | Full pnpm check |
| --- | --- | --- | --- | --- |
| Windows x64 / MSVC 19.44.35228 | `build/native-clean-9il5P0/receipt.json` | 36/36 | 27 pass, 1 skip | 912 pass, 61 skips, 0 fail |
| Linux x64 / GCC 8.3.0 | `build/native-clean-DTmvaa/receipt.json` | 37/37 | 40/40 | 889 pass, 87 skips, 0 fail |

Evidence: `build/iteration-422-{windows,linux}-native.log` and
`build/iteration-422-{windows,linux}-check.log`. The compiler/foundation checks
do not substitute for actual remote desktop or installed OS acceptance.

## Exact npm artifact set and external projects

The candidate publication set is retained in ignored
`build/release-422-archives/`; no archive is published at this checkpoint.
The bounded audit verifies manifest versions, non-private metadata, resolved
workspace dependency versions, expected pack paths, project LICENSE files,
native notices and the Fastify README. It scans decompressed payloads for
known approved lab password sentinels in UTF-8/UTF-16LE without printing them.
This is a scoped content/integrity check, not a claim of complete license
clearance, unknown-secret detection or publisher signatures.

| Package suffix under @freerdp-bridge/ | Archive bytes | SHA-256 |
| --- | ---: | --- |
| api | 98120 | `74c5ecc616aa30dc075fe4d996f25a4b003b711b4305f646f2390cb13b97a2f9` |
| config | 8361 | `e063c81fb197a16b6c7047e06be134a78cc7bd405b70b73a9ecd8c853b0220ae` |
| fastify | 3331 | `aab4df20772d320e7e5b38a566816cab893cc46672f37215d1ebb76360645d2d` |
| node | 109614 | `a61840433c703455be8547fe5e4bdd91a6559d69577bd1c95436e193508c9698` |
| protocol | 37953 | `f6436919c03fee2bc7b84e99a5bf288c508b2ee5352ef5cdd6b29023e498be6a` |
| runtime-linux-x64-gnu | 72480864 | `94cb17cda0e1b92392dac47c2978e3a92b61c80a184632a023ddfbb627c6ae17` |
| runtime-win32-x64 | 6463309 | `255ae54c55b8ae23bf585e4d3f58bd1749c1f0c5abae7a8272eaa6ff92f7416b` |

Windows npm installs the actual tarballs into `build/fastify-consumer-Fkycpv/consumer`.
Linux offline pnpm first passes with its own generated tarballs, then separately
installs the exact candidate publication bytes in `build/release-422-consumer`.
Both pass strict TypeScript without skipLibCheck, host HTTP/WS coexistence,
fake binary media transport, browser assets, packaged native resolution and
actual native strict TLS refusal. Linux runs with empty LD_LIBRARY_PATH.
Evidence: `iteration-422-windows-npm-consumer.log`,
`iteration-422-linux-pnpm-consumer.log`, `iteration-422-linux-exact-consumer.log`
and `iteration-422-artifact-audit-final.log` under build/.

The Windows generator receipt now resolves its project root canonically before
computing relative paths. Running under a temporary SUBST alias retains local
relative receipt paths rather than writing absolute host paths. Regeneration
produces identical native archive bytes/SHA-256. Public payloads are unchanged.
The Fastify archive includes its new package README. Full regressions precede
the receipt-path-only correction; its narrow eslint/Prettier and actual generator
repeat pass afterwards. No native code changes follow the clean native builds.

Read-only npm CLI identity checks confirm the authenticated account is an owner
of the requested organization. No credential/token is read or printed. This
check does not publish packages or establish registry availability.

## Version-stamped browser / actual RDP

The lab application imports its bridge modules and native worker from the
exact installed candidate publication packages. Only instrumentation comes
from the checkout. Host publication remains loopback-only, certificate pins
are unchanged, and RDP credentials travel through bounded local helpers and
private worker IPC.

Astra Linux 1.7.5 at the updated .56.20 address passes H.264 through the
reference form and JPEG through the direct API: 1920x1080, 1280x720, restored
1920x1080, new media configuration/keyframes where applicable, fresh-token
reattachment, host HTTP survival, diagnostics with one session/two sockets,
and joined native/runtime cleanup. Evidence:
`build/iteration-422-astra-npm-h264-form-repeat.log` and
`build/iteration-422-astra-npm-jpeg-api.log`.

The initial test consumer transfer stopped before RDP startup: tar prefix
transformation changed relative pnpm symlink targets. Correcting only regular
names next exposed unprefixed hardlink targets. A fresh transfer transforms
regular names and hardlink targets while preserving relative symlink targets
(`flags=rh`). Installed-package imports and the Astra checks then pass. These
are retained harness failures, not changes to npm package contents.

Current RED OS 7.3 at .56.21 establishes connected state and decodes frames,
but the JPEG form (wallpaper=true), JPEG direct API and H.264 direct API fail
the existing nonuniform desktop predicate before resize. All join cleanup.
A bounded Ctrl+Alt+T probe, entering no command, also fails that predicate.
Evidence: `iteration-422-redos-npm-jpeg-form.log`,
`iteration-422-redos-npm-jpeg-api.log`, `iteration-422-redos-npm-h264-api.log`
and `iteration-422-redos-controlled-jpeg.log` under build/. This supersedes no
passing historical result: iteration 421 remains acceptance of its exact
development artifacts at that time. Current 0.2.1 RED OS acceptance remains
open; the image predicate/deadlines are not weakened to pass a blank desktop.

The unchanged previously accepted development package also fails the same
RED OS JPEG render predicate now (`build/iteration-422-redos-previous-package-control.log`),
while establishing connected state and joining cleanup. This narrows the
comparison but does not establish the cause. A read-only pinned-key SSH
inventory during that connection observes active xrdp/xrdp-sesman and one
user-owned Xorg, with none of its enumerated desktop-session process names;
the system XRDP logs remain unreadable. No remote service/configuration is
changed. The current desktop state is awaiting an independent ordinary-client
check by the user. The release remains untagged/unpublished meanwhile.

The real-project guide now distinguishes the Node.js application host from
the remote RDP server and explains where the compiled C++ binaries are shipped.
Ready native packages require compatible OS/runtime libraries rather than an
installed compiler or system FreeRDP. This does not claim arbitrary host support.
