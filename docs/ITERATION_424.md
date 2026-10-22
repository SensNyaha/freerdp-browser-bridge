# Iteration 424 — Fastify 0.2.1 release acceptance

2026-10-22. Implementation is accepted through `feature/fastify-0.2.1` and
merged at `bd9f6d3`. Release work follows in `release/0.2.1`: `96a1792` aligns
six manifests and CMake, `7885125` records native/consumer checks and usage,
and `c31951a` ships hash-verified corresponding source with the native packages.
The release branch is merged only after the checks below pass; annotated
`v0.2.1` identifies its final release commit. Existing tags/artifacts remain
immutable. Registry publication is a separate operation, recorded below.

## Accepted distribution

The host Node.js 24 / Fastify 5 application mounts authenticated, strictly
validated HTTP/WS under its configured prefix on its existing listener.
Unrelated host HTTP/WS routes remain available. Sessions use one separate
native worker, private IPC, unchanged certificate/Origin/ownership checks,
bounded media/control and joined cleanup. Browser assets and bounded optional
session diagnostics are included. Own code is MIT; bundled dependencies retain
their licenses and native LGPL source archives/recipes accompany the binaries.

Installation explicitly includes `@freerdp-bridge/fastify@0.2.1` and the matching
`runtime-win32-x64` or `runtime-linux-x64-gnu` package. Native binaries, helpers,
pairing metadata, private libraries and notices come from that package; the
consumer needs neither a compiler/SDK nor system FreeRDP. Automatic optional
native installation is not claimed. These are Windows x64 and Linux x64/glibc
profiles; arbitrary OS/CPU/security profiles, macOS/ARM/musl and new devices
are not accepted by these checks. Node.js/browser remain prerequisites.

All JS/native versions are 0.2.1. FreeRDP remains 3.32.1 at
`bf217a504e54cc719880c228e82353382cd7d4fa`. Native C++20/Release flags and
dependency pins are unchanged. GCC 8.3 compiler/foundation checks remain
distinct from installed distro acceptance; the mandatory previously recorded
RED OS/GCC 11 control is retained, not claimed as a new remote compiler run.

## Verification

| Gate | Windows x64 | Linux x64 |
| --- | --- | --- |
| Clean linked native CTest | MSVC 19.44: 36/36 | exact GCC 8.3.0: 37/37 |
| Clean native lifecycle | 27 pass / 1 platform skip | 40/40 |
| Final full pnpm check | 915 pass / 61 skips / 0 fail | 892 pass / 87 skips / 0 fail |
| Source companion corruption/path/limit tests | 3/3 | 3/3, including final malformed-record cases |
| Exact external package consumer | npm cached/offline | pnpm offline |
| Strict TypeScript, host HTTP/WS, actual native TLS refusal | pass | pass |
| Uninstall, missing import, reinstall and actual native repeat | pass | pass |

Linux also passes upgrade/rollback between the previous **development**
0.2.0 tarball set and 0.2.1; that does not create stable 0.2.0 Fastify support.
The native clean receipts and their exact worker/helper hashes are recorded
in [422](ITERATION_422.md). Final package hashes and source companions are
recorded in [423](ITERATION_423.md). The new source/notices packaging preserves
both runtime manifest byte streams and every native runtime file hash.

Final full regression logs are
`build/iteration-423-windows-check-isolated.log` and
`build/iteration-423-linux-check.log`. Final malformed-source guard cases run
after the Linux full check and pass narrowly; the production runtime is not
changed by those producer-only guards. The earlier interrupted/failed Windows
run remains a failed observation; its later isolated full repeat is the
accepted result, without changing production code or test deadlines.

The exact seven candidate tarballs remain in `build/release-423-archives/`.
Pack audits pass names/versions, expanded workspace dependencies, bounded
paths, own licenses/native notices, and absence of known lab password sentinels.
Every exact tarball passes npm dry-run with matching SHA-512; no tarball is
repacked for publication. These checks do not assert unknown-secret detection,
publisher signatures or a blanket legal/vulnerability clearance.

## Actual installed-package RDP

The application imports the installed public package modules and resolves its
native worker from the installed platform runtime, with empty LD_LIBRARY_PATH.
Only lab instrumentation comes from the checkout. Edge uses the public prefixed
HTTP/control/media routes on the host port. Credentials stay in bounded local
helpers/private worker IPC; lab files are not included in the public packages.
The certificate pins approved earlier are preserved on the updated lab IPs.

| Target | Codec / creation path | Final evidence under build/ |
| --- | --- | --- |
| Astra Linux 1.7.5, .56.20 | H.264 / reference form | `iteration-423-astra-h264-form-isolated.log` |
| Astra Linux 1.7.5, .56.20 | JPEG / direct API | `iteration-423-astra-jpeg-api-isolated.log` |
| RED OS 7.3, .56.21 | JPEG / reference form, wallpaper=true | `iteration-423-redos-unlocked-jpeg-form.log` |
| RED OS 7.3, .56.21 | H.264 / direct API | `iteration-423-redos-unlocked-h264-api.log` |

Each passes nonuniform 1920x1080 output, 1280x720 resize, restored 1920x1080,
fresh media configuration/keyframes where applicable, fresh-token reattach,
host HTTP availability, bounded diagnostics (one session/two WS), and joined
native/runtime cleanup. Windows/Linux native strict certificate rejection and
foreign host WS survival are separate external-consumer tests.

The earlier RED OS render failures remain in 422/423. Read-only SSH identifies
the active XRDP :10 session as locked with GNOME ScreenSaver active. After the
user reports their desktop visible, a repeat reads both lock indicators false
(`iteration-423-redos-login-sessions-user-repeat.log`). The final tests above
then pass unchanged. This is a named unlocked desktop acceptance, not proof of
all locked-screen rendering/recovery or the internal cause of earlier failures.
No lock/security policy, service, image predicate or timeout is changed.

## Remaining scope and publication

Fastify's named implementation/distribution acceptance is complete. The
original full V1, other adapters, audio/device/managed-drive gates, standalone
installers and prepared separate delivery Git repositories remain outside this
release and stay in TODO. The next feature uses `feature/nestjs-0.2.2` only
after this release checkpoint, followed by node:http 0.2.3 and Express 0.2.4.
The user will push prepared local delivery repositories to GitHub themselves.

At this release checkpoint, npm publication is **pending**. Authenticated
organization ownership and all seven exact archive dry-runs pass; that does
not establish registry availability. The guarded publisher checks the clean
tag, complete tarball set, exact integrity and absence of conflicting registry
bytes, publishes dependencies before Fastify, and records per-package registry
integrity. Registry publication and a fresh registry-only external consumer
will be appended after actual success. No npm token/OTP is recorded here.
